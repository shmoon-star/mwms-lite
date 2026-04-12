import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("vendor")
      .select("id, vendor_code, vendor_name")
      .eq("status", "ACTIVE")
      .order("vendor_code");

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
    const vendorCode = String(body.vendor_code ?? "").trim();
    const vendorName = String(body.vendor_name ?? "").trim();

    if (!vendorCode || !vendorName) {
      return NextResponse.json({ ok: false, error: "vendor_code and vendor_name required" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("vendor")
      .insert({ vendor_code: vendorCode, vendor_name: vendorName, status: "ACTIVE" })
      .select("id, vendor_code, vendor_name")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, vendor: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
