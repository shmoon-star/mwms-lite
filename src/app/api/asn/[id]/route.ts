import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    const { data: headerRow, error: headerErr } = await sb
      .from("asn_header")
      .select("id, asn_no, status, created_at")
      .eq("id", id)
      .single();

    if (headerErr) {
      throw headerErr;
    }

    const { data: lineRows, error: lineErr } = await sb
      .from("asn_line")
      .select("id, asn_id, line_no, sku, qty_expected, created_at")
      .eq("asn_id", id)
      .order("line_no", { ascending: true });

    if (lineErr) {
      throw lineErr;
    }

    return NextResponse.json({
      ok: true,
      asn: {
        id: headerRow.id,
        asn_no: headerRow.asn_no,
        status: headerRow.status,
        created_at: headerRow.created_at,
        lines: lineRows ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}