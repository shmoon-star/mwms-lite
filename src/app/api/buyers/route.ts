import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = await createClient();

    const { data, error } = await sb
      .from("buyer")
      .select("id, buyer_code, buyer_name, buyer_name_en, country")
      .order("buyer_code", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load buyers" },
      { status: 500 }
    );
  }
}
