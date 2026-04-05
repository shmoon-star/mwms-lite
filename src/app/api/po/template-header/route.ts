import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "po_header_template.csv",
    headers: ["po_no", "vendor", "eta", "status"],
    rows: [
      ["PO-20260314-0001", "VENDOR001", "2026-03-20", "CREATED"],
    ],
  });
}