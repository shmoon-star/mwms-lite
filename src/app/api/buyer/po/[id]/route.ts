import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);

    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    const { data: po, error: poErr } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, buyer_id, status, eta, created_at")
      .eq("id", id)
      .maybeSingle();

    if (poErr) throw poErr;
    if (!po) return NextResponse.json({ ok: false, error: "PO not found" }, { status: 404 });

    // BUYER scope check
    if (profile.role === "BUYER" && buyer?.id && po.buyer_id !== buyer.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Vendor info
    let vendorInfo: { vendor_code: string; vendor_name: string | null } | null = null;
    if (po.vendor_id) {
      const { data: v } = await sb
        .from("vendor")
        .select("vendor_code, vendor_name")
        .eq("id", po.vendor_id)
        .maybeSingle();
      vendorInfo = v ?? null;
    }

    // Buyer info
    let buyerInfo: { buyer_code: string; buyer_name: string | null } | null = null;
    if (po.buyer_id) {
      const { data: b } = await sb
        .from("buyer")
        .select("buyer_code, buyer_name")
        .eq("id", po.buyer_id)
        .maybeSingle();
      buyerInfo = b ?? null;
    }

    // PO lines (actual columns: id, po_id, sku, qty, qty_ordered, created_at)
    const { data: lines, error: linesErr } = await sb
      .from("po_line")
      .select("id, sku, qty, qty_ordered, created_at")
      .eq("po_id", id)
      .order("created_at", { ascending: true });

    if (linesErr) throw linesErr;

    // Enrich with product names
    const skus = [...new Set((lines ?? []).map((l: any) => l.sku).filter(Boolean))];
    const productMap = new Map<string, { name: string; brand: string | null }>();

    if (skus.length > 0) {
      const { data: products } = await sb
        .from("products")
        .select("sku, name, brand")
        .in("sku", skus);

      for (const p of products ?? []) {
        productMap.set(p.sku, { name: p.name, brand: p.brand });
      }
    }

    const enrichedLines = (lines ?? []).map((l: any, idx: number) => ({
      id: l.id,
      line_no: idx + 1,
      sku: l.sku,
      product_name: productMap.get(l.sku)?.name ?? "-",
      brand: productMap.get(l.sku)?.brand ?? "-",
      qty: l.qty_ordered ?? l.qty ?? 0,
      unit_price: null,
      currency: null,
      status: null,
    }));

    return NextResponse.json({
      ok: true,
      po: {
        id: po.id,
        po_no: po.po_no,
        vendor_code: vendorInfo?.vendor_code ?? "-",
        vendor_name: vendorInfo?.vendor_name ?? "-",
        buyer_code: buyerInfo?.buyer_code ?? "-",
        buyer_name: buyerInfo?.buyer_name ?? "-",
        status: po.status,
        eta: po.eta,
        created_at: po.created_at,
        confirmed_at: null,
        lines: enrichedLines,
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
