import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST — DN 상태를 PACKING으로 변경 (중간 저장, 재고 차감 없음) */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sb = await createClient();

    const { data: dn, error: dnErr } = await sb
      .from("dn_header")
      .select("id, status")
      .eq("id", id)
      .single();

    if (dnErr || !dn) {
      return NextResponse.json({ ok: false, error: "DN not found" }, { status: 404 });
    }

    const status = String(dn.status || "").toUpperCase();
    if (status === "SHIPPED") {
      return NextResponse.json({ ok: false, error: "Already shipped" }, { status: 400 });
    }

    const { error } = await sb
      .from("dn_header")
      .update({ status: "PACKING" })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true, status: "PACKING" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
