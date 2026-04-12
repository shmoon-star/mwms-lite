/**
 * GET /api/products/lookup?q=<sku_or_barcode>
 *
 * Resolves any identifier (SKU or barcode) to the full product record.
 * Returns { ok, product } or { ok: false, error }.
 *
 * Use this from client-side components (e.g., barcode scan inputs).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductMaster } from "@/lib/product-master";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
    }

    const sb = await createClient();

    // Try SKU exact match first (fast path)
    const { data: bySku } = await sb
      .from("products")
      .select("id, sku, barcode, name, brand, uom, category, status")
      .eq("sku", q)
      .maybeSingle();

    if (bySku) {
      return NextResponse.json({ ok: true, product: bySku, matched_by: "sku" });
    }

    // Try barcode match
    const { data: byBarcode } = await sb
      .from("products")
      .select("id, sku, barcode, name, brand, uom, category, status")
      .eq("barcode", q)
      .maybeSingle();

    if (byBarcode) {
      return NextResponse.json({ ok: true, product: byBarcode, matched_by: "barcode" });
    }

    return NextResponse.json({ ok: false, error: `No product found for: ${q}` }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
