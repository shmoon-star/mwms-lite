import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "inventory_adjustment_template.csv",
    headers: ["sku", "adjust_qty", "reason"],
    rows: [
      ["SKU001", 5, "STOCK_COUNT_PLUS"],
      ["SKU002", -2, "DAMAGE"],
    ],
  });
}