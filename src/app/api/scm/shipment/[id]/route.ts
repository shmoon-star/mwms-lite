import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullableString(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function deriveShipmentStatus(currentStatus: string, atd: string | null, ata: string | null) {
  if (ata) return "ARRIVED";
  if (atd) return "SHIPPED";
  return currentStatus || "OPEN";
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

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
      .select("shipment_id, dn_id")
      .eq("shipment_id", id);

    if (shipmentDnErr) {
      return NextResponse.json(
        { ok: false, error: shipmentDnErr.message },
        { status: 500 }
      );
    }

    const dnIds = (shipmentDnRows || []).map((x: any) => x.dn_id).filter(Boolean);

    let dns: any[] = [];
    if (dnIds.length) {
      const { data: dnHeaders, error: dnErr } = await sb
        .from("dn_header")
        .select("*")
        .in("id", dnIds)
        .order("created_at", { ascending: false });

      if (dnErr) {
        return NextResponse.json(
          { ok: false, error: dnErr.message },
          { status: 500 }
        );
      }

      dns = (dnHeaders || []).map((row: any) => ({
        id: row.id,
        dn_no: row.dn_no || "-",
        status: row.status || "OPEN",
        ship_from: row.ship_from || null,
        ship_to: row.ship_to || null,
        created_at: row.created_at || null,
        confirmed_at: row.confirmed_at || null,
      }));
    }

    const { data: palletsRaw, error: palletErr } = await sb
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

    const pallets = (palletsRaw || []).map((row: any) => ({
      id: row.id,
      pallet_no: row.pallet_no,
      status: row.status || "OPEN",
      total_boxes: safeNum(row.total_boxes),
      total_qty: safeNum(row.total_qty),
      total_weight: safeNum(row.total_weight),
      total_cbm: safeNum(row.total_cbm),
      length: safeNum(row.length),
      width: safeNum(row.width),
      height: safeNum(row.height),
      created_at: row.created_at || null,
      closed_at: row.closed_at || null,
    }));

    const palletIds = pallets.map((x: any) => x.id).filter(Boolean);

    let boxes: any[] = [];
    if (palletIds.length) {
      const { data: boxRows, error: boxErr } = await sb
        .from("pallet_box")
        .select("*")
        .in("pallet_id", palletIds)
        .order("scanned_at", { ascending: true });

      if (boxErr) {
        return NextResponse.json(
          { ok: false, error: boxErr.message },
          { status: 500 }
        );
      }

      boxes = (boxRows || []).map((row: any) => ({
        id: row.id,
        pallet_id: row.pallet_id,
        dn_id: row.dn_id || null,
        box_id: row.box_id || null,
        box_no: row.box_barcode || null,
        carton_no: row.carton_no || null,
        qty: safeNum(row.qty),
        weight: safeNum(row.weight),
        cbm: safeNum(row.cbm),
        scanned_at: row.scanned_at || null,
      }));
    }

    return NextResponse.json({
      ok: true,
      header: {
        id: header.id,
        shipment_no: header.shipment_no,
        status: header.status || "OPEN",
        bl_no: header.bl_no || null,
        eta: header.eta || null,
        etd: header.etd || null,
        atd: header.atd || null,
        ata: header.ata || null,
        vessel_name: header.vessel_name || null,
        container_no: header.container_no || null,
        seal_no: header.seal_no || null,
        remark: header.remark || null,
        created_at: header.created_at || null,
        updated_at: header.updated_at || null,
        closed_at: header.closed_at || null,
        cancelled_at: header.cancelled_at || null,
      },
      dns,
      pallets,
      boxes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sb = await createClient();
    const body = await req.json();

    const atd = toNullableString(body?.atd);
    const ata = toNullableString(body?.ata);

    const { data: existing, error: existingErr } = await sb
      .from("shipment_header")
      .select("id, status")
      .eq("id", id)
      .single();

    if (existingErr || !existing) {
      return NextResponse.json(
        { ok: false, error: existingErr?.message || "shipment not found" },
        { status: 404 }
      );
    }

    const nextStatus = deriveShipmentStatus(existing.status, atd, ata);

    const updatePayload = {
      bl_no: toNullableString(body?.bl_no),
      eta: toNullableString(body?.eta),
      etd: toNullableString(body?.etd),
      atd,
      ata,
      vessel_name: toNullableString(body?.vessel_name),
      container_no: toNullableString(body?.container_no),
      seal_no: toNullableString(body?.seal_no),
      remark: toNullableString(body?.remark),
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await sb
      .from("shipment_header")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "failed to update shipment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      header: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}