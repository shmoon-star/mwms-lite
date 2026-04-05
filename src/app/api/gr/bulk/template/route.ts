import { NextRequest } from "next/server";
import { buildCsvDownloadResponse } from "@/lib/csv-template";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const asnId = req.nextUrl.searchParams.get("asnId");

  if (!asnId) {
    return buildCsvDownloadResponse({
      filename: "gr_bulk_template.csv",
      headers: ["asn_line_id", "asn_no", "sku", "qty_expected", "qty_received"],
      rows: [
        ["SKU001", 100, 100],
        ["SKU002", 50, 48],
      ],
    });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("asn_lines")
    .select("sku, qty_expected")
    .eq("asn_id", asnId)
    .order("sku", { ascending: true });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return buildCsvDownloadResponse({
    filename: `gr_bulk_template_${asnId}.csv`,
    headers: ["asn_line_id", "asn_no", "sku", "qty_expected", "qty_received"],
    rows: (data ?? []).map((row) => [row.sku, row.qty_expected ?? 0, ""]),
  });
}