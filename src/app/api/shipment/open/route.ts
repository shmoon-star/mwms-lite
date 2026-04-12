import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();

    // ── 1. Shipment headers ───────────────────────────────────────────────
    let query = sb
      .from("shipment_header")
      .select("id, shipment_no, status, bl_no, eta, etd, vessel_name, container_no, created_at, closed_at")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data: headers, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const shipmentIds = (headers || []).map((x: any) => x.id);
    if (shipmentIds.length === 0) return NextResponse.json({ ok: true, rows: [] });

    // ── 2. shipment_dn → dn_header (DN numbers + status) ─────────────────
    const { data: sdRows } = await sb
      .from("shipment_dn")
      .select("shipment_id, dn_id")
      .in("shipment_id", shipmentIds);

    const dnIds = [...new Set((sdRows || []).map((r: any) => r.dn_id).filter(Boolean))];

    let dnInfoMap = new Map<string, { dn_no: string; status: string }>();
    if (dnIds.length > 0) {
      const { data: dnRows } = await sb
        .from("dn_header")
        .select("id, dn_no, status")
        .in("id", dnIds);
      for (const d of dnRows || []) {
        dnInfoMap.set(d.id, { dn_no: d.dn_no ?? d.id, status: d.status ?? "OPEN" });
      }
    }

    // shipment_id → DN list
    const dnListByShipment = new Map<string, { id: string; dn_no: string; status: string }[]>();
    for (const r of sdRows || []) {
      const info = dnInfoMap.get(r.dn_id);
      if (!info) continue;
      const arr = dnListByShipment.get(r.shipment_id) ?? [];
      arr.push({ id: r.dn_id, dn_no: info.dn_no, status: info.status });
      dnListByShipment.set(r.shipment_id, arr);
    }

    // ── 3. dn_box — box count + weight per DN ─────────────────────────────
    let boxCountByDn = new Map<string, number>();
    let weightByDn = new Map<string, number>();
    let boxIds: string[] = [];

    if (dnIds.length > 0) {
      const { data: boxRows } = await sb
        .from("dn_box")
        .select("id, dn_id, box_weight_kg, status")
        .in("dn_id", dnIds);

      for (const b of boxRows || []) {
        boxCountByDn.set(b.dn_id, (boxCountByDn.get(b.dn_id) ?? 0) + 1);
        if (b.box_weight_kg != null) {
          weightByDn.set(b.dn_id, (weightByDn.get(b.dn_id) ?? 0) + Number(b.box_weight_kg));
        }
        boxIds.push(b.id);
      }
    }

    // ── 4. dn_box_item — packed qty per DN ────────────────────────────────
    let packedQtyByDn = new Map<string, number>();

    if (boxIds.length > 0) {
      // Need dn_box_id → dn_id mapping
      const { data: allBoxRows } = await sb
        .from("dn_box")
        .select("id, dn_id")
        .in("id", boxIds);
      const boxDnMap = new Map<string, string>();
      for (const b of allBoxRows || []) boxDnMap.set(b.id, b.dn_id);

      const { data: itemRows } = await sb
        .from("dn_box_item")
        .select("dn_box_id, qty")
        .in("dn_box_id", boxIds);

      for (const item of itemRows || []) {
        const dnId = boxDnMap.get(item.dn_box_id);
        if (!dnId) continue;
        packedQtyByDn.set(dnId, (packedQtyByDn.get(dnId) ?? 0) + Number(item.qty ?? 0));
      }
    }

    // ── 5. Pallet count — DISTINCT by pallet id ──────────────────────────
    // A shipment may have DN-A and DN-B both linked to Pallet-1.
    // We must count unique pallet IDs, not raw row count.
    const { data: palletRows } = await sb
      .from("pallet_header")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds);

    // shipment_id → Set<pallet_id>  (deduplicates same pallet appearing for multiple DNs)
    const palletIdSetByShipment = new Map<string, Set<string>>();
    for (const p of palletRows || []) {
      if (!palletIdSetByShipment.has(p.shipment_id)) {
        palletIdSetByShipment.set(p.shipment_id, new Set());
      }
      palletIdSetByShipment.get(p.shipment_id)!.add(p.id);
    }
    const palletMap = new Map<string, number>();
    for (const [sid, idSet] of palletIdSetByShipment) {
      palletMap.set(sid, idSet.size);
    }

    // ── 6. Assemble ───────────────────────────────────────────────────────
    const rows = (headers || []).map((x: any) => {
      const dnList = dnListByShipment.get(x.id) ?? [];

      let totalBoxes = 0;
      let totalWeightKg = 0;
      let hasWeight = false;
      let totalPackedQty = 0;

      for (const dn of dnList) {
        totalBoxes += boxCountByDn.get(dn.id) ?? 0;
        const w = weightByDn.get(dn.id);
        if (w != null) { totalWeightKg += w; hasWeight = true; }
        totalPackedQty += packedQtyByDn.get(dn.id) ?? 0;
      }

      return {
        id: x.id,
        shipment_no: x.shipment_no,
        status: x.status,
        bl_no: x.bl_no ?? null,
        eta: x.eta ?? null,
        etd: x.etd ?? null,
        vessel_name: x.vessel_name ?? null,
        container_no: x.container_no ?? null,
        created_at: x.created_at,
        closed_at: x.closed_at ?? null,
        dn_list: dnList,
        dn_count: dnList.length,
        pallet_count: palletMap.get(x.id) ?? 0,
        box_count: totalBoxes,
        total_weight_kg: hasWeight ? Math.round(totalWeightKg * 100) / 100 : null,
        total_packed_qty: totalPackedQty,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unexpected error" }, { status: 500 });
  }
}
