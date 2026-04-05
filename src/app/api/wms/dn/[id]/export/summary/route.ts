import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
}

function sumQty(items: Array<{ qty?: number | null }>) {
  return items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sb = await createClient();

    const { data: header, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .eq("id", id)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: headerError?.message || "DN not found" },
        { status: 404 }
      );
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("id, dn_id, box_no, box_type, box_weight_kg, remarks, status, packed_at, created_at")
      .eq("dn_id", id)
      .order("created_at", { ascending: true });

    if (boxError) {
      return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
    }

    const boxIds = (boxes || []).map((b) => b.id);

    let items: any[] = [];
    if (boxIds.length > 0) {
      const { data: itemRows, error: itemError } = await sb
        .from("dn_box_item")
        .select("id, dn_box_id, qty")
        .in("dn_box_id", boxIds);

      if (itemError) {
        return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
      }

      items = itemRows || [];
    }

    const itemMap = new Map<string, any[]>();
    for (const item of items) {
      const prev = itemMap.get(item.dn_box_id) || [];
      prev.push(item);
      itemMap.set(item.dn_box_id, prev);
    }

    const headers = [
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
    ];

    const rows = (boxes || []).map((box) => {
      const boxItems = itemMap.get(box.id) || [];
      return [
        header.dn_no || "",
        header.ship_to || header.ship_to_name || header.customer_name || "",
        box.box_no,
        box.box_type || "",
        box.box_weight_kg ?? "",
        box.status || "",
        boxItems.length,
        sumQty(boxItems),
        box.packed_at || "",
        box.remarks || "",
      ];
    });

    const csv = makeCsv(headers, rows);
    const filename = `${header.dn_no || "dn"}_box_summary.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}