import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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

    let dnHeaders: any[] = [];
    if (dnIds.length) {
      const { data, error } = await sb
        .from("dn_header")
        .select("id, dn_no, ship_from, ship_to, status")
        .in("id", dnIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      dnHeaders = data || [];
    }

    const dnMap = new Map<string, any>();
    for (const row of dnHeaders) {
      dnMap.set(row.id, row);
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

    const pallets = palletsRaw || [];
    const palletIds = pallets.map((x: any) => x.id).filter(Boolean);

    const palletMap = new Map<string, any>();
    for (const row of pallets) {
      palletMap.set(row.id, row);
    }

    let boxRows: any[] = [];
    if (palletIds.length) {
      const { data, error } = await sb
        .from("pallet_box")
        .select("*")
        .in("pallet_id", palletIds)
        .order("scanned_at", { ascending: true });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      boxRows = data || [];
    }

    const headers = [
      "shipment_no",
      "shipment_status",
      "bl_no",
      "etd",
      "eta",
      "atd",
      "ata",
      "vessel_name",
      "container_no",
      "seal_no",
      "remark",
      "dn_no",
      "dn_status",
      "ship_from",
      "ship_to",
      "pallet_no",
      "pallet_status",
      "pallet_boxes",
      "pallet_qty",
      "pallet_weight",
      "pallet_cbm",
      "pallet_length",
      "pallet_width",
      "pallet_height",
      "box_no",
      "carton_no",
      "box_qty",
      "box_weight",
      "box_cbm",
      "scanned_at",
    ];

    const rows: string[] = [];

    if (boxRows.length > 0) {
      for (const box of boxRows) {
        const pallet = palletMap.get(box.pallet_id);
        const dn = dnMap.get(box.dn_id);

        const row = [
          header.shipment_no,
          header.status,
          header.bl_no,
          header.etd,
          header.eta,
          header.atd,
          header.ata,
          header.vessel_name,
          header.container_no,
          header.seal_no,
          header.remark,
          dn?.dn_no || "",
          dn?.status || "",
          dn?.ship_from || "",
          dn?.ship_to || "",
          pallet?.pallet_no || "",
          pallet?.status || "",
          safeNum(pallet?.total_boxes),
          safeNum(pallet?.total_qty),
          safeNum(pallet?.total_weight),
          safeNum(pallet?.total_cbm),
          safeNum(pallet?.length),
          safeNum(pallet?.width),
          safeNum(pallet?.height),
          box.box_barcode || "",
          box.carton_no || "",
          safeNum(box.qty),
          safeNum(box.weight),
          safeNum(box.cbm),
          box.scanned_at || "",
        ];

        rows.push(row.map(csvEscape).join(","));
      }
    } else {
      for (const pallet of pallets) {
        const row = [
          header.shipment_no,
          header.status,
          header.bl_no,
          header.etd,
          header.eta,
          header.atd,
          header.ata,
          header.vessel_name,
          header.container_no,
          header.seal_no,
          header.remark,
          "",
          "",
          "",
          "",
          pallet.pallet_no || "",
          pallet.status || "",
          safeNum(pallet.total_boxes),
          safeNum(pallet.total_qty),
          safeNum(pallet.total_weight),
          safeNum(pallet.total_cbm),
          safeNum(pallet.length),
          safeNum(pallet.width),
          safeNum(pallet.height),
          "",
          "",
          "",
          "",
          "",
          "",
        ];

        rows.push(row.map(csvEscape).join(","));
      }
    }

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="shipment_detail_${header.shipment_no}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}