import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "asn_template.csv",
    headers: ["po_no", "asn_no", "sku", "qty_expected", "eta", "remark"],
    rows: [
      ["PO-20260314-0001", "ASN-20260314-0001", "SKU001", 100, "2026-03-20", "partial inbound"],
      ["PO-20260314-0001", "ASN-20260314-0001", "SKU002", 50, "2026-03-20", "partial inbound"],
    ],
  });
}