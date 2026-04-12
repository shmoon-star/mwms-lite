import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type DnMonitorRow = {
  id: string;
  dn_no: string;
  customer_label: string;
  ship_from: string | null;
  ship_to: string | null;
  status: string;
  qty_ordered: number;
  qty_shipped: number;
  qty_packed: number;
  balance: number;
  boxes: number;
  open_boxes: number;
  closed_boxes: number;
  created_at: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
};

function pickCustomerLabel(row: Record<string, any>) {
  return (
    row.ship_to_name ||
    row.ship_to ||
    row.customer_name ||
    row.company_name ||
    row.destination ||
    row.customer ||
    "-"
  );
}

function isClosedDnStatus(status: string) {
  const s = String(status || "").toUpperCase();
  return s === "CONFIRMED" || s === "SHIPPED";
}

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") || "open").trim().toLowerCase();

    if (!["all", "open", "closed"].includes(view)) {
      return NextResponse.json(
        { ok: false, error: `unsupported view: ${view}` },
        { status: 400 }
      );
    }

    // 1) DN header
    const { data: headers, error: headerErr } = await sb
      .from("dn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerErr) {
      return NextResponse.json(
        { ok: false, error: headerErr.message },
        { status: 500 }
      );
    }

    const dnIds = (headers || []).map((x: any) => x.id).filter(Boolean);

    if (!dnIds.length) {
      return NextResponse.json({
        ok: true,
        summary: {
          total_dn: 0,
          open_dn: 0,
          closed_dn: 0,
          total_ordered: 0,
          total_packed: 0,
          total_balance: 0,
        },
        items: [],
      });
    }

    // 2) DN lines
    const { data: dnLines, error: linesErr } = await sb
      .from("dn_lines")
      .select("dn_id, sku, qty_ordered, qty_shipped")
      .in("dn_id", dnIds);

    if (linesErr) {
      return NextResponse.json(
        { ok: false, error: linesErr.message },
        { status: 500 }
      );
    }

    // 3) DN box
    const { data: dnBoxes, error: boxErr } = await sb
      .from("dn_box")
      .select("id, dn_id, box_no, status, created_at")
      .in("dn_id", dnIds);

    if (boxErr) {
      return NextResponse.json(
        { ok: false, error: boxErr.message },
        { status: 500 }
      );
    }

    const boxIds = (dnBoxes || []).map((x: any) => x.id).filter(Boolean);

    // 4) DN box item
    let boxItems: any[] = [];
    if (boxIds.length) {
      const { data, error } = await sb
        .from("dn_box_item")
        .select("dn_box_id, qty")
        .in("dn_box_id", boxIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      boxItems = data || [];
    }

    // line ordered / shipped 집계
    const orderedMap = new Map<string, number>();
    const shippedMap = new Map<string, number>();
    for (const row of dnLines || []) {
      orderedMap.set(
        row.dn_id,
        (orderedMap.get(row.dn_id) || 0) + safeNum((row as any).qty_ordered)
      );
      shippedMap.set(
        row.dn_id,
        (shippedMap.get(row.dn_id) || 0) + safeNum((row as any).qty_shipped)
      );
    }

    // box id -> dn_id
    const boxDnMap = new Map<string, string>();
    for (const box of dnBoxes || []) {
      boxDnMap.set(box.id, box.dn_id);
    }

    // packed qty 집계 (box item 기준)
    const packedMap = new Map<string, number>();
    for (const item of boxItems || []) {
      const dnId = boxDnMap.get(item.dn_box_id);
      if (!dnId) continue;

      packedMap.set(dnId, (packedMap.get(dnId) || 0) + safeNum(item.qty));
    }

    // box count 집계
    const boxCountMap = new Map<string, number>();
    const openBoxCountMap = new Map<string, number>();
    const closedBoxCountMap = new Map<string, number>();

    for (const box of dnBoxes || []) {
      const dnId = box.dn_id;
      const st = String(box.status || "").toUpperCase();

      boxCountMap.set(dnId, (boxCountMap.get(dnId) || 0) + 1);

      if (st === "CLOSED" || st === "PACKED") {
        closedBoxCountMap.set(dnId, (closedBoxCountMap.get(dnId) || 0) + 1);
      } else {
        openBoxCountMap.set(dnId, (openBoxCountMap.get(dnId) || 0) + 1);
      }
    }

    const allRows: DnMonitorRow[] = (headers || []).map((header: any) => {
      const qtyOrdered = orderedMap.get(header.id) || 0;
      const qtyShipped = shippedMap.get(header.id) || 0;
      const qtyPacked = packedMap.get(header.id) || 0;
      const balance = Math.max(qtyOrdered - qtyShipped, 0);

      return {
        id: header.id,
        dn_no:
          header.dn_no ||
          header.DNNo ||
          header.dnNo ||
          `DN-${String(header.id).slice(0, 8)}`,
        customer_label: pickCustomerLabel(header),
        ship_from: header.ship_from || null,
        ship_to: header.ship_to || null,
        status: header.status || "PENDING",
        qty_ordered: qtyOrdered,
        qty_shipped: qtyShipped,
        qty_packed: qtyPacked,
        balance,
        boxes: boxCountMap.get(header.id) || 0,
        open_boxes: openBoxCountMap.get(header.id) || 0,
        closed_boxes: closedBoxCountMap.get(header.id) || 0,
        created_at: header.created_at || null,
        shipped_at: header.shipped_at || null,
        confirmed_at: header.confirmed_at || null,
        planned_gi_date: header.planned_gi_date || null,
        planned_delivery_date: header.planned_delivery_date || null,
      };
    });

    let items = allRows;

    if (view === "open") {
      items = allRows.filter((row) => !isClosedDnStatus(row.status));
    } else if (view === "closed") {
      items = allRows.filter((row) => isClosedDnStatus(row.status));
    }

    const summary = {
      total_dn: allRows.length,
      open_dn: allRows.filter((row) => !isClosedDnStatus(row.status)).length,
      closed_dn: allRows.filter((row) => isClosedDnStatus(row.status)).length,
      total_ordered: items.reduce((sum, row) => sum + safeNum(row.qty_ordered), 0),
      total_shipped: items.reduce((sum, row) => sum + safeNum(row.qty_shipped), 0),
      total_packed: items.reduce((sum, row) => sum + safeNum(row.qty_packed), 0),
      total_balance: items.reduce((sum, row) => sum + safeNum(row.balance), 0),
    };

    return NextResponse.json({
      ok: true,
      summary,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}