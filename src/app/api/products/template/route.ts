import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "products_template.csv",
    headers: ["sku", "product_name", "barcode", "uom", "brand", "category", "status"],
    rows: [
      ["SKU001", "Basic Tee", "880000000001", "EA", "MUSINSA", "TOP", "ACTIVE"],
      ["SKU002", "Denim Pants", "880000000002", "EA", "MUSINSA", "BOTTOM", "ACTIVE"],
    ],
  });
}