import { NextRequest, NextResponse } from "next/server";
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

function buildShipmentNo() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `SH-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const body = await req.json();

    const rawDnIds = Array.isArray(body?.dn_ids) ? body.dn_ids : [];
    const dnIds = rawDnIds.filter(isUuid);

    if (!dnIds.length) {
      return NextResponse.json(
        { ok: false, error: "valid dn_ids is required" },
        { status: 400 }
      );
    }

    if (rawDnIds.length !== dnIds.length) {
      return NextResponse.json(
        { ok: false, error: "some dn_ids are invalid" },
        { status: 400 }
      );
    }

    const uniqueDnIds = Array.from(new Set(dnIds));

    // DN 존재 확인
    const { data: dnRows, error: dnErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status")
      .in("id", uniqueDnIds);

    if (dnErr) {
      return NextResponse.json(
        { ok: false, error: dnErr.message },
        { status: 500 }
      );
    }

    if (!dnRows || dnRows.length !== uniqueDnIds.length) {
      return NextResponse.json(
        { ok: false, error: "some dn_ids do not exist in dn_header" },
        { status: 400 }
      );
    }

    // 이미 active shipment에 연결된 DN 방어
    const { data: existingLinks, error: existingLinksErr } = await sb
      .from("shipment_dn")
      .select("shipment_id, dn_id")
      .in("dn_id", uniqueDnIds);

    if (existingLinksErr) {
      return NextResponse.json(
        { ok: false, error: existingLinksErr.message },
        { status: 500 }
      );
    }

    const existingShipmentIds = Array.from(
      new Set((existingLinks || []).map((x: any) => x.shipment_id).filter(Boolean))
    );

    if (existingShipmentIds.length > 0) {
      const { data: existingShipments, error: existingShipmentsErr } = await sb
        .from("shipment_header")
        .select("id, shipment_no, status")
        .in("id", existingShipmentIds);

      if (existingShipmentsErr) {
        return NextResponse.json(
          { ok: false, error: existingShipmentsErr.message },
          { status: 500 }
        );
      }

      const activeShipmentIdSet = new Set(
        (existingShipments || [])
          .filter((x: any) => String(x.status || "").toUpperCase() !== "CANCELLED")
          .map((x: any) => x.id)
      );

      const conflictedDnIds = (existingLinks || [])
        .filter((x: any) => activeShipmentIdSet.has(x.shipment_id))
        .map((x: any) => x.dn_id);

      if (conflictedDnIds.length > 0) {
        const conflictedDnIdSet = new Set(conflictedDnIds);
        const conflictedDns = (dnRows || []).filter((x: any) =>
          conflictedDnIdSet.has(x.id)
        );

        return NextResponse.json(
          {
            ok: false,
            error: `DN already belongs to active shipment: ${conflictedDns
              .map((x: any) => x.dn_no || x.id)
              .join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    const shipmentNo = buildShipmentNo();

    const { data: shipment, error: shipmentErr } = await sb
      .from("shipment_header")
      .insert({
        shipment_no: shipmentNo,
        status: "OPEN",
      })
      .select("id, shipment_no, status")
      .single();

    if (shipmentErr || !shipment) {
      return NextResponse.json(
        {
          ok: false,
          error: shipmentErr?.message || "failed to create shipment",
        },
        { status: 500 }
      );
    }

    const shipmentDnRows = uniqueDnIds.map((dnId) => ({
      shipment_id: shipment.id,
      dn_id: dnId,
    }));

    const { error: mapErr } = await sb.from("shipment_dn").insert(shipmentDnRows);

    if (mapErr) {
      await sb.from("shipment_header").delete().eq("id", shipment.id);

      return NextResponse.json(
        {
          ok: false,
          error: mapErr.message || "failed to create shipment_dn",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      shipment: {
        id: shipment.id,
        shipment_no: shipment.shipment_no,
        status: shipment.status,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}