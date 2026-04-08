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

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; palletId: string }> }
) {
  try {
    const { id: shipmentId, palletId } = await context.params;
    const sb = await createClient();

    if (!isUuid(shipmentId) || !isUuid(palletId)) {
      return NextResponse.json(
        { ok: false, error: "invalid shipmentId or palletId" },
        { status: 400 }
      );
    }

    const { data: pallet, error: palletErr } = await sb
      .from("pallet_header")
      .select("*")
      .eq("id", palletId)
      .eq("shipment_id", shipmentId)
      .single();

    if (palletErr || !pallet) {
      return NextResponse.json(
        { ok: false, error: palletErr?.message || "pallet not found" },
        { status: 404 }
      );
    }

    if (String(pallet.status || "").toUpperCase() === "CANCELLED") {
      return NextResponse.json({
        ok: true,
        alreadyCancelled: true,
      });
    }

    const { error: deleteBoxErr } = await sb
      .from("pallet_box")
      .delete()
      .eq("pallet_id", palletId);

    if (deleteBoxErr) {
      return NextResponse.json(
        { ok: false, error: deleteBoxErr.message },
        { status: 500 }
      );
    }

    const { data: updated, error: updateErr } = await sb
      .from("pallet_header")
      .update({
        status: "CANCELLED",
        total_boxes: 0,
        total_qty: 0,
        total_weight: 0,
        total_cbm: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", palletId)
      .eq("shipment_id", shipmentId)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { ok: false, error: updateErr?.message || "failed to cancel pallet" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      pallet: updated,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}