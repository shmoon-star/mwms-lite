import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeView(view: string) {
  const v = String(view || "all").toLowerCase();
  if (v === "open" || v === "closed" || v === "all") return v;
  return "all";
}

function isClosedStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return ["SHIPPED", "CONFIRMED", "CLOSED"].includes(s);
}

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

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = normalizeView(url.searchParams.get("view") || "all");

    const { data: headers, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerError) {
      return NextResponse.json({ ok: false, error: headerError.message }, { status: 500 });
    }

    const headerRows = (headers || []) as Record<string, any>[];

    const filteredHeaders =
      view === "open"
        ? headerRows.filter((row) => !isClosedStatus(row.status))
        : view === "closed"
        ? headerRows.filter((row) => isClosedStatus(row.status))
        : headerRows;

    const dnIds = filteredHeaders.map((row) => row.id).filter(Boolean);

    if (dnIds.length === 0) {
      const csv = makeCsv(
        [
          "dn_no",
          "customer",
          "status",
          "ordered",
          "packed",
          "balance",
          "box_count",
          "open_box_count",
          "closed_box_count",
          "created_at",
          "shipped_at",
        ],
        []
      );

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dn_execution_monitor_${view}.csv"`,
        },
      });
    }

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("dn_id, qty_ordered, qty_shipped")
      .in("dn_id", dnIds);

    if (lineError) {
      return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("*")
      .in("dn_id", dnIds);

    if (boxError) {
      return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
    }

    const boxIds = (boxes || []).map((b: any) => b.id).filter(Boolean);

    let boxItems: any[] = [];
    if (boxIds.length > 0) {
      const { data: itemRows, error: itemError } = await sb
        .from("dn_box_item")
        .select("*")
        .in("dn_box_id", boxIds);

      if (itemError) {
        return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
      }

      boxItems = itemRows || [];
    }

    const orderedMap = new Map<string, number>();
    const shippedMap = new Map<string, number>();
    for (const line of lines || []) {
      const dnId = line.dn_id;
      if (!dnId) continue;
      orderedMap.set(dnId, (orderedMap.get(dnId) || 0) + Number(line.qty_ordered || 0));
      shippedMap.set(dnId, (shippedMap.get(dnId) || 0) + Number(line.qty_shipped || 0));
    }

    const boxCountMap = new Map<string, number>();
    const openBoxMap = new Map<string, number>();
    const closedBoxMap = new Map<string, number>();
    const boxToDnMap = new Map<string, string>();

    for (const box of boxes || []) {
      const dnId = box.dn_id;
      if (!dnId) continue;

      boxCountMap.set(dnId, (boxCountMap.get(dnId) || 0) + 1);

      const status = String(box.status || "").toUpperCase();
      if (status === "CLOSED") {
        closedBoxMap.set(dnId, (closedBoxMap.get(dnId) || 0) + 1);
      } else {
        openBoxMap.set(dnId, (openBoxMap.get(dnId) || 0) + 1);
      }

      if (box.id) {
        boxToDnMap.set(box.id, dnId);
      }
    }

    const packedMap = new Map<string, number>();
    for (const item of boxItems || []) {
      const dnId = boxToDnMap.get(item.dn_box_id);
      if (!dnId) continue;
      packedMap.set(dnId, (packedMap.get(dnId) || 0) + Number(item.qty || 0));
    }

    const csvHeaders = [
      "dn_no",
      "ship_to",
      "ship_from",
      "status",
      "planned_gi_date",
      "planned_delivery_date",
      "ordered",
      "shipped",
      "packed_wms",
      "balance",
      "box_count",
      "open_box_count",
      "closed_box_count",
      "created_at",
      "shipped_at",
    ];

    const csvRows = filteredHeaders.map((row) => {
      const qtyOrdered = orderedMap.get(row.id) || 0;
      const qtyShipped = shippedMap.get(row.id) || 0;
      const qtyPacked = packedMap.get(row.id) || 0;
      const balance = Math.max(qtyOrdered - qtyShipped, 0);

      return [
        row.dn_no || `DN-${String(row.id).slice(0, 8)}`,
        row.ship_to || row.ship_to_name || row.customer_name || "",
        row.ship_from || "",
        row.status || "PENDING",
        row.planned_gi_date || "",
        row.planned_delivery_date || "",
        qtyOrdered,
        qtyShipped,
        qtyPacked,
        balance,
        boxCountMap.get(row.id) || 0,
        openBoxMap.get(row.id) || 0,
        closedBoxMap.get(row.id) || 0,
        row.created_at || "",
        row.shipped_at || "",
      ];
    });

    const csv = makeCsv(csvHeaders, csvRows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dn_execution_monitor_${view}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}