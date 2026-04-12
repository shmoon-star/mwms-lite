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
    const sb = await createClient();

    if (!dnId) {
      return NextResponse.json(
        { ok: false, error: "Invalid DN id" },
        { status: 400 }
      );
    }

    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status")
      .eq("id", dnId)
      .single();

    if (hErr) throw hErr;

    if (!header?.id) {
      return NextResponse.json(
        { ok: false, error: "DN not found" },
        { status: 404 }
      );
    }

    if (header.status === "RESERVED") {
      return NextResponse.json({ ok: true, alreadyReserved: true });
    }

    if (["PICKED", "PACKED", "SHIPPED"].includes(String(header.status))) {
      return NextResponse.json({ ok: true, alreadyReserved: true });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_lines")
      .select("id, sku, qty_ordered")
      .eq("dn_id", dnId);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const sku = line.sku;
      const qty = Number(line.qty_ordered ?? 0);

      const { data: inv, error: invSelErr } = await sb
        .from("inventory")
        .select("sku, qty_reserved")
        .eq("sku", sku)
        .single();

      if (invSelErr) throw invSelErr;

      const { error: invUpdErr } = await sb
        .from("inventory")
        .update({
          qty_reserved: Number(inv.qty_reserved ?? 0) + qty,
        })
        .eq("sku", sku);

      if (invUpdErr) throw invUpdErr;

      const { data: existingTx, error: txSelErr } = await sb
        .from("inventory_tx")
        .select("id")
        .eq("ref_type", "dn_header")
        .eq("ref_id", dnId)
        .eq("sku", sku)
        .eq("tx_type", "DN_RESERVE")
        .maybeSingle();

      if (txSelErr) throw txSelErr;

      if (!existingTx) {
        const { error: txErr } = await sb
          .from("inventory_tx")
          .insert({
            sku,
            tx_type: "DN_RESERVE",
            qty_delta: qty,
            ref_type: "dn_header",
            ref_id: dnId,
            note: header.dn_no ? `DN Reserve ${header.dn_no}` : "DN Reserve",
          });

        if (txErr) throw txErr;
      }
    }

    const { error: updErr } = await sb
      .from("dn_header")
      .update({
        status: "RESERVED",
        reserved_at: new Date().toISOString(),
      })
      .eq("id", dnId);

    if (updErr) throw updErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}