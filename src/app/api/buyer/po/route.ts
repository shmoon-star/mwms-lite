import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);

    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.trim() ?? "";

    let query = sb
      .from("po_header")
      .select("id, po_no, vendor_id, buyer_id, status, eta, created_at")
      .order("created_at", { ascending: false });

    if (profile.role === "BUYER" && buyer?.id) {
      query = query.eq("buyer_id", buyer.id);
    }
    if (status) query = query.eq("status", status);

    const { data: pos, error: posErr } = await query;
    if (posErr) throw posErr;

    const poList = pos ?? [];
    if (poList.length === 0) {
      return NextResponse.json({ ok: true, scope: profile.role, buyer_code: buyer?.buyer_code ?? null, data: [] });
    }

    const poIds = poList.map((p: any) => p.id as string);
    const poNos = poList.map((p: any) => p.po_no as string).filter(Boolean);

    // ── Vendor names ──────────────────────────────────────────
    const vendorIds = [...new Set(poList.map((p: any) => p.vendor_id).filter(Boolean))] as string[];
    const vendorMap = new Map<string, { vendor_code: string; vendor_name: string | null }>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await sb.from("vendor").select("id, vendor_code, vendor_name").in("id", vendorIds);
      for (const v of vendors ?? []) vendorMap.set(v.id, { vendor_code: v.vendor_code, vendor_name: v.vendor_name });
    }

    // ── PO Qty (po_line) ──────────────────────────────────────
    const poQtyMap = new Map<string, number>();
    {
      const { data: poLines } = await sb.from("po_line").select("po_id, qty_ordered").in("po_id", poIds);
      for (const l of poLines ?? []) {
        poQtyMap.set(l.po_id, safeNum(poQtyMap.get(l.po_id)) + safeNum(l.qty_ordered));
      }
    }

    // ── ASN headers linked to these POs ───────────────────────
    // Direct: asn_header.po_id in poIds
    // Indirect: asn_header.source_type=PACKING_LIST → packing_list_header.po_no in poNos
    const asnByPoId = new Map<string, any[]>(); // po_id → [asn_header]

    // Direct ASNs
    const { data: directAsns } = await sb
      .from("asn_header")
      .select("id, asn_no, po_id, source_type, source_id, status")
      .in("po_id", poIds);

    for (const a of directAsns ?? []) {
      const arr = asnByPoId.get(a.po_id) ?? [];
      arr.push(a);
      asnByPoId.set(a.po_id, arr);
    }

    // Indirect ASNs via PACKING_LIST
    const { data: plHeaders } = await sb
      .from("packing_list_header")
      .select("id, po_no")
      .in("po_no", poNos);

    const plPoNoMap = new Map<string, string>(); // pl_id → po_no
    for (const pl of plHeaders ?? []) plPoNoMap.set(pl.id, pl.po_no);

    const plIds = (plHeaders ?? []).map((pl: any) => pl.id as string);
    if (plIds.length > 0) {
      const { data: plAsns } = await sb
        .from("asn_header")
        .select("id, asn_no, po_id, source_type, source_id, status")
        .eq("source_type", "PACKING_LIST")
        .in("source_id", plIds);

      for (const a of plAsns ?? []) {
        const poNo = plPoNoMap.get(a.source_id);
        if (!poNo) continue;
        const po = poList.find((p: any) => p.po_no === poNo);
        if (!po) continue;
        // Avoid duplicates (already added via direct)
        const arr = asnByPoId.get(po.id) ?? [];
        if (!arr.find((x: any) => x.id === a.id)) {
          arr.push({ ...a, po_id: po.id });
          asnByPoId.set(po.id, arr);
        }
      }
    }

    // ── All ASN IDs ───────────────────────────────────────────
    const allAsnIds: string[] = [];
    for (const asns of asnByPoId.values()) for (const a of asns) allAsnIds.push(a.id);

    // ── ASN lines → qty ───────────────────────────────────────
    const asnQtyByAsnId = new Map<string, number>();
    const asnLineIdToAsnId = new Map<string, string>();

    if (allAsnIds.length > 0) {
      const { data: asnLines } = await sb
        .from("asn_line")
        .select("id, asn_id, qty_expected, qty")
        .in("asn_id", allAsnIds);

      for (const l of asnLines ?? []) {
        const q = safeNum(l.qty_expected) || safeNum(l.qty);
        asnQtyByAsnId.set(l.asn_id, safeNum(asnQtyByAsnId.get(l.asn_id)) + q);
        asnLineIdToAsnId.set(l.id, l.asn_id);
      }
    }

    // ── GR lines → received qty ───────────────────────────────
    const receivedQtyByAsnId = new Map<string, number>();
    const asnLineIds = [...asnLineIdToAsnId.keys()];

    if (asnLineIds.length > 0) {
      const { data: grLines } = await sb
        .from("gr_line")
        .select("asn_line_id, qty_received, qty")
        .in("asn_line_id", asnLineIds);

      for (const l of grLines ?? []) {
        const asnId = asnLineIdToAsnId.get(l.asn_line_id);
        if (!asnId) continue;
        const q = safeNum(l.qty_received) || safeNum(l.qty);
        receivedQtyByAsnId.set(asnId, safeNum(receivedQtyByAsnId.get(asnId)) + q);
      }
    }

    // ── GR headers → status ───────────────────────────────────
    const grByAsnId = new Map<string, any>();
    if (allAsnIds.length > 0) {
      const { data: grHeaders } = await sb
        .from("gr_header")
        .select("id, asn_id, gr_no, status, confirmed_at")
        .in("asn_id", allAsnIds);

      // Pick latest per ASN
      for (const g of grHeaders ?? []) {
        const prev = grByAsnId.get(g.asn_id);
        if (!prev || new Date(g.confirmed_at || g.id) > new Date(prev.confirmed_at || prev.id)) {
          grByAsnId.set(g.asn_id, g);
        }
      }
    }

    // ── Assemble response ─────────────────────────────────────
    const enriched = poList.map((p: any) => {
      const v = vendorMap.get(p.vendor_id);
      const asns = asnByPoId.get(p.id) ?? [];

      const po_qty = safeNum(poQtyMap.get(p.id));
      let asn_qty = 0;
      let received_qty = 0;
      let gr_status: string | null = null;
      let gr_confirmed_at: string | null = null;

      const asn_list: { asn_no: string | null; asn_qty: number; received_qty: number; computed_status: string; gr_status: string | null }[] = [];

      for (const a of asns) {
        const aQty = safeNum(asnQtyByAsnId.get(a.id));
        const rQty = safeNum(receivedQtyByAsnId.get(a.id));
        asn_qty += aQty;
        received_qty += rQty;

        const gr = grByAsnId.get(a.id);
        if (gr) {
          gr_status = gr.status;
          gr_confirmed_at = gr.confirmed_at;
        }

        const computed_status =
          aQty <= 0 ? "OPEN"
          : rQty <= 0 ? "OPEN"
          : rQty < aQty ? "PARTIAL_RECEIVED"
          : "FULL_RECEIVED";

        asn_list.push({
          asn_no: a.asn_no ?? null,
          asn_qty: aQty,
          received_qty: rQty,
          computed_status,
          gr_status: gr?.status ?? null,
        });
      }

      const balance_qty = po_qty - asn_qty;

      return {
        id: p.id,
        po_no: p.po_no,
        vendor_code: v?.vendor_code ?? "-",
        vendor_name: v?.vendor_name ?? "-",
        buyer_id: p.buyer_id,
        status: p.status,
        eta: p.eta,
        created_at: p.created_at,
        po_qty,
        asn_qty,
        received_qty,
        balance_qty,
        gr_status,
        gr_confirmed_at,
        asn_count: asns.length,
        asn_list,
      };
    });

    return NextResponse.json({
      ok: true,
      scope: profile.role,
      buyer_code: buyer?.buyer_code ?? null,
      data: enriched,
    });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
