import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();

    let query = sb
      .from("shipment_header")
      .select(`
        id,
        shipment_no,
        status,
        bl_no,
        eta,
        etd,
        vessel_name,
        container_no,
        created_at,
        closed_at
      `)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: headers, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const shipmentIds = (headers || []).map((x) => x.id);

    let dnMap: Record<string, number> = {};
    let palletMap: Record<string, number> = {};

    if (shipmentIds.length) {
      const { data: dnRows } = await sb
        .from("shipment_dn")
        .select("shipment_id")
        .in("shipment_id", shipmentIds);

      const { data: palletRows } = await sb
        .from("pallet_header")
        .select("shipment_id")
        .in("shipment_id", shipmentIds);

      dnMap = (dnRows || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.shipment_id] = (acc[row.shipment_id] || 0) + 1;
        return acc;
      }, {});

      palletMap = (palletRows || []).reduce(
        (acc: Record<string, number>, row: any) => {
          acc[row.shipment_id] = (acc[row.shipment_id] || 0) + 1;
          return acc;
        },
        {}
      );
    }

    const rows = (headers || []).map((x: any) => ({
      ...x,
      dn_count: dnMap[x.id] || 0,
      pallet_count: palletMap[x.id] || 0,
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}