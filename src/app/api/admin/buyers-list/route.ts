import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("buyer")
      .select("id, buyer_code, buyer_name")
      .order("buyer_code");

    if (error) throw error;
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const body = await req.json();
    const buyerCode = String(body.buyer_code ?? "").trim();
    const buyerName = String(body.buyer_name ?? "").trim();

    if (!buyerCode || !buyerName) {
      return NextResponse.json({ ok: false, error: "buyer_code and buyer_name required" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("buyer")
      .insert({ buyer_code: buyerCode, buyer_name: buyerName })
      .select("id, buyer_code, buyer_name")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, buyer: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
