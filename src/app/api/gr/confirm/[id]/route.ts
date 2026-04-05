import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sb = await createClient();

    const { id: grId } = await context.params;

    if (!grId || typeof grId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid GR id is required" },
        { status: 400 }
      );
    }

    const { data: grHeader, error: grHeaderErr } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status, confirmed_at")
      .eq("id", grId)
      .maybeSingle();

    if (grHeaderErr) throw grHeaderErr;

    if (!grHeader) {
      return NextResponse.json(
        { ok: false, error: `GR not found: ${grId}` },
        { status: 404 }
      );
    }

    if (grHeader.status === "CONFIRMED") {
      return NextResponse.json({
        ok: true,
        message: "Already confirmed",
        gr_id: grHeader.id,
        gr_no: grHeader.gr_no,
      });
    }

    const { data: grLines, error: grLinesErr } = await sb
      .from("gr_line")
      .select("id, gr_id, sku, qty, qty_received, asn_line_id, po_line_id")
      .eq("gr_id", grId);

    if (grLinesErr) throw grLinesErr;

    if (!grLines || grLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No GR lines found" },
        { status: 400 }
      );
    }

    for (const line of grLines) {
      const receivedQty = Number(line.qty_received ?? line.qty ?? 0);

      if (!line.sku) {
        throw new Error(`Missing sku in GR line ${line.id}`);
      }

      if (!Number.isFinite(receivedQty) || receivedQty < 0) {
        throw new Error(`Invalid qty in GR line ${line.id}`);
      }

      // 0 수량은 inventory / tx 반영 스킵
      if (receivedQty === 0) {
        continue;
      }

      const { data: existingInv, error: invSelectErr } = await sb
        .from("inventory")
        .select("sku, qty_onhand")
        .eq("sku", line.sku)
        .maybeSingle();

      if (invSelectErr) throw invSelectErr;

      if (existingInv) {
        const { error: invUpdateErr } = await sb
          .from("inventory")
          .update({
            qty_onhand: Number(existingInv.qty_onhand ?? 0) + receivedQty,
          })
          .eq("sku", line.sku);

        if (invUpdateErr) throw invUpdateErr;
      } else {
        const { error: invInsertErr } = await sb
          .from("inventory")
          .insert({
            sku: line.sku,
            qty_onhand: receivedQty,
            qty_reserved: 0,
            allocated: 0,
          });

        if (invInsertErr) throw invInsertErr;
      }

      const { error: txErr } = await sb
        .from("inventory_tx")
        .insert({
          sku: line.sku,
          tx_type: "GR",
          qty_delta: receivedQty,
          ref_type: "GR",
          ref_id: grId,
          created_at: new Date().toISOString(),
        });

      if (txErr) throw txErr;
    }

    const now = new Date().toISOString();

    const { error: confirmErr } = await sb
      .from("gr_header")
      .update({
        status: "CONFIRMED",
        confirmed_at: now,
      })
      .eq("id", grId);

    if (confirmErr) throw confirmErr;

    // ASN 상태도 같이 종료 처리
    if (grHeader.asn_id) {
      const { error: asnUpdateErr } = await sb
        .from("asn_header")
        .update({
          status: "RECEIVED",
        })
        .eq("id", grHeader.asn_id);

      if (asnUpdateErr) throw asnUpdateErr;
    }

    return NextResponse.json({
      ok: true,
      gr_id: grHeader.id,
      gr_no: grHeader.gr_no,
      asn_id: grHeader.asn_id ?? null,
      confirmed_count: grLines.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}