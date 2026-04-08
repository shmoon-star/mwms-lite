import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildPalletNo(seq: number) {
  return `PLT-${String(seq).padStart(3, "0")}`;
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { id: shipmentId } = await context.params;
    const sb = await createClient();

    const { data: shipment, error: shipmentErr } = await sb
      .from("shipment_header")
      .select("id, shipment_no, status")
      .eq("id", shipmentId)
      .single();

    if (shipmentErr || !shipment) {
      return NextResponse.json(
        { ok: false, error: shipmentErr?.message || "shipment not found" },
        { status: 404 }
      );
    }

    const { data: existing, error: existingErr } = await sb
      .from("pallet_header")
      .select("id")
      .eq("shipment_id", shipmentId);

    if (existingErr) {
      return NextResponse.json(
        { ok: false, error: existingErr.message },
        { status: 500 }
      );
    }

    const palletNo = buildPalletNo((existing?.length || 0) + 1);

    const { data: pallet, error: palletErr } = await sb
      .from("pallet_header")
      .insert({
        shipment_id: shipmentId,
        pallet_no: palletNo,
        status: "OPEN",
      })
      .select("*")
      .single();

    if (palletErr || !pallet) {
      return NextResponse.json(
        { ok: false, error: palletErr?.message || "failed to create pallet" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      pallet,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}