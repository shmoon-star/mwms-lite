import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function uniqNonEmpty(values: unknown[]) {
  return Array.from(
    new Set(values.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0))
  );
}

function buildSummary(values: string[]) {
  if (values.length === 0) return "-";
  if (values.length === 1) return values[0];
  return `${values[0]} 외 ${values.length - 1}건`;
}

export async function GET(req: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);

    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim().toUpperCase();

    // 1. If BUYER: resolve allowed shipment_ids via dn_header.buyer_id → shipment_dn
    let allowedShipmentIds: string[] | null = null;

    if (profile.role === "BUYER" && buyer?.id) {
      const { data: buyerDns, error: buyerDnsErr } = await sb
        .from("dn_header")
        .select("id")
        .eq("buyer_id", buyer.id);

      if (buyerDnsErr) throw buyerDnsErr;

      const dnIds = (buyerDns ?? []).map((d: any) => d.id).filter(Boolean);

      if (dnIds.length === 0) {
        return NextResponse.json({ ok: true, scope: "BUYER", rows: [] });
      }

      const { data: shipmentDns, error: sdErr } = await sb
        .from("shipment_dn")
        .select("shipment_id")
        .in("dn_id", dnIds);

      if (sdErr) throw sdErr;

      allowedShipmentIds = Array.from(
        new Set((shipmentDns ?? []).map((r: any) => r.shipment_id).filter(Boolean))
      );

      if (allowedShipmentIds.length === 0) {
        return NextResponse.json({ ok: true, scope: "BUYER", rows: [] });
      }
    }

    // 2. Query shipment_header
    let query = sb
      .from("shipment_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (allowedShipmentIds) {
      query = query.in("id", allowedShipmentIds);
    }

    if (status && status !== "ALL" && status !== "ACTIVE") {
      query = query.eq("status", status);
    } else if (!status || status === "ACTIVE") {
      query = query.neq("status", "CANCELLED");
    }

    const { data: headers, error: headerErr } = await query;
    if (headerErr) throw headerErr;

    const shipmentIds = (headers || []).map((x: any) => x.id).filter(Boolean);

    let shipmentDnRows: any[] = [];
    let palletRows: any[] = [];
    let dnHeaders: any[] = [];

    if (shipmentIds.length) {
      const { data: dnData } = await sb
        .from("shipment_dn")
        .select("shipment_id, dn_id")
        .in("shipment_id", shipmentIds);

      shipmentDnRows = dnData || [];

      const dnIds = shipmentDnRows.map((x: any) => x.dn_id).filter(Boolean);

      if (dnIds.length) {
        const { data: dnHeaderData } = await sb
          .from("dn_header")
          .select("id, dn_no, ship_from, ship_to")
          .in("id", dnIds);

        dnHeaders = dnHeaderData || [];
      }

      const { data: palletData } = await sb
        .from("pallet_header")
        .select("shipment_id, id, status, total_boxes, total_qty, total_weight, total_cbm")
        .in("shipment_id", shipmentIds);

      palletRows = palletData || [];
    }

    const dnHeaderMap = new Map<string, any>();
    for (const row of dnHeaders) dnHeaderMap.set(row.id, row);

    const dnCountMap = new Map<string, number>();
    const shipFromMap = new Map<string, string[]>();
    const shipToMap = new Map<string, string[]>();
    const dnSummaryMap = new Map<string, string[]>();

    for (const row of shipmentDnRows) {
      const sid = row.shipment_id;
      const dn = dnHeaderMap.get(row.dn_id);

      dnCountMap.set(sid, (dnCountMap.get(sid) || 0) + 1);

      const ff = shipFromMap.get(sid) || [];
      const tt = shipToMap.get(sid) || [];
      const ss = dnSummaryMap.get(sid) || [];

      if (dn?.ship_from) ff.push(dn.ship_from);
      if (dn?.ship_to) tt.push(dn.ship_to);
      if (dn?.dn_no) ss.push(dn.dn_no);

      shipFromMap.set(sid, ff);
      shipToMap.set(sid, tt);
      dnSummaryMap.set(sid, ss);
    }

    const palletCountMap = new Map<string, number>();
    const totalBoxesMap = new Map<string, number>();
    const totalQtyMap = new Map<string, number>();
    const totalWeightMap = new Map<string, number>();
    const totalCbmMap = new Map<string, number>();

    for (const row of palletRows) {
      const sid = row.shipment_id;
      if (String(row.status || "").toUpperCase() === "CANCELLED") continue;

      palletCountMap.set(sid, (palletCountMap.get(sid) || 0) + 1);
      totalBoxesMap.set(sid, (totalBoxesMap.get(sid) || 0) + safeNum(row.total_boxes));
      totalQtyMap.set(sid, (totalQtyMap.get(sid) || 0) + safeNum(row.total_qty));
      totalWeightMap.set(sid, (totalWeightMap.get(sid) || 0) + safeNum(row.total_weight));
      totalCbmMap.set(sid, (totalCbmMap.get(sid) || 0) + safeNum(row.total_cbm));
    }

    const rows = (headers || []).map((row: any) => ({
      id: row.id,
      shipment_no: row.shipment_no,
      status: row.status || "OPEN",
      bl_no: row.bl_no || null,
      eta: row.eta || null,
      etd: row.etd || null,
      atd: row.atd || null,
      ata: row.ata || null,
      vessel_name: row.vessel_name || null,
      container_no: row.container_no || null,
      seal_no: row.seal_no || null,
      remark: row.remark || null,
      created_at: row.created_at || null,
      dn_count: dnCountMap.get(row.id) || 0,
      pallet_count: palletCountMap.get(row.id) || 0,
      total_boxes: totalBoxesMap.get(row.id) || 0,
      total_qty: totalQtyMap.get(row.id) || 0,
      total_weight: totalWeightMap.get(row.id) || 0,
      total_cbm: totalCbmMap.get(row.id) || 0,
      ship_from_summary: buildSummary(uniqNonEmpty(shipFromMap.get(row.id) || [])),
      ship_to_summary: buildSummary(uniqNonEmpty(shipToMap.get(row.id) || [])),
      dn_summary: buildSummary(uniqNonEmpty(dnSummaryMap.get(row.id) || [])),
    }));

    return NextResponse.json({ ok: true, scope: profile.role, buyer_code: buyer?.buyer_code ?? null, rows });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
