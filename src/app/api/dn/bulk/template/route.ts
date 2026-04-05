import { NextRequest } from "next/server";
import { buildCsvDownloadResponse } from "@/lib/csv-template";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dnId = req.nextUrl.searchParams.get("dnId");

  if (!dnId) {
    return buildCsvDownloadResponse({
      filename: "dn_ship_template.csv",
      headers: ["sku", "reserved_qty", "qty_to_ship"],
      rows: [
        ["SKU001", 10, 10],
        ["SKU002", 5, 5],
      ],
    });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dn_lines")
    .select("sku, qty_reserved")
    .eq("dn_id", dnId)
    .order("sku", { ascending: true });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return buildCsvDownloadResponse({
    filename: `dn_ship_template_${dnId}.csv`,
    headers: ["sku", "reserved_qty", "qty_to_ship"],
    rows: (data ?? []).map((row) => [row.sku, row.qty_reserved ?? 0, ""]),
  });
}