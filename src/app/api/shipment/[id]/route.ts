import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(v: unknown) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    console.log("shipment detail id:", id);

    if (!isUuid(id)) {
      return NextResponse.json(
        { ok: false, error: `invalid shipment id: ${id}` },
        { status: 400 }
      );
    }

    const { data: header, error: headerErr } = await sb
      .from("shipment_header")
      .select("*")
      .eq("id", id)
      .single();

    if (headerErr || !header) {
      return NextResponse.json(
        { ok: false, error: headerErr?.message || "shipment not found" },
        { status: 404 }
      );
    }

    const { data: shipmentDnRows, error: shipmentDnErr } = await sb
      .from("shipment_dn")
      .select("dn_id")
      .eq("shipment_id", id);

    if (shipmentDnErr) {
      return NextResponse.json(
        { ok: false, error: shipmentDnErr.message },
        { status: 500 }
      );
    }

    const rawDnIds = (shipmentDnRows || []).map((x: any) => x.dn_id);
    console.log("shipment raw dn_ids:", rawDnIds);

    const dnIds = rawDnIds.filter(isUuid);

    if (rawDnIds.length !== dnIds.length) {
      console.error("invalid dn_ids found in shipment_dn:", rawDnIds);
    }

    let dnRows: any[] = [];
    if (dnIds.length) {
      const { data, error } = await sb
        .from("dn_header")
        .select("id, dn_no, status, created_at, ship_to")
        .in("id", dnIds)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      dnRows = data || [];
    }

    const { data: pallets, error: palletErr } = await sb
      .from("pallet_header")
      .select("*")
      .eq("shipment_id", id)
      .order("created_at", { ascending: true });

    if (palletErr) {
      return NextResponse.json(
        { ok: false, error: palletErr.message },
        { status: 500 }
      );
    }

    const palletIds = (pallets || []).map((x: any) => x.id).filter(isUuid);

    let recentScans: any[] = [];
    if (palletIds.length) {
      const { data: scans, error: scanErr } = await sb
        .from("pallet_box")
        .select(`
          id,
          pallet_id,
          shipment_id,
          dn_id,
          box_barcode,
          carton_no,
          qty,
          weight,
          cbm,
          scanned_at
        `)
        .in("pallet_id", palletIds)
        .order("scanned_at", { ascending: false })
        .limit(30);

      if (scanErr) {
        return NextResponse.json(
          { ok: false, error: scanErr.message },
          { status: 500 }
        );
      }

      recentScans = scans || [];
    }

    return NextResponse.json({
      ok: true,
      header,
      dns: dnRows,
      pallets: pallets || [],
      recent_scans: recentScans,
    });
  } catch (e: any) {
    console.error("shipment detail route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}