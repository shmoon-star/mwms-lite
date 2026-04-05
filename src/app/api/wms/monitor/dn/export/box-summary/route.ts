import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const itemCountMap = new Map<string, number>();
  const qtyMap = new Map<string, number>();

  for (const item of items || []) {
    itemCountMap.set(item.dn_box_id, (itemCountMap.get(item.dn_box_id) || 0) + 1);
    qtyMap.set(item.dn_box_id, (qtyMap.get(item.dn_box_id) || 0) + Number(item.qty || 0));
  }

  const dnMap = new Map(filtered?.map((d) => [d.id, d]) || []);

  const rows = (boxes || []).map((b) => {
    const dn = dnMap.get(b.dn_id);
    return [
      dn?.dn_no || "",
      dn?.ship_to || "",
      b.box_no,
      b.box_type,
      b.box_weight_kg,
      b.status,
      itemCountMap.get(b.id) || 0,
      qtyMap.get(b.id) || 0,
      b.packed_at,
      b.remarks,
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
      "item_count",
      "packed_qty",
      "packed_at",
      "remarks",
    ],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=dn_box_summary_${view}.csv`,
    },
  });
}