import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);

  const sku = searchParams.get("sku");
  const txType = searchParams.get("tx_type");
  const refType = searchParams.get("ref_type");
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");

  let query = supabase
    .from("inventory_tx")
    .select("*")
    .order("created_at", { ascending: false });

  if (sku) query = query.eq("sku", sku);
  if (txType) query = query.eq("tx_type", txType);
  if (refType) query = query.eq("ref_type", refType);

  // ✅ 날짜 필터
  if (fromDate) {
    query = query.gte("created_at", fromDate + "T00:00:00");
  }

  if (toDate) {
    query = query.lte("created_at", toDate + "T23:59:59");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}