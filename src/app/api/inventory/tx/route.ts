import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const { searchParams } = new URL(req.url);
    const sku = String(searchParams.get("sku") ?? "").trim();

    let query = sb
      .from("inventory_tx")
      .select("id, sku, tx_type, qty_delta, ref_type, ref_id, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (sku) {
      query = query.eq("sku", sku);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        items: data ?? [],
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}