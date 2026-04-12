import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: any[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function normalizeView(view: string) {
  const v = String(view || "all").toLowerCase();
  if (["all", "open", "closed"].includes(v)) return v;
  return "all";
}

function isClosed(status?: string) {
  return ["CLOSED", "SHIPPED", "CONFIRMED"].includes(String(status || "").toUpperCase());
}

export async function GET(req: Request) {
  const sb = await createClient();
  const url = new URL(req.url);
  const view = normalizeView(url.searchParams.get("view") || "all");

  const { data: dns } = await sb
    .from("dn_header")
    .select("*")
    .order("created_at", { ascending: false });

  const filtered =
    view === "open"
      ? dns?.filter((d) => !isClosed(d.status))
      : view === "closed"
      ? dns?.filter((d) => isClosed(d.status))
      : dns;

  const dnIds = (filtered || []).map((d) => d.id);

  const { data: boxes } = await sb
    .from("dn_box")
    .select("*")
    .in("dn_id", dnIds);

  const { data: items } = await sb
    .from("dn_box_item")
    .select("*")
    .in("dn_box_id", (boxes || []).map((b) => b.id));

  const allSkus = (items || []).map((i: any) => i.sku).filter(Boolean);
  const productMaster = await loadProductsBySkus(allSkus, sb);
  const boxMap = new Map(boxes?.map((b) => [b.id, b]) || []);
  const dnMap = new Map(filtered?.map((d) => [d.id, d]) || []);

  const rows = (items || []).map((i) => {
    const box = boxMap.get(i.dn_box_id);
    const dn = dnMap.get(box?.dn_id);

    return [
      dn?.dn_no || "",
      dn?.ship_to || "",
      box?.box_no,
      box?.box_type,
      box?.box_weight_kg,
      box?.status,
      i.sku,
      productMaster.barcodeOf(i.sku) ?? "",
      productMaster.resolve(i.sku)?.brand || "",
      productMaster.nameOf(i.sku) || "",
      i.qty,
      i.source_type,
      box?.packed_at,
      box?.remarks,
    ];
  });

  const csv = makeCsv(
    [
      "dn_no",
      "customer",
      "box_no",
      "box_type",
      "box_weight_kg",
      "status",
      "sku",
      "barcode",
      "brand",
      "description",
      "qty",
      "source",
      "packed_at",
      "remarks",
    ],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=dn_box_detail_${view}.csv`,
    },
  });
}