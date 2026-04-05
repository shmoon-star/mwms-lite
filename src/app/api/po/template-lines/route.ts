import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "po_lines_template.csv",
    headers: ["po_no", "line_no", "sku", "qty_ordered", "unit_price", "currency"],
    rows: [
      ["PO-20260314-0001", 1, "SKU001", 100, 10, "KRW"],
      ["PO-20260314-0001", 2, "SKU002", 50, 20, "KRW"],
    ],
  });
}