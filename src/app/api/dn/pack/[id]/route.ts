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

    if (header.status === "PACKED") {
      return NextResponse.json({ ok: true, alreadyPacked: true });
    }

    if (header.status === "SHIPPED") {
      return NextResponse.json({ ok: true, alreadyPacked: true });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, sku, qty, qty_picked")
      .eq("dn_id", dnId);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const packQty = Number(line.qty_picked ?? line.qty ?? 0);

      const { error: updLineErr } = await sb
        .from("dn_line")
        .update({
          qty_packed: packQty,
        })
        .eq("id", line.id);

      if (updLineErr) throw updLineErr;
    }

    const { error: updErr } = await sb
      .from("dn_header")
      .update({
        status: "PACKED",
        packed_at: new Date().toISOString(),
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