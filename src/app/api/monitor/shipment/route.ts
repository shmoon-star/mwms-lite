import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = await createClient();

    // 1) Shipment headers
    const { data: shipments, error: shipErr } = await sb
      .from("shipment_header")
      .select("id, shipment_no, status, bl_no, eta, etd, vessel_name, container_no, created_at, closed_at")
      .order("created_at", { ascending: false });

    if (shipErr) throw shipErr;

    const shipmentIds = (shipments ?? []).map((s: any) => s.id).filter(Boolean);

    if (shipmentIds.length === 0) {
      return NextResponse.json({ ok: true, items: [], summary: { total: 0, open: 0, closed: 0 } });
    }

    // 2) shipment_dn — get dn_id list per shipment
    const { data: shipDns, error: sdErr } = await sb
      .from("shipment_dn")
      .select("shipment_id, dn_id")
      .in("shipment_id", shipmentIds);

    if (sdErr) throw sdErr;

    // Build dn_id → dn_header map
    const allDnIds = Array.from(new Set((shipDns ?? []).map((r: any) => r.dn_id).filter(Boolean)));
    let dnHeaders: any[] = [];
    if (allDnIds.length > 0) {
      const { data } = await sb
        .from("dn_header")
        .select("id, dn_no, status, ship_from, ship_to, planned_gi_date, planned_delivery_date, shipped_at")
        .in("id", allDnIds);
      dnHeaders = data ?? [];
    }
    const dnMap = new Map(dnHeaders.map((d: any) => [d.id, d]));

    // Group dn_ids by shipment_id
    const shipDnMap = new Map<string, string[]>();
    for (const row of (shipDns ?? [])) {
      if (!shipDnMap.has(row.shipment_id)) shipDnMap.set(row.shipment_id, []);
      shipDnMap.get(row.shipment_id)!.push(row.dn_id);
    }

    // 3) Pallet count — DISTINCT by pallet id to avoid double-counting
    //    (same pallet can appear for multiple DNs in a shipment)
    const { data: pallets } = await sb
      .from("pallet_header")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds);

    const palletIdSetMap = new Map<string, Set<string>>();
    for (const p of (pallets ?? [])) {
      if (!palletIdSetMap.has(p.shipment_id)) palletIdSetMap.set(p.shipment_id, new Set());
      palletIdSetMap.get(p.shipment_id)!.add(p.id);
    }
    const palletCountMap = new Map<string, number>();
    for (const [sid, idSet] of palletIdSetMap) palletCountMap.set(sid, idSet.size);

    // 4) Build items
    const items = (shipments ?? []).map((s: any) => {
      const dnIds = shipDnMap.get(s.id) ?? [];
      const dns = dnIds.map((dnId: string) => dnMap.get(dnId)).filter(Boolean);

      const totalOrdered = dns.reduce((sum: number, dn: any) => sum + 0, 0); // qty will be 0 without lines, kept for structure
      const dnList = dns.map((dn: any) => ({
        id: dn.id,
        dn_no: dn.dn_no,
        status: dn.status,
        ship_from: dn.ship_from,
        ship_to: dn.ship_to,
        planned_gi_date: dn.planned_gi_date,
        planned_delivery_date: dn.planned_delivery_date,
        shipped_at: dn.shipped_at,
      }));

      const s_status = String(s.status || "").toUpperCase();
      const isClosed = s_status === "CLOSED" || s_status === "CONFIRMED";

      return {
        id: s.id,
        shipment_no: s.shipment_no,
        status: s.status,
        bl_no: s.bl_no,
        eta: s.eta,
        etd: s.etd,
        vessel_name: s.vessel_name,
        container_no: s.container_no,
        created_at: s.created_at,
        closed_at: s.closed_at,
        dn_count: dnIds.length,
        pallet_count: palletCountMap.get(s.id) || 0,
        dn_list: dnList,
        is_closed: isClosed,
      };
    });

    const summary = {
      total: items.length,
      open: items.filter((r) => !r.is_closed).length,
      closed: items.filter((r) => r.is_closed).length,
    };

    return NextResponse.json({ ok: true, items, summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
