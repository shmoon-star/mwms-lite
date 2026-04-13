import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function uniqNonEmpty(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((x) => String(x ?? "").trim())
        .filter((x) => x.length > 0)
    )
  );
}

function buildSummary(values: string[]) {
  if (values.length === 0) return "-";
  if (values.length === 1) return values[0];
  return `${values[0]} 외 ${values.length - 1}건`;
}

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim().toUpperCase();

    let query = sb
      .from("shipment_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && status !== "ALL" && status !== "ACTIVE") {
      query = query.eq("status", status);
    } else if (!status || status === "ACTIVE") {
      query = query.neq("status", "CANCELLED");
    }

    const { data: headers, error: headerErr } = await query;

    if (headerErr) {
      return NextResponse.json(
        { ok: false, error: headerErr.message },
        { status: 500 }
      );
    }

    const shipmentIds = (headers || []).map((x: any) => x.id).filter(Boolean);

    let shipmentDnRows: any[] = [];
    let palletRows: any[] = [];
    let dnHeaders: any[] = [];

    if (shipmentIds.length) {
      const { data: dnData, error: dnErr } = await sb
        .from("shipment_dn")
        .select("shipment_id, dn_id")
        .in("shipment_id", shipmentIds);

      if (dnErr) {
        return NextResponse.json(
          { ok: false, error: dnErr.message },
          { status: 500 }
        );
      }

      shipmentDnRows = dnData || [];

      const dnIds = shipmentDnRows.map((x: any) => x.dn_id).filter(Boolean);

      if (dnIds.length) {
        const { data: dnHeaderData, error: dnHeaderErr } = await sb
          .from("dn_header")
          .select("id, dn_no, ship_from, ship_to")
          .in("id", dnIds);

        if (dnHeaderErr) {
          return NextResponse.json(
            { ok: false, error: dnHeaderErr.message },
            { status: 500 }
          );
        }

        dnHeaders = dnHeaderData || [];
      }

      const { data: palletData, error: palletErr } = await sb
        .from("pallet_header")
        .select(
          "shipment_id, id, status, total_boxes, total_qty, total_weight, total_cbm"
        )
        .in("shipment_id", shipmentIds);

      if (palletErr) {
        return NextResponse.json(
          { ok: false, error: palletErr.message },
          { status: 500 }
        );
      }

      palletRows = palletData || [];
    }

    // shipment_files counts
    const fileCountMap = new Map<string, number>();
    if (shipmentIds.length) {
      const { data: fileRows } = await sb
        .from("shipment_files")
        .select("shipment_id")
        .in("shipment_id", shipmentIds);
      for (const row of fileRows ?? []) {
        fileCountMap.set(row.shipment_id, (fileCountMap.get(row.shipment_id) ?? 0) + 1);
      }
    }

    const dnHeaderMap = new Map<string, any>();
    for (const row of dnHeaders) {
      dnHeaderMap.set(row.id, row);
    }

    const dnCountMap = new Map<string, number>();
    const shipFromMap = new Map<string, string[]>();
    const shipToMap = new Map<string, string[]>();
    const dnSummaryMap = new Map<string, string[]>();

    for (const row of shipmentDnRows) {
      const shipmentId = row.shipment_id;
      const dn = dnHeaderMap.get(row.dn_id);

      dnCountMap.set(shipmentId, (dnCountMap.get(shipmentId) || 0) + 1);

      const shipFromList = shipFromMap.get(shipmentId) || [];
      const shipToList = shipToMap.get(shipmentId) || [];
      const dnSummaryList = dnSummaryMap.get(shipmentId) || [];

      if (dn?.ship_from) shipFromList.push(dn.ship_from);
      if (dn?.ship_to) shipToList.push(dn.ship_to);
      if (dn?.dn_no) dnSummaryList.push(dn.dn_no);

      shipFromMap.set(shipmentId, shipFromList);
      shipToMap.set(shipmentId, shipToList);
      dnSummaryMap.set(shipmentId, dnSummaryList);
    }

    const palletCountMap = new Map<string, number>();
    const totalBoxesMap = new Map<string, number>();
    const totalQtyMap = new Map<string, number>();
    const totalWeightMap = new Map<string, number>();
    const totalCbmMap = new Map<string, number>();

    // Deduplicate by pallet id — same pallet linked to multiple DNs must count as 1
    const seenPalletIds = new Set<string>();
    for (const row of palletRows) {
      const shipmentId = row.shipment_id;
      const st = String(row.status || "").toUpperCase();

      if (st === "CANCELLED") continue;
      if (seenPalletIds.has(row.id)) continue;
      seenPalletIds.add(row.id);

      palletCountMap.set(shipmentId, (palletCountMap.get(shipmentId) || 0) + 1);
      totalBoxesMap.set(
        shipmentId,
        (totalBoxesMap.get(shipmentId) || 0) + safeNum(row.total_boxes)
      );
      totalQtyMap.set(
        shipmentId,
        (totalQtyMap.get(shipmentId) || 0) + safeNum(row.total_qty)
      );
      totalWeightMap.set(
        shipmentId,
        (totalWeightMap.get(shipmentId) || 0) + safeNum(row.total_weight)
      );
      totalCbmMap.set(
        shipmentId,
        (totalCbmMap.get(shipmentId) || 0) + safeNum(row.total_cbm)
      );
    }

    const rows = (headers || []).map((row: any) => {
      const shipFromValues = uniqNonEmpty(shipFromMap.get(row.id) || []);
      const shipToValues = uniqNonEmpty(shipToMap.get(row.id) || []);
      const dnValues = uniqNonEmpty(dnSummaryMap.get(row.id) || []);

      return {
        id: row.id,
        shipment_no: row.shipment_no,
        status: row.status || "OPEN",
        bl_no: row.bl_no || null,
        eta: row.eta || null,
        etd: row.etd || null,
        atd: row.atd || null,
        ata: row.ata || null,
        buyer_gr_date: row.buyer_gr_date || null,
        vessel_name: row.vessel_name || null,
        container_no: row.container_no || null,
        seal_no: row.seal_no || null,
        remark: row.remark || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        closed_at: row.closed_at || null,
        cancelled_at: row.cancelled_at || null,
        dn_count: dnCountMap.get(row.id) || 0,
        pallet_count: palletCountMap.get(row.id) || 0,
        total_boxes: totalBoxesMap.get(row.id) || 0,
        total_qty: totalQtyMap.get(row.id) || 0,
        total_weight: totalWeightMap.get(row.id) || 0,
        total_cbm: totalCbmMap.get(row.id) || 0,
        ship_from_summary: buildSummary(shipFromValues),
        ship_to_summary: buildSummary(shipToValues),
        dn_summary: buildSummary(dnValues),
        doc_count: fileCountMap.get(row.id) ?? 0,
      };
    });

    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}