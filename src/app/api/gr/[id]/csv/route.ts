import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function toCsv(rows: Record<string, any>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const sb = await createClient();

  try {
    const { id } = await context.params;
    const grId = String(id ?? "").trim();

    if (!grId) {
      return NextResponse.json(
        { ok: false, error: "Invalid GR id" },
        { status: 400 }
      );
    }

    const { data: header, error: hErr } = await sb
      .from("gr_header")
      .select("id, gr_no")
      .eq("id", grId)
      .single();

    if (hErr) throw hErr;

    const { data: lines, error: lErr } = await sb
      .from("gr_line")
      .select("id, gr_id, sku, qty_expected, qty_received, asn_line_id")
      .eq("gr_id", grId)
      .order("created_at", { ascending: true });

    if (lErr) throw lErr;

    const skuList = (lines ?? []).map((l: any) => l.sku).filter(Boolean);
    const productMaster = await loadProductsBySkus(skuList, sb);

    const rows = (lines ?? []).map((l) => ({
      gr_no: header.gr_no ?? "",
      gr_id: l.gr_id,
      gr_line_id: l.id,
      sku: l.sku ?? "",
      barcode: productMaster.barcodeOf(l.sku) ?? "",
      description: productMaster.nameOf(l.sku) ?? "",
      qty_expected: Number((l as any).qty_expected ?? 0),
      qty_received: Number((l as any).qty_received ?? 0),
      asn_line_id: (l as any).asn_line_id ?? "",
    }));

    const csv = toCsv(
      rows.length
        ? rows
        : [
            {
              gr_no: header.gr_no ?? "",
              gr_id: grId,
              gr_line_id: "",
              sku: "",
              barcode: "",
              qty_expected: "",
              qty_received: "",
              asn_line_id: "",
            },
          ]
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="gr_${grId}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}