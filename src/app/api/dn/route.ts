import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function buildDnNo() {
  return `DN-${Date.now()}`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      dns: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    await req.json().catch(() => ({}));

    const dn_no = buildDnNo();

    const { data, error } = await supabase
      .from("dn_header")
      .insert({
        dn_no,
        status: "PENDING",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      dn: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}