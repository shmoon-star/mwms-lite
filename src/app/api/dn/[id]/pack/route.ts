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
        { ok: false, error: "invalid DN id" },
        { status: 400 }
      );
    }

    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status")
      .eq("id", dnId)
      .single();

    if (hErr) throw hErr;
    if (!header) throw new Error("DN not found");

    if (header.status === "SHIPPED") {
      return NextResponse.json(
        { ok: false, error: "Already shipped DN" },
        { status: 400 }
      );
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, qty, qty_picked, qty_packed")
      .eq("dn_id", dnId);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const qty = Number(line.qty ?? 0);
      const picked = Number(line.qty_picked ?? 0);
      const packed = Number(line.qty_packed ?? 0);

      if (qty <= 0) continue;
      if (packed > 0) continue;

      const packQty = picked > 0 ? picked : qty;

      const { error: updErr } = await sb
        .from("dn_line")
        .update({
          qty_packed: packQty,
        })
        .eq("id", line.id);

      if (updErr) throw updErr;
    }

    const { error: hdrErr } = await sb
      .from("dn_header")
      .update({
        status: "PACKED",
        packed_at: new Date().toISOString(),
      })
      .eq("id", dnId)
      .in("status", ["RESERVED", "PICKED", "PACKED"]);

    if (hdrErr) throw hdrErr;

    return NextResponse.json(
      { ok: true, status: "PACKED" },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}