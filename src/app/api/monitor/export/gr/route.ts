import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

function esc(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  "gr_no",
  "asn_no",
  "po_no",
  "vendor_code",
  "vendor_name",
  "gr_status",
  "confirmed_at",
  "sku",
  "barcode",
  "description",
  "qty_expected",
  "qty_received",
  "balance",
  "created_at",
];

export async function GET() {
  try {
    const sb = await createClient();

    // ── 1. GR Headers ─────────────────────────────────────────────────────────
    const { data: grHeaders, error: grErr } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status, created_at, confirmed_at")
      .order("created_at", { ascending: false });

    if (grErr) throw grErr;
    if (!grHeaders || grHeaders.length === 0) {
      return emptyCsv();
    }

    const grHeaderMap = new Map(grHeaders.map((h: any) => [String(h.id), h]));

    // ── 2. GR Lines ───────────────────────────────────────────────────────────
    const grIds = grHeaders.map((h: any) => h.id);
    const { data: grLines, error: grLineErr } = await sb
      .from("gr_line")
      .select("id, gr_id, asn_line_id, qty_expected, qty_received")
      .in("gr_id", grIds);

    if (grLineErr) throw grLineErr;

    // ── 3. ASN Lines (need asn_id for the fallback path) ──────────────────────
    const asnLineIds = Array.from(
      new Set((grLines ?? []).map((l: any) => l.asn_line_id).filter(Boolean))
    );
    let asnLines: any[] = [];
    if (asnLineIds.length > 0) {
      const { data } = await sb
        .from("asn_line")
        .select("id, asn_id, sku, qty_expected, qty")
        .in("id", asnLineIds);
      asnLines = data ?? [];
    }
    const asnLineMap = new Map(asnLines.map((l: any) => [String(l.id), l]));

    // ── 4. Resolve all unique ASN IDs ─────────────────────────────────────────
    //   • primary:  gr_header.asn_id
    //   • fallback: asn_line.asn_id  (when gr_header.asn_id is NULL)
    const asnIdSet = new Set<string>();
    for (const h of grHeaders) {
      if (h.asn_id) asnIdSet.add(String(h.asn_id));
    }
    for (const l of asnLines) {
      if (l.asn_id) asnIdSet.add(String(l.asn_id));
    }
    const asnIds = Array.from(asnIdSet);

    // ── 5. ASN Headers ────────────────────────────────────────────────────────
    //   asn_header has: po_id (FK), vendor_id, source_type, source_id
    //   → po_no must be fetched from po_header or packing_list_header
    let asnHeaders: any[] = [];
    if (asnIds.length > 0) {
      const { data } = await sb
        .from("asn_header")
        .select("id, asn_no, po_id, vendor_id, source_type, source_id")
        .in("id", asnIds);
      asnHeaders = data ?? [];
    }
    const asnMap = new Map(asnHeaders.map((a: any) => [String(a.id), a]));

    // ── 6. PO Headers (for po_no via asn_header.po_id) ───────────────────────
    const poIds = Array.from(
      new Set(asnHeaders.map((a: any) => a.po_id).filter(Boolean))
    );
    const poMap = new Map<string, string>(); // id → po_no
    if (poIds.length > 0) {
      const { data } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("id", poIds);
      for (const p of data ?? []) poMap.set(String(p.id), p.po_no ?? "");
    }

    // ── 7. Packing List Headers (for po_no when source_type = PACKING_LIST) ───
    const plIds = Array.from(
      new Set(
        asnHeaders
          .filter((a: any) => String(a.source_type ?? "").toUpperCase() === "PACKING_LIST" && a.source_id)
          .map((a: any) => a.source_id)
      )
    );
    const plPoMap = new Map<string, string>(); // pl_id → po_no
    if (plIds.length > 0) {
      const { data } = await sb
        .from("packing_list_header")
        .select("id, po_no")
        .in("id", plIds);
      for (const p of data ?? []) plPoMap.set(String(p.id), p.po_no ?? "");
    }

    // ── 8. Vendors ────────────────────────────────────────────────────────────
    const vendorIds = Array.from(
      new Set(asnHeaders.map((a: any) => a.vendor_id).filter(Boolean))
    );
    const vendorMap = new Map<string, any>();
    if (vendorIds.length > 0) {
      const { data } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);
      for (const v of data ?? []) vendorMap.set(String(v.id), v);
    }

    // ── 9. Products for description ───────────────────────────────────────────
    const skuSet = Array.from(
      new Set(asnLines.map((l: any) => l.sku).filter(Boolean))
    );
    const productMaster = await loadProductsBySkus(skuSet, sb);

    // ── 10. Helper: resolve PO No for an ASN header ───────────────────────────
    function resolvePoNo(asn: any): string {
      if (!asn) return "";
      if (asn.po_id) return poMap.get(String(asn.po_id)) ?? "";
      if (String(asn.source_type ?? "").toUpperCase() === "PACKING_LIST" && asn.source_id)
        return plPoMap.get(String(asn.source_id)) ?? "";
      return "";
    }

    // ── 11. Build rows ────────────────────────────────────────────────────────
    const rows: string[] = [];

    const grIdsWithLines = new Set<string>();

    for (const line of grLines ?? []) {
      grIdsWithLines.add(String(line.gr_id));

      const grH = grHeaderMap.get(String(line.gr_id));
      const asnLine = line.asn_line_id ? asnLineMap.get(String(line.asn_line_id)) : null;

      // Resolve ASN: gr_header.asn_id first, then asn_line.asn_id
      const resolvedAsnId =
        (grH?.asn_id ? String(grH.asn_id) : null) ??
        (asnLine?.asn_id ? String(asnLine.asn_id) : null);
      const asn = resolvedAsnId ? asnMap.get(resolvedAsnId) : null;
      const vendor = asn?.vendor_id ? vendorMap.get(String(asn.vendor_id)) : null;

      const expected = Number(line.qty_expected ?? asnLine?.qty_expected ?? asnLine?.qty ?? 0);
      const received = Number(line.qty_received ?? 0);
      const balance = Math.max(expected - received, 0);

      rows.push(
        [
          grH?.gr_no ?? "",
          asn?.asn_no ?? "",
          resolvePoNo(asn),
          vendor?.vendor_code ?? "",
          vendor?.vendor_name ?? "",
          grH?.status ?? "",
          grH?.confirmed_at ?? "",
          asnLine?.sku ?? "",
          asnLine?.sku ? (productMaster.barcodeOf(asnLine.sku) ?? "") : "",
          asnLine?.sku ? (productMaster.nameOf(asnLine.sku) ?? "") : "",
          expected,
          received,
          balance,
          grH?.created_at ?? "",
        ]
          .map(esc)
          .join(",")
      );
    }

    // GR headers with no lines → still include as blank-line rows
    for (const grH of grHeaders) {
      if (grIdsWithLines.has(String(grH.id))) continue;
      const resolvedAsnId = grH.asn_id ? String(grH.asn_id) : null;
      const asn = resolvedAsnId ? asnMap.get(resolvedAsnId) : null;
      const vendor = asn?.vendor_id ? vendorMap.get(String(asn.vendor_id)) : null;

      rows.push(
        [
          grH.gr_no ?? "",
          asn?.asn_no ?? "",
          resolvePoNo(asn),
          vendor?.vendor_code ?? "",
          vendor?.vendor_name ?? "",
          grH.status ?? "",
          grH.confirmed_at ?? "",
          "", "", "", 0, 0, 0,
          grH.created_at ?? "",
        ]
          .map(esc)
          .join(",")
      );
    }

    const csv = "\uFEFF" + [CSV_HEADERS.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gr_detail_export.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

function emptyCsv() {
  return new NextResponse("\uFEFF" + CSV_HEADERS.join(",") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gr_detail_export.csv"`,
    },
  });
}
