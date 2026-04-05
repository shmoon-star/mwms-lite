import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "gr_bulk_template.csv",
    headers: ["asn_no", "line_no", "sku", "qty_expected", "qty_received"],
    rows: [
      ["ASN-1773525278832", 1, "SKU001", 100, ""],
      ["ASN-1773525278832", 2, "SKU002", 50, ""],
    ],
  });
}