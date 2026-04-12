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

    const { data: headers, error: headerErr } = await supabase
      .from("dn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerErr) {
      return NextResponse.json({ ok: false, error: headerErr.message }, { status: 500 });
    }

    const { data: lines, error: lineErr } = await supabase
      .from("dn_lines")
      .select("*")
      .order("created_at", { ascending: false });

    if (lineErr) {
      return NextResponse.json({ ok: false, error: lineErr.message }, { status: 500 });
    }

    const lineMap = new Map<string, any[]>();
    for (const line of lines ?? []) {
      const key = String(line.dn_id);
      if (!lineMap.has(key)) lineMap.set(key, []);
      lineMap.get(key)!.push(line);
    }

    const skuList = Array.from(new Set((lines ?? []).map((l: any) => l.sku).filter(Boolean)));
    const productMaster = await loadProductsBySkus(skuList, supabase);

    const rows: string[] = [];
    rows.push([
      "dn_no",
      "status",
      "ship_from",
      "ship_to",
      "planned_gi_date",
      "planned_delivery_date",
      "actual_gi_date",
      "carrier",
      "tracking_no",
      "created_at",
      "confirmed_at",
      "reserved_at",
      "shipped_at",
      "sku",
      "barcode",
      "description",
      "qty",
      "qty_ordered",
      "qty_reserved",
      "qty_shipped",
      "line_created_at",
    ].join(","));

    for (const h of headers ?? []) {
      const dnLines = lineMap.get(String(h.id)) ?? [];

      if (dnLines.length === 0) {
        rows.push([
          esc(h.dn_no),
          esc(h.status),
          esc(h.ship_from),
          esc(h.ship_to),
          esc(h.planned_gi_date),
          esc(h.planned_delivery_date),
          esc(h.actual_gi_date),
          esc(h.carrier),
          esc(h.tracking_no),
          esc(h.created_at),
          esc(h.confirmed_at),
          esc(h.reserved_at),
          esc(h.shipped_at),
          "", "", "", "", "", "", "", ""
        ].join(","));
        continue;
      }

      for (const l of dnLines) {
        rows.push([
          esc(h.dn_no),
          esc(h.status),
          esc(h.ship_from),
          esc(h.ship_to),
          esc(h.planned_gi_date),
          esc(h.planned_delivery_date),
          esc(h.actual_gi_date),
          esc(h.carrier),
          esc(h.tracking_no),
          esc(h.created_at),
          esc(h.confirmed_at),
          esc(h.reserved_at),
          esc(h.shipped_at),
          esc(l.sku),
          esc(productMaster.barcodeOf(l.sku) ?? ""),
          esc(productMaster.nameOf(l.sku) ?? ""),
          esc(l.qty),
          esc(l.qty_ordered),
          esc(l.qty_reserved),
          esc(l.qty_shipped),
          esc(l.created_at),
        ].join(","));
      }
    }

    const csv = "\uFEFF" + rows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dn_export.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}