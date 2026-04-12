import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

function bom(s: string) { return "\uFEFF" + s; }
function esc(v: unknown) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
}

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);
    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    // PO headers (buyer-scoped)
    let poQuery = sb
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta, created_at")
      .order("created_at", { ascending: false });

    if (profile.role === "BUYER" && buyer?.id) {
      poQuery = poQuery.eq("buyer_id", buyer.id);
    }

    const { data: pos } = await poQuery;
    const poIds = (pos ?? []).map((p: any) => p.id);

    // PO lines (SKU 레벨)
    let lines: any[] = [];
    if (poIds.length > 0) {
      const { data: lineRows } = await sb
        .from("po_line")
        .select("po_id, sku, qty_ordered, qty")
        .in("po_id", poIds);
      lines = lineRows ?? [];
    }

    // Vendor map
    const vendorIds = [...new Set((pos ?? []).map((p: any) => p.vendor_id).filter(Boolean))];
    const vendorMap = new Map<string, any>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await sb.from("vendor").select("id, vendor_code, vendor_name").in("id", vendorIds);
      (vendors ?? []).forEach((v: any) => vendorMap.set(v.id, v));
    }

    // Product master (barcode + description)
    const skuList = [...new Set(lines.map((l: any) => l.sku).filter(Boolean))];
    const productMaster = await loadProductsBySkus(skuList, sb);

    const poMap = new Map((pos ?? []).map((p: any) => [p.id, p]));

    const csvRows = lines.map((l: any) => {
      const po = poMap.get(l.po_id) as any;
      const vendor = po?.vendor_id ? vendorMap.get(po.vendor_id) : null;
      return {
        po_no: po?.po_no ?? "",
        vendor_code: vendor?.vendor_code ?? "",
        vendor_name: vendor?.vendor_name ?? "",
        po_status: po?.status ?? "",
        eta: po?.eta ?? "",
        sku: l.sku ?? "",
        barcode: productMaster.barcodeOf(l.sku) ?? "",
        description: productMaster.nameOf(l.sku) ?? "",
        qty_ordered: l.qty_ordered ?? l.qty ?? 0,
        created_at: po?.created_at ? po.created_at.slice(0, 10) : "",
      };
    });

    const csv = bom(toCsv(csvRows));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buyer_po_sku_detail.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
