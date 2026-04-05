import { buildCsvDownloadResponse } from "@/lib/csv-template";

export const dynamic = "force-dynamic";

export async function GET() {
  return buildCsvDownloadResponse({
    filename: "dn_create_template.csv",
    headers: [
      "dn_no",
      "ship_from",
      "ship_to",
      "planned_gi_date",
      "planned_delivery_date",
      "sku",
      "qty_ordered",
      "remarks",
      "description", // ✅ 추가
    ],
    rows: [
      [
        "DN-20260401-0001",
        "ICN_WH",
        "JP_TOKYO_STORE",
        "2026-04-04",
        "2026-04-06",
        "SKU001",
        10,
        "Tokyo replenishment",
        "NIKE TEE BLACK M",
      ],
      [
        "DN-20260401-0001",
        "ICN_WH",
        "JP_TOKYO_STORE",
        "2026-04-04",
        "2026-04-06",
        "SKU002",
        5,
        "Tokyo replenishment",
        "NIKE SHORT NAVY L",
      ],
    ],
  });
}