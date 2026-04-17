import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: any[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function n(v: unknown) {
  return Number(v ?? 0);
}

export async function GET(_req: Request, { params }: Params) {
  const { id: asnId } = await params;
  const sb = await createClient();

  const { data: header } = await sb
    .from("asn_header")
    .select("*")
    .eq("id", asnId)
    .single();

  const { data: lines } = await sb
    .from("asn_line")
    .select("*")
    .eq("asn_id", asnId)
    .order("line_no", { ascending: true });

  const skuList = Array.from(
    new Set((lines || []).map((row: any) => row.sku).filter(Boolean))
  );

  const productMaster = await loadProductsBySkus(skuList, sb);

  const rows = (lines || []).map((row: any) => {
    // qty_expected가 0이면 qty로 fallback (?? 는 0을 유효로 취급)
    const qExpectedRaw = n(row.qty_expected);
    const expected = qExpectedRaw > 0 ? qExpectedRaw : n(row.qty);
    const received = n(row.qty_received);

    return [
      header?.asn_no || "",
      row.line_no ?? "",
      row.carton_no || "",
      row.sku || "",
      productMaster.barcodeOf(row.sku) ?? "",
      productMaster.resolve(row.sku)?.brand || "",
      productMaster.nameOf(row.sku) || "",
      expected,
      received,
      Math.max(expected - received, 0),
      row.created_at || "",
    ];
  });

  const csv = makeCsv(
    [
      "asn_no",
      "line_no",
      "carton_no",
      "sku",
      "barcode",
      "brand",
      "description",
      "expected_qty",
      "received_qty",
      "balance",
      "created_at",
    ],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${header?.asn_no || "asn"}_detail.csv"`,
    },
  });
}