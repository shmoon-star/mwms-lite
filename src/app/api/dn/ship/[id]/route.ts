import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const dnId = String(id ?? "").trim();

    if (!dnId) {
      return NextResponse.json(
        { ok: false, error: "Invalid DN id" },
        { status: 400 }
      );
    }

    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status, shipped_at, confirmed_at")
      .eq("id", dnId)
      .single();

    if (hErr) throw hErr;

    if (!header?.id) {
      return NextResponse.json(
        { ok: false, error: "DN not found" },
        { status: 404 }
      );
    }

    if (header.status === "SHIPPED") {
      return NextResponse.json({
        ok: true,
        alreadyShipped: true,
      });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, dn_id, sku, qty, qty_picked, qty_packed, qty_shipped")
      .eq("dn_id", dnId);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const sku = line.sku;
      const shipQty = Number(line.qty_packed ?? line.qty_picked ?? line.qty ?? 0);

      const { error: updLineErr } = await sb
        .from("dn_line")
        .update({
          qty_shipped: shipQty,
        })
        .eq("id", line.id);

      if (updLineErr) throw updLineErr;

      const { data: inv, error: invSelErr } = await sb
        .from("inventory")
        .select("sku, qty_onhand, qty_reserved, allocated")
        .eq("sku", sku)
        .single();

      if (invSelErr) throw invSelErr;

      const nextOnhand = Number(inv.qty_onhand ?? 0) - shipQty;
      const nextReserved = Math.max(0, Number(inv.qty_reserved ?? 0) - shipQty);

      const { error: invUpdErr } = await sb
        .from("inventory")
        .update({
          qty_onhand: nextOnhand,
          qty_reserved: nextReserved,
        })
        .eq("sku", sku);

      if (invUpdErr) throw invUpdErr;

      const { data: existingTx, error: txSelErr } = await sb
        .from("inventory_tx")
        .select("id")
        .eq("ref_type", "dn_header")
        .eq("ref_id", dnId)
        .eq("sku", sku)
        .eq("tx_type", "DN_SHIP")
        .maybeSingle();

      if (txSelErr) throw txSelErr;

      if (!existingTx) {
        const { error: txErr } = await sb
          .from("inventory_tx")
          .insert({
            sku,
            tx_type: "DN_SHIP",
            qty_delta: -shipQty,
            ref_type: "dn_header",
            ref_id: dnId,
            note: header.dn_no ? `DN Ship ${header.dn_no}` : "DN Ship",
          });

        if (txErr) throw txErr;
      }
    }

    const now = new Date().toISOString();

    const { error: dnUpdErr } = await sb
      .from("dn_header")
      .update({
        status: "SHIPPED",
        shipped_at: now,
        confirmed_at: now,
      })
      .eq("id", dnId);

    if (dnUpdErr) throw dnUpdErr;

    return NextResponse.json({
      ok: true,
      shipped: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}