import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sb = await createClient();

    const { data: header, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .eq("id", id)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: headerError?.message || "DN not found" },
        { status: 404 }
      );
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("id, box_no, box_type, box_weight_kg, status, packed_at, remarks, created_at")
      .eq("dn_id", id)
      .order("created_at", { ascending: true });

    if (boxError) {
      return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
    }

    const boxIds = (boxes || []).map((b) => b.id).filter(Boolean);

    let boxItems: any[] = [];
    if (boxIds.length > 0) {
      const { data: itemRows, error: itemError } = await sb
        .from("dn_box_item")
        .select("*")
        .in("dn_box_id", boxIds)
        .order("created_at", { ascending: true });

      if (itemError) {
        return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
      }

      boxItems = itemRows || [];
    }

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("*")
      .eq("dn_id", id);

    if (lineError) {
      return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
    }

    const skuList = Array.from(
      new Set(
        [
          ...(lines || []).map((row: any) => row.sku),
          ...boxItems.map((row: any) => row.sku),
        ].filter(Boolean)
      )
    );

let productRows: any[] = [];
if (skuList.length > 0) {
  const { data: products, error: productError } = await sb
    .from("products")
    .select("sku, name, brand")
    .in("sku", skuList);

  if (productError) {
    return NextResponse.json({ ok: false, error: productError.message }, { status: 500 });
  }

  productRows = products || [];
}

const lineDescMap = new Map<string, string>();
for (const line of lines || []) {
  lineDescMap.set(
    line.sku,
    line.description || line.product_name || line.item_name || ""
  );
}

const productMap = new Map<string, { brand: string; name: string }>();
for (const product of productRows) {
  productMap.set(product.sku, {
    brand: product.brand || "",
    name: product.name || "",
  });
}

    const boxMap = new Map<string, any>();
    for (const box of boxes || []) {
      boxMap.set(box.id, box);
    }

    const headers = [
      "dn_no",
      "customer",
      "box_no",
      "box_type",
      "box_weight_kg",
      "box_status",
      "sku",
      "brand",
      "description",
      "qty",
      "source_type",
      "packed_at",
      "remarks",
    ];

const rows = boxItems.map((item) => {
  const box = boxMap.get(item.dn_box_id);
  const product = productMap.get(item.sku);

  const description =
    lineDescMap.get(item.sku) ||
    product?.name ||
    "";

  const brand = product?.brand || "";

  return [
    header.dn_no || "",
    header.ship_to || header.ship_to_name || header.customer_name || "",
    box?.box_no || "",
    box?.box_type || "",
    box?.box_weight_kg ?? "",
    box?.status || "",
    item.sku || "",
    brand,
    description,
    item.qty ?? "",
    item.source_type || "",
    box?.packed_at || "",
    box?.remarks || "",
  ];
});

    const csv = makeCsv(headers, rows);
    const filename = `${header.dn_no || "dn"}_box_detail.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}