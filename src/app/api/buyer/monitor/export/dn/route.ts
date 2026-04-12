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

    let dnQuery = sb
      .from("dn_header")
      .select("id, dn_no, status, ship_from, ship_to, planned_gi_date, planned_delivery_date, shipped_at, created_at")
      .order("created_at", { ascending: false });

    if (profile.role === "BUYER" && buyer?.id) {
      dnQuery = dnQuery.eq("buyer_id", buyer.id);
    }

    const { data: dns } = await dnQuery;
    const dnIds = (dns ?? []).map((d: any) => d.id);

    let lines: any[] = [];
    if (dnIds.length > 0) {
      const { data: lineRows } = await sb
        .from("dn_lines")
        .select("dn_id, sku, qty_ordered, qty, qty_shipped")
        .in("dn_id", dnIds);
      lines = lineRows ?? [];
    }

    // Product master (barcode + description)
    const skuList = [...new Set(lines.map((l: any) => l.sku).filter(Boolean))];
    const productMaster = await loadProductsBySkus(skuList, sb);

    const dnMap = new Map((dns ?? []).map((d: any) => [d.id, d]));

    const csvRows = lines.map((l: any) => {
      const dn = dnMap.get(l.dn_id) as any;
      return {
        dn_no: dn?.dn_no ?? "",
        dn_status: dn?.status ?? "",
        ship_from: dn?.ship_from ?? "",
        ship_to: dn?.ship_to ?? "",
        planned_gi_date: dn?.planned_gi_date ?? "",
        planned_delivery_date: dn?.planned_delivery_date ?? "",
        shipped_at: dn?.shipped_at ? dn.shipped_at.slice(0, 10) : "",
        sku: l.sku ?? "",
        barcode: productMaster.barcodeOf(l.sku) ?? "",
        description: productMaster.nameOf(l.sku) ?? "",
        qty_ordered: l.qty_ordered ?? l.qty ?? 0,
        qty_shipped: l.qty_shipped ?? 0,
        created_at: dn?.created_at ? dn.created_at.slice(0, 10) : "",
      };
    });

    const csv = bom(toCsv(csvRows));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buyer_dn_sku_detail.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
