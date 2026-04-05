import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getId(req: Request) {
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export async function POST(req: Request, ctx: any) {
  try {
    const p = await ctx?.params;
    const id = (p?.id || getId(req) || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const sb = await createClient();

    // DN header
    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("*")
      .eq("id", id)
      .single();

    if (hErr) throw hErr;
    if (!header) throw new Error("DN not found");

    // 이미 confirm이면 바로 종료 (핵심)
    if (header.status === "CONFIRMED") {
      return NextResponse.json({
        ok: true,
        alreadyConfirmed: true,
      });
    }

    // DN lines
    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("*")
      .eq("dn_id", id);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const sku = line.sku;
      const qty = Number(line.qty ?? 0);
      const shipped = Number(line.qty_shipped ?? 0);

      // 이미 shipped면 skip
      if (shipped > 0) continue;

      const { data: inv, error: invErr } = await sb
        .from("inventory")
        .select("*")
        .eq("sku", sku)
        .single();

      if (invErr) throw invErr;
      if (!inv) throw new Error(`inventory missing ${sku}`);

      const onhand = Number(inv.qty_onhand ?? 0);
      const reserved = Number(inv.qty_reserved ?? 0);

      if (onhand < qty) {
        throw new Error(`insufficient inventory ${sku}`);
      }

      // inventory update
      const { error: invUpdateErr } = await sb
        .from("inventory")
        .update({
          qty_onhand: onhand - qty,
          qty_reserved: Math.max(0, reserved - qty),
        })
        .eq("sku", sku);

      if (invUpdateErr) throw invUpdateErr;

      // dn_line shipped update
      const { error: lineErr } = await sb
        .from("dn_line")
        .update({
          qty_shipped: qty,
        })
        .eq("id", line.id);

      if (lineErr) throw lineErr;

      // inventory_tx 중복 체크
      const { data: txExist } = await sb
        .from("inventory_tx")
        .select("id")
        .eq("ref_id", id)
        .eq("sku", sku)
        .eq("tx_type", "DN")
        .maybeSingle();

      if (!txExist) {
        const { error: txErr } = await sb
          .from("inventory_tx")
          .insert({
            sku,
            tx_type: "DN",
            qty_delta: -qty,
            ref_type: "dn",
            ref_id: id,
            note: header.dn_no,
          });

        if (txErr) throw txErr;
      }
    }

    // header confirm
    const { error: confirmErr } = await sb
      .from("dn_header")
      .update({
        status: "CONFIRMED",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (confirmErr) throw confirmErr;

    return NextResponse.json({
      ok: true,
      status: "CONFIRMED",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}