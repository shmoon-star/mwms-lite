import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

function esc(value: unknown) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("sku");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const skuList = (data ?? []).map((r: any) => r.sku).filter(Boolean);
    const productMaster = await loadProductsBySkus(skuList, supabase);

    const rows: string[] = [];
    rows.push(["sku", "barcode", "description", "qty_onhand", "qty_reserved", "available"].join(","));

    for (const r of data ?? []) {
      const available = Number(r.qty_onhand ?? 0) - Number(r.qty_reserved ?? 0);
      rows.push([
        esc(r.sku),
        esc(productMaster.barcodeOf(r.sku) ?? ""),
        esc(productMaster.nameOf(r.sku) ?? ""),
        esc(r.qty_onhand),
        esc(r.qty_reserved),
        esc(available),
      ].join(","));
    }

    const csv = "\uFEFF" + rows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory_export.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}