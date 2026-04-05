import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DN_CREATE_TEMPLATE = `dn_no,ship_from,ship_to,planned_gi_date,planned_delivery_date,sku,qty_ordered,remarks
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,SKU001,10,Tokyo replenishment
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,SKU002,5,Tokyo replenishment
DN-20260317-0002,ICN_WH,KR_GANGNAM_STORE,2026-03-19,2026-03-19,SKU010,3,Gangnam urgent
`;

export async function GET() {
  return new NextResponse(DN_CREATE_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dn_create_template.csv"`,
    },
  });
}