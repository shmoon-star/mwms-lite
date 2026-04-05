import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function idFromPath(req: Request) {
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request, context: { params: any }) {
  try {
    const p = await context?.params;
    const id = String((p?.id || idFromPath(req) || "")).trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status, shipped_at")
      .eq("id", id)
      .single();

    if (hErr) throw hErr;
    if (!header) throw new Error("DN not found");

    if (header.status === "SHIPPED") {
      return NextResponse.json({ ok: true, alreadyShipped: true, status: "SHIPPED" }, { status: 200 });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, sku, qty, qty_picked, qty_packed, qty_shipped")
      .eq("dn_id", id);

    if (lErr) throw lErr;
    if (!lines || lines.length === 0) {
      return NextResponse.json({ ok: false, error: "No DN lines" }, { status: 400 });
    }

    for (const line of lines) {
      const sku = String(line.sku ?? "").trim();
      const qty = Number(line.qty ?? 0);
      const picked = Number(line.qty_picked ?? 0);
      const packed = Number(line.qty_packed ?? 0);
      const shipped = Number(line.qty_shipped ?? 0);

      if (!sku || qty <= 0) continue;
      if (shipped > 0) continue;

      const shipQty = packed > 0 ? packed : picked > 0 ? picked : qty;

      const { data: inv, error: invErr } = await sb
        .from("inventory")
        .select("sku, qty_onhand, qty_reserved, allocated")
        .eq("sku", sku)
        .single();

      if (invErr) throw invErr;
      if (!inv) {
        return NextResponse.json({ ok: false, error: `Inventory not found for ${sku}` }, { status: 400 });
      }

      const onhand = Number(inv.qty_onhand ?? 0);
      const reserved = Number(inv.qty_reserved ?? 0);

      if (onhand < shipQty) {
        return NextResponse.json({ ok: false, error: `Insufficient onhand inventory for ${sku}` }, { status: 400 });
      }

      const { error: invUpdErr } = await sb
        .from("inventory")
        .update({
          qty_onhand: onhand - shipQty,
          qty_reserved: Math.max(0, reserved - shipQty),
        })
        .eq("sku", sku);

      if (invUpdErr) throw invUpdErr;

      const { error: lineUpdErr } = await sb
        .from("dn_line")
        .update({
          qty_shipped: shipQty,
        })
        .eq("id", line.id);

      if (lineUpdErr) throw lineUpdErr;

      const { data: existingTx, error: txSelErr } = await sb
        .from("inventory_tx")
        .select("id")
        .eq("ref_type", "dn_header")
        .eq("ref_id", id)
        .eq("sku", sku)
        .eq("tx_type", "DN_SHIP")
        .maybeSingle();

      if (txSelErr) throw txSelErr;

      if (!existingTx) {
        const { error: txInsErr } = await sb
          .from("inventory_tx")
          .insert({
            sku,
            tx_type: "DN_SHIP",
            qty_delta: -shipQty,
            ref_type: "dn_header",
            ref_id: id,
            note: header.dn_no ? `DN Ship ${header.dn_no}` : "DN Ship",
          });

        if (txInsErr) throw txInsErr;
      }
    }

    const { error: hdrUpdErr } = await sb
      .from("dn_header")
      .update({
        status: "SHIPPED",
        shipped_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (hdrUpdErr) throw hdrUpdErr;

    return NextResponse.json({ ok: true, status: "SHIPPED" }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}