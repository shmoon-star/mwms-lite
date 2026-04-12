import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";
// products lookup inline

export const dynamic = "force-dynamic";

function esc(v: unknown) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "shipment_no", "shipment_status", "bl_no", "etd", "eta", "atd", "ata", "buyer_gr_date", "vessel_name", "container_no",
  "dn_no", "dn_status", "ship_from", "ship_to", "planned_gi_date", "planned_delivery_date", "shipped_at",
  "pallet_no", "pallet_length", "pallet_width", "pallet_height", "pallet_weight_kg", "pallet_cbm",
  "box_no", "box_type", "box_weight_kg",
  "sku", "barcode", "description", "qty",
  "created_at",
];

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);
    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    // ── 1. Resolve buyer-scoped shipment IDs ─────────────────────────────────
    let allowedShipmentIds: string[] | null = null;

    if (profile.role === "BUYER" && buyer?.id) {
      // buyer_id → dn_ids → shipment_ids
      const { data: buyerDns } = await sb
        .from("dn_header")
        .select("id")
        .eq("buyer_id", buyer.id);

      const dnIds = (buyerDns ?? []).map((d: any) => d.id).filter(Boolean);

      if (dnIds.length === 0) {
        return emptyResponse();
      }

      const { data: sdRows } = await sb
        .from("shipment_dn")
        .select("shipment_id")
        .in("dn_id", dnIds)
        .not("shipment_id", "is", null);

      allowedShipmentIds = Array.from(
        new Set((sdRows ?? []).map((r: any) => r.shipment_id).filter(Boolean))
      );

      if (allowedShipmentIds.length === 0) {
        return emptyResponse();
      }
    }

    // ── 2. Shipment headers ──────────────────────────────────────────────────
    let shipQuery = sb
      .from("shipment_header")
      .select("id, shipment_no, status, bl_no, eta, etd, atd, ata, buyer_gr_date, vessel_name, container_no, created_at")
      .order("created_at", { ascending: false });

    if (allowedShipmentIds) {
      shipQuery = shipQuery.in("id", allowedShipmentIds);
    }

    const { data: shipments } = await shipQuery;
    const shipmentIds = (shipments ?? []).map((s: any) => s.id).filter(Boolean);

    if (shipmentIds.length === 0) {
      return emptyResponse();
    }

    // ── 3. shipment_dn → dn_ids ──────────────────────────────────────────────
    const { data: shipDns } = await sb
      .from("shipment_dn")
      .select("shipment_id, dn_id")
      .in("shipment_id", shipmentIds);

    const allDnIds = Array.from(new Set((shipDns ?? []).map((r: any) => r.dn_id).filter(Boolean)));

    // shipment_id → dn_id[]
    const shipDnMap = new Map<string, string[]>();
    for (const row of shipDns ?? []) {
      if (!shipDnMap.has(row.shipment_id)) shipDnMap.set(row.shipment_id, []);
      shipDnMap.get(row.shipment_id)!.push(row.dn_id);
    }

    // ── 4. DN headers ────────────────────────────────────────────────────────
    let dnHeaders: any[] = [];
    if (allDnIds.length > 0) {
      const { data } = await sb
        .from("dn_header")
        .select("id, dn_no, status, ship_from, ship_to, planned_gi_date, planned_delivery_date, shipped_at")
        .in("id", allDnIds);
      dnHeaders = data ?? [];
    }
    const dnMap = new Map(dnHeaders.map((d: any) => [d.id, d]));

    // ── 5. DN boxes ──────────────────────────────────────────────────────────
    let dnBoxes: any[] = [];
    if (allDnIds.length > 0) {
      const { data } = await sb
        .from("dn_box")
        .select("id, dn_id, box_no, box_type, box_weight_kg, status")
        .in("dn_id", allDnIds);
      dnBoxes = data ?? [];
    }
    const dnBoxMap = new Map<string, any[]>();
    for (const box of dnBoxes) {
      if (!dnBoxMap.has(box.dn_id)) dnBoxMap.set(box.dn_id, []);
      dnBoxMap.get(box.dn_id)!.push(box);
    }
    const allBoxIds = dnBoxes.map((b: any) => b.id).filter(Boolean);

    // ── 6. DN box items (SKU + qty) ──────────────────────────────────────────
    let boxItems: any[] = [];
    if (allBoxIds.length > 0) {
      const { data } = await sb
        .from("dn_box_item")
        .select("dn_box_id, sku, qty")
        .in("dn_box_id", allBoxIds);
      boxItems = data ?? [];
    }
    const boxItemMap = new Map<string, any[]>();
    for (const item of boxItems) {
      if (!boxItemMap.has(item.dn_box_id)) boxItemMap.set(item.dn_box_id, []);
      boxItemMap.get(item.dn_box_id)!.push(item);
    }

    // ── 7. Pallets ───────────────────────────────────────────────────────────
    const { data: palletData } = await sb
      .from("pallet_header")
      .select("id, shipment_id, pallet_no, length, width, height, total_weight, total_cbm, status")
      .in("shipment_id", shipmentIds);

    const pallets = (palletData ?? []).filter(
      (p: any) => String(p.status || "").toUpperCase() !== "CANCELLED"
    );
    const palletMap = new Map(pallets.map((p: any) => [p.id, p]));
    const allPalletIds = pallets.map((p: any) => p.id).filter(Boolean);

    // ── 8. pallet_box: box_id → pallet_id ───────────────────────────────────
    let palletBoxes: any[] = [];
    if (allPalletIds.length > 0) {
      const { data } = await sb
        .from("pallet_box")
        .select("pallet_id, box_id")
        .in("pallet_id", allPalletIds);
      palletBoxes = data ?? [];
    }
    const boxPalletMap = new Map<string, string>();
    for (const pb of palletBoxes) {
      if (pb.box_id) boxPalletMap.set(pb.box_id, pb.pallet_id);
    }

    // ── 9. Products (barcode + description) ────────────────────────────
    const skuSet = [...new Set(boxItems.map((i: any) => i.sku).filter(Boolean))];
    const productMap = new Map<string, any>();
    if (skuSet.length > 0) {
      const { data: products } = await sb.from("products").select("sku, name, barcode").in("sku", skuSet);
      for (const p of products ?? []) productMap.set(p.sku, p);
    }

    // ── 10. Ship map ─────────────────────────────────────────────────────────
    const shipMap = new Map((shipments ?? []).map((s: any) => [s.id, s]));

    // ── 11. Build CSV rows ───────────────────────────────────────────────────
    function makeRow(ship: any, dn: any, pallet: any, box: any, item: any) {
      const product = item?.sku ? productMap.get(item.sku) : null;
      return [
        ship?.shipment_no ?? "",
        ship?.status ?? "",
        ship?.bl_no ?? "",
        ship?.etd ?? "",
        ship?.eta ?? "",
        ship?.atd ?? "",
        ship?.ata ?? "",
        ship?.buyer_gr_date ?? "",
        ship?.vessel_name ?? "",
        ship?.container_no ?? "",
        dn?.dn_no ?? "",
        dn?.status ?? "",
        dn?.ship_from ?? "",
        dn?.ship_to ?? "",
        dn?.planned_gi_date ?? "",
        dn?.planned_delivery_date ?? "",
        dn?.shipped_at ?? "",
        pallet?.pallet_no ?? "",
        pallet?.length ?? "",
        pallet?.width ?? "",
        pallet?.height ?? "",
        pallet?.total_weight ?? "",
        pallet?.total_cbm ?? "",
        box?.box_no ?? "",
        box?.box_type ?? "",
        box?.box_weight_kg ?? "",
        item?.sku ?? "",
        product?.barcode ?? "",
        product?.name ?? "",
        item?.qty ?? "",
        ship?.created_at ?? "",
      ].map(esc).join(",");
    }

    const rows: string[] = [];

    for (const shipId of shipmentIds) {
      const ship = shipMap.get(shipId);
      if (!ship) continue;

      const dnIds = shipDnMap.get(shipId);
      if (!dnIds || dnIds.length === 0) {
        rows.push(makeRow(ship, null, null, null, null));
        continue;
      }

      for (const dnId of dnIds) {
        const dn = dnMap.get(dnId);
        const boxes = dnBoxMap.get(dnId);

        if (!boxes || boxes.length === 0) {
          rows.push(makeRow(ship, dn ?? null, null, null, null));
          continue;
        }

        for (const box of boxes) {
          const palletId = boxPalletMap.get(box.id);
          const pallet = palletId ? palletMap.get(palletId) : null;
          const items = boxItemMap.get(box.id);

          if (!items || items.length === 0) {
            rows.push(makeRow(ship, dn ?? null, pallet ?? null, box, null));
            continue;
          }

          for (const item of items) {
            rows.push(makeRow(ship, dn ?? null, pallet ?? null, box, item));
          }
        }
      }
    }

    const csv = "\uFEFF" + [CSV_HEADERS.join(","), ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buyer_shipment_detail.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

function emptyResponse() {
  return new NextResponse("\uFEFF" + CSV_HEADERS.join(",") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buyer_shipment_detail.csv"`,
    },
  });
}
