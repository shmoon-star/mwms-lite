import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; palletId: string }> }
) {
  try {
    const { id: shipmentId, palletId } = await context.params;
    const sb = await createClient();
    const body = await req.json();

    const length = safeNum(body?.length);
    const width = safeNum(body?.width);
    const height = safeNum(body?.height);
    const close = Boolean(body?.close);

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

    if (close) {
      if (length <= 0 || width <= 0 || height <= 0) {
        return NextResponse.json(
          { ok: false, error: "length / width / height are required before close" },
          { status: 400 }
        );
      }

      // 박스 1개 이상 필수
      const { data: boxes } = await sb
        .from("pallet_box")
        .select("id")
        .eq("pallet_id", palletId);

      if (!boxes || boxes.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot close pallet without any scanned boxes" },
          { status: 400 }
        );
      }
    }

    const updatePayload: any = {
      length,
      width,
      height,
      updated_at: new Date().toISOString(),
    };

    if (close) {
      updatePayload.status = "CLOSED";
      updatePayload.closed_at = new Date().toISOString();
    }

    const { data, error } = await sb
      .from("pallet_header")
      .update(updatePayload)
      .eq("id", palletId)
      .eq("shipment_id", shipmentId)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "failed to update pallet" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      pallet: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}