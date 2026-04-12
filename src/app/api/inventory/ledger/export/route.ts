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

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const sku = searchParams.get("sku")?.trim() ?? "";
    const txType = searchParams.get("tx_type")?.trim() ?? "";
    const refType = searchParams.get("ref_type")?.trim() ?? "";

    let query = supabase
      .from("inventory_tx")
      .select("*")
      .order("created_at", { ascending: false });

    if (sku) query = query.ilike("sku", `%${sku}%`);
    if (txType) query = query.eq("tx_type", txType);
    if (refType) query = query.eq("ref_type", refType);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const skuList = (data ?? []).map((r: any) => r.sku).filter(Boolean);
    const productMaster = await loadProductsBySkus(skuList, supabase);

    const rows: string[] = [];
    rows.push(["sku", "barcode", "description", "tx_type", "qty_delta", "ref_type", "ref_id", "created_at"].join(","));

    for (const r of data ?? []) {
      rows.push([
        esc(r.sku),
        esc(productMaster.barcodeOf(r.sku) ?? ""),
        esc(productMaster.nameOf(r.sku) ?? ""),
        esc(r.tx_type),
        esc(r.qty_delta),
        esc(r.ref_type),
        esc(r.ref_id),
        esc(r.created_at),
      ].join(","));
    }

    const csv = "\uFEFF" + rows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory_ledger.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}