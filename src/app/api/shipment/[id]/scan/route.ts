import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isUuid(v: unknown) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await context.params;
    const sb = await createClient();
    const body = await req.json();

    const palletId = String(body?.pallet_id || "").trim();
    const boxNoRaw = String(body?.box_no || "").trim();

    if (!isUuid(shipmentId)) {
      return NextResponse.json(
        { ok: false, error: "invalid shipment id" },
        { status: 400 }
      );
    }

    if (!isUuid(palletId)) {
      return NextResponse.json(
        { ok: false, error: "invalid pallet_id" },
        { status: 400 }
      );
    }

    if (!boxNoRaw) {
      return NextResponse.json(
        { ok: false, error: "box_no is required" },
        { status: 400 }
      );
    }

    const boxNoNum = Number(boxNoRaw);
    if (!Number.isFinite(boxNoNum)) {
      return NextResponse.json(
        { ok: false, error: "box_no must be numeric" },
        { status: 400 }
      );
    }

    const { data: pallet, error: palletErr } = await sb
      .from("pallet_header")
      .select("id, shipment_id, pallet_no, status")
      .eq("id", palletId)
      .eq("shipment_id", shipmentId)
      .single();

    if (palletErr || !pallet) {
      return NextResponse.json(
        { ok: false, error: palletErr?.message || "pallet not found" },
        { status: 404 }
      );
    }

    if (String(pallet.status || "").toUpperCase() === "CLOSED") {
      return NextResponse.json(
        { ok: false, error: "closed pallet cannot be scanned" },
        { status: 400 }
      );
    }

    const { data: shipmentDnRows, error: shipmentDnErr } = await sb
      .from("shipment_dn")
      .select("dn_id")
      .eq("shipment_id", shipmentId);

    if (shipmentDnErr) {
      return NextResponse.json(
        { ok: false, error: shipmentDnErr.message },
        { status: 500 }
      );
    }

    const allowedDnIds = (shipmentDnRows || [])
      .map((x: any) => x.dn_id)
      .filter(isUuid);

    if (!allowedDnIds.length) {
      return NextResponse.json(
        { ok: false, error: "shipment has no dn mapping" },
        { status: 400 }
      );
    }

    // dn_box 기준 조회
    const { data: boxRows, error: boxErr } = await sb
      .from("dn_box")
      .select(
        "id, dn_id, box_no, status, remarks, packed_at, created_at, box_type, box_weight_kg"
      )
      .in("dn_id", allowedDnIds)
      .eq("box_no", boxNoNum)
      .order("created_at", { ascending: false });

    if (boxErr) {
      return NextResponse.json(
        { ok: false, error: boxErr.message },
        { status: 500 }
      );
    }

    const matched = (boxRows || []).filter((row: any) => {
      const st = String(row.status || "").toUpperCase();
      return ["CLOSED", "PACKED"].includes(st);
    });

    if (!matched.length) {
      return NextResponse.json(
        { ok: false, error: "box not found" },
        { status: 404 }
      );
    }

    if (matched.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "duplicate box_no found across shipment DNs. use unique box numbering or add DN-qualified input",
        },
        { status: 400 }
      );
    }

    const box = matched[0];

    const { data: existsByBoxId, error: existsErr } = await sb
      .from("pallet_box")
      .select("id, pallet_id, shipment_id, box_id, box_barcode")
      .eq("box_id", box.id)
      .maybeSingle();

    if (existsErr) {
      return NextResponse.json(
        { ok: false, error: existsErr.message },
        { status: 500 }
      );
    }

    if (existsByBoxId) {
      return NextResponse.json(
        { ok: false, error: "box already assigned to pallet" },
        { status: 400 }
      );
    }

    // dn_box_item 집계
    const { data: itemRows, error: itemErr } = await sb
      .from("dn_box_item")
      .select("qty")
      .eq("dn_box_id", box.id);

    if (itemErr) {
      return NextResponse.json(
        { ok: false, error: itemErr.message },
        { status: 500 }
      );
    }

    const totalQty = (itemRows || []).reduce(
      (sum: number, row: any) => sum + safeNum(row.qty),
      0
    );

    // 박스 1개당 weight 1개
    const totalWeight = safeNum((box as any).box_weight_kg);

    const insertPayload = {
      pallet_id: palletId,
      shipment_id: shipmentId,
      dn_id: box.dn_id,
      box_id: box.id,
      box_barcode: String(box.box_no), // 화면 표시용
      carton_no: String(box.box_no),
      qty: totalQty,
      weight: totalWeight,
      cbm: 0,
    };

    const { data: inserted, error: insertErr } = await sb
      .from("pallet_box")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { ok: false, error: insertErr?.message || "failed to insert pallet_box" },
        { status: 500 }
      );
    }

    const { data: palletBoxes, error: palletBoxesErr } = await sb
      .from("pallet_box")
      .select("qty, weight, cbm")
      .eq("pallet_id", palletId);

    if (palletBoxesErr) {
      return NextResponse.json(
        { ok: false, error: palletBoxesErr.message },
        { status: 500 }
      );
    }

    const totalBoxes = (palletBoxes || []).length;
    const palletTotalQty = (palletBoxes || []).reduce(
      (sum: number, row: any) => sum + safeNum(row.qty),
      0
    );
    const palletTotalWeight = (palletBoxes || []).reduce(
      (sum: number, row: any) => sum + safeNum(row.weight),
      0
    );
    const palletTotalCbm = (palletBoxes || []).reduce(
      (sum: number, row: any) => sum + safeNum(row.cbm),
      0
    );

    const { error: palletUpdateErr } = await sb
      .from("pallet_header")
      .update({
        total_boxes: totalBoxes,
        total_qty: palletTotalQty,
        total_weight: palletTotalWeight,
        total_cbm: palletTotalCbm,
        updated_at: new Date().toISOString(),
      })
      .eq("id", palletId);

    if (palletUpdateErr) {
      return NextResponse.json(
        { ok: false, error: palletUpdateErr.message },
        { status: 500 }
      );
    }

    // shipment 상태를 OPEN -> PALLETIZING 으로 승격
    const { data: shipmentHeader } = await sb
      .from("shipment_header")
      .select("id, status")
      .eq("id", shipmentId)
      .maybeSingle();

    if (shipmentHeader && String(shipmentHeader.status || "").toUpperCase() === "OPEN") {
      await sb
        .from("shipment_header")
        .update({
          status: "PALLETIZING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", shipmentId);
    }

    return NextResponse.json({
      ok: true,
      scanned: inserted,
      pallet_summary: {
        total_boxes: totalBoxes,
        total_qty: palletTotalQty,
        total_weight: palletTotalWeight,
        total_cbm: palletTotalCbm,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}