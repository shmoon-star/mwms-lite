import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ asnId: string }>;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { asnId } = await ctx.params;
    const sb = await createClient();

    const { data: asnHeader, error: hErr } = await sb
      .from("asn_header")
      .select("id, asn_no")
      .eq("id", asnId)
      .single();

    if (hErr) throw hErr;

    const { data: lines, error: lErr } = await sb
      .from("asn_line")
      .select("id, asn_id, line_no, sku, qty_expected")
      .eq("asn_id", asnId)
      .order("id", { ascending: true });

    if (lErr) throw lErr;

    return buildCsvDownloadResponse({
      filename: `gr_bulk_template_${asnHeader.asn_no}.csv`,
      headers: ["asn_no", "line_no", "sku", "qty_expected", "qty_received"],
      rows: (lines ?? []).map((line) => [
        asnHeader.asn_no,
        line.line_no,
        line.sku,
        Number(line.qty_expected ?? 0),
        "",
      ]),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}