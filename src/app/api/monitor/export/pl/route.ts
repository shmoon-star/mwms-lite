import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

function esc(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    const sb = await createClient();

    // 1) All PL headers
    const { data: headers, error: headerErr } = await sb
      .from("packing_list_header")
      .select("id, pl_no, po_no, eta, status, vendor_id, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (headerErr) throw headerErr;

    const plIds = (headers ?? []).map((h: any) => h.id).filter(Boolean);

    if (plIds.length === 0) {
      const emptyHeader = "pl_no,po_no,vendor_code,vendor_name,eta,pl_status,sku,barcode,description,qty,style_code,color,size,carton_no,line_no,created_at\n";
      return new NextResponse("\uFEFF" + emptyHeader, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pl_detail_export.csv"`,
        },
      });
    }

    // 2) PL lines
    const { data: lines, error: lineErr } = await sb
      .from("packing_list_lines")
      .select("packing_list_id, line_no, sku, description, qty, carton_no, style_code, color, size, po_no")
      .in("packing_list_id", plIds)
      .order("packing_list_id")
      .order("id");

    if (lineErr) throw lineErr;

    const skuList = Array.from(new Set((lines ?? []).map((l: any) => l.sku).filter(Boolean)));
    const productMaster = await loadProductsBySkus(skuList, sb);

    // 3) Vendors
    const vendorIds = Array.from(new Set((headers ?? []).map((h: any) => h.vendor_id).filter(Boolean)));
    let vendors: any[] = [];
    if (vendorIds.length > 0) {
      const { data } = await sb.from("vendor").select("id, vendor_code, vendor_name").in("id", vendorIds);
      vendors = data ?? [];
    }
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const headerMap = new Map((headers ?? []).map((h: any) => [h.id, h]));

    const csvHeaders = [
      "pl_no", "po_no", "vendor_code", "vendor_name",
      "eta", "pl_status",
      "sku", "barcode", "description", "qty",
      "style_code", "color", "size", "carton_no", "line_no",
      "created_at",
    ];

    const rows = (lines ?? []).map((line: any) => {
      const h = headerMap.get(line.packing_list_id);
      const vendor = h?.vendor_id ? vendorMap.get(h.vendor_id) : null;
      return [
        h?.pl_no ?? "",
        line.po_no ?? h?.po_no ?? "",
        vendor?.vendor_code ?? "",
        vendor?.vendor_name ?? "",
        h?.eta ?? "",
        h?.status ?? "",
        line.sku ?? "",
        productMaster.barcodeOf(line.sku) ?? "",
        line.description ?? "",
        line.qty ?? "",
        line.style_code ?? "",
        line.color ?? "",
        line.size ?? "",
        line.carton_no ?? "",
        line.line_no ?? "",
        h?.created_at ?? "",
      ].map(esc).join(",");
    });

    const csv = "\uFEFF" + [csvHeaders.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pl_detail_export.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
