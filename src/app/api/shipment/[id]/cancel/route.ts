import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "invalid shipment id" },
        { status: 400 }
      );
    }

    // 1. shipment 조회
    const { data: shipment, error: sErr } = await sb
      .from("shipment_header")
      .select("*")
      .eq("id", id)
      .single();

    if (sErr) throw sErr;
    if (!shipment) throw new Error("shipment not found");

    // 이미 취소된 경우
    if (shipment.status === "CANCELLED") {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    // 2. pallet 조회
    const { data: pallets, error: pErr } = await sb
      .from("pallet_header")
      .select("id")
      .eq("shipment_id", id);

    if (pErr) throw pErr;

    const palletIds = (pallets || []).map((x: any) => x.id);

    // 3. pallet_box 제거 (핵심)
    if (palletIds.length) {
      const { error: delErr } = await sb
        .from("pallet_box")
        .delete()
        .in("pallet_id", palletIds);

      if (delErr) throw delErr;
    }

    // 4. pallet 상태 CANCELLED
    if (palletIds.length) {
      const { error: pUpdateErr } = await sb
        .from("pallet_header")
        .update({ status: "CANCELLED" })
        .in("id", palletIds);

      if (pUpdateErr) throw pUpdateErr;
    }

    // 5. shipment 상태 CANCELLED
    const { error: sUpdateErr } = await sb
      .from("shipment_header")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (sUpdateErr) throw sUpdateErr;

    return NextResponse.json({
      ok: true,
      shipment_id: id,
      cancelled: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}