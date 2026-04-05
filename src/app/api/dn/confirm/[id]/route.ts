import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: dnId } = await context.params;

    if (!dnId || typeof dnId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid DN id is required" },
        { status: 400 }
      );
    }

    const { data: dnHeader, error: dnHeaderErr } = await supabase
      .from("dn_header")
      .select("*")
      .eq("id", dnId)
      .maybeSingle();

    if (dnHeaderErr) throw dnHeaderErr;

    if (!dnHeader) {
      return NextResponse.json(
        { ok: false, error: `DN not found: ${dnId}` },
        { status: 404 }
      );
    }

    if (dnHeader.status === "SHIPPED") {
      return NextResponse.json({
        ok: true,
        message: "Already confirmed",
        dn_id: dnHeader.id,
        dn_no: dnHeader.dn_no,
      });
    }

    const { data: dnLines, error: dnLinesErr } = await supabase
      .from("dn_lines")
      .select("*")
      .eq("dn_id", dnId);

    if (dnLinesErr) throw dnLinesErr;

    if (!dnLines || dnLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No DN lines found" },
        { status: 400 }
      );
    }

    for (const line of dnLines) {
      const shipQty = Number(line.qty_shipped ?? 0);

      if (!line.sku) {
        throw new Error(`Missing sku in DN line ${line.id}`);
      }

      if (!Number.isFinite(shipQty) || shipQty <= 0) {
        throw new Error(`Invalid qty_shipped in DN line ${line.id}`);
      }

      const { data: invRow, error: invErr } = await supabase
        .from("inventory")
        .select("sku, qty_onhand, qty_reserved, allocated")
        .eq("sku", line.sku)
        .maybeSingle();

      if (invErr) throw invErr;
      if (!invRow) throw new Error(`Inventory not found for SKU ${line.sku}`);

      const currentOnhand = Number(invRow.qty_onhand ?? 0);
      const currentReserved = Number(invRow.qty_reserved ?? 0);

      if (currentOnhand < shipQty) {
        throw new Error(
          `Insufficient onhand for SKU ${line.sku}: onhand=${currentOnhand}, ship=${shipQty}`
        );
      }

      if (currentReserved < shipQty) {
        throw new Error(
          `Insufficient reserved qty for SKU ${line.sku}: reserved=${currentReserved}, ship=${shipQty}`
        );
      }

      const { error: invUpdateErr } = await supabase
        .from("inventory")
        .update({
          qty_onhand: currentOnhand - shipQty,
          qty_reserved: currentReserved - shipQty,
        })
        .eq("sku", line.sku);

      if (invUpdateErr) throw invUpdateErr;

      const { error: txErr } = await supabase
        .from("inventory_tx")
        .insert({
          sku: line.sku,
          tx_type: "DN_SHIP",
          qty_delta: -shipQty,
          ref_type: "DN",
          ref_id: dnId,
          created_at: new Date().toISOString(),
        });

      if (txErr) throw txErr;
    }

    const now = new Date().toISOString();

const { error: confirmErr } = await supabase
  .from("dn_header")
  .update({
    status: "SHIPPED",
    confirmed_at: now,
    shipped_at: dnHeader.shipped_at ?? now,
  })
  .eq("id", dnId);

    if (confirmErr) throw confirmErr;

    return NextResponse.json({
      ok: true,
      dn_id: dnHeader.id,
      dn_no: dnHeader.dn_no,
      confirmed_count: dnLines.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}