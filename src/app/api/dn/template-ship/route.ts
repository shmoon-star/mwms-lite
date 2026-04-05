import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DN_SHIP_TEMPLATE = `dn_no,ship_from,ship_to,planned_gi_date,planned_delivery_date,actual_gi_date,sku,reserved_qty,qty_to_ship,carrier,tracking_no
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,2026-03-18,SKU001,10,10,YAMATO,YMT123456
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,2026-03-18,SKU002,5,5,YAMATO,YMT123456
DN-20260317-0002,ICN_WH,KR_GANGNAM_STORE,2026-03-19,2026-03-19,2026-03-19,SKU010,3,3,CJ,CJ998877
`;

export async function GET() {
  return new NextResponse(DN_SHIP_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dn_ship_template.csv"`,
    },
  });
}