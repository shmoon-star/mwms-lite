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

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("*")
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
    for (const line of lines || []) {
      const dnId = line.dn_id;
      if (!dnId) continue;
      orderedMap.set(dnId, (orderedMap.get(dnId) || 0) + Number(line.qty_ordered || 0));
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

    const items = filteredHeaders.map((row) => {
      const qtyOrdered = orderedMap.get(row.id) || 0;
      const qtyPacked = packedMap.get(row.id) || 0;
      const balance = qtyOrdered - qtyPacked;

      return {
        id: row.id,
        dn_no: row.dn_no || `DN-${String(row.id).slice(0, 8)}`,
        customer_label:
          row.ship_to ||
          row.ship_to_name ||
          row.customer_name ||
          row.customer ||
          "-",
        status: row.status || "OPEN",
        qty_ordered: qtyOrdered,
        qty_packed: qtyPacked,
        balance,
        box_count: boxCountMap.get(row.id) || 0,
        open_box_count: openBoxMap.get(row.id) || 0,
        closed_box_count: closedBoxMap.get(row.id) || 0,
        created_at: row.created_at || null,
        shipped_at: row.shipped_at || null,
      };
    });

    const summary = {
      total_dn: items.length,
      open_dn: items.filter((row) => !isClosedStatus(row.status)).length,
      closed_dn: items.filter((row) => isClosedStatus(row.status)).length,
      total_ordered: items.reduce((sum, row) => sum + row.qty_ordered, 0),
      total_packed: items.reduce((sum, row) => sum + row.qty_packed, 0),
      total_balance: items.reduce((sum, row) => sum + row.balance, 0),
    };

    return NextResponse.json({
      ok: true,
      summary,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}