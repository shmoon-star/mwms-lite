import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isOpenDnStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return ["OPEN", "PACKING", "PACKED", "PENDING", "DRAFT", "CREATED"].includes(s);
}

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

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") || "open").trim().toLowerCase();

    const { data: headers, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerError) {
      return NextResponse.json(
        { ok: false, error: headerError.message },
        { status: 500 }
      );
    }

    const headerRows = (headers || []) as Record<string, any>[];

    const filteredHeaders =
      view === "closed"
        ? headerRows.filter((row) => !isOpenDnStatus(row.status))
        : headerRows.filter((row) => isOpenDnStatus(row.status));

    const dnIds = filteredHeaders.map((row) => row.id).filter(Boolean);

    if (dnIds.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("*")
      .in("dn_id", dnIds);

    if (lineError) {
      return NextResponse.json(
        { ok: false, error: lineError.message },
        { status: 500 }
      );
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("dn_id, status")
      .in("dn_id", dnIds);

    if (boxError) {
      return NextResponse.json(
        { ok: false, error: boxError.message },
        { status: 500 }
      );
    }

    const { data: boxItems, error: boxItemError } = await sb
      .from("dn_box_item")
      .select("qty, dn_box!inner(dn_id)")
      .in("dn_box.dn_id", dnIds);

    if (boxItemError) {
      return NextResponse.json(
        { ok: false, error: boxItemError.message },
        { status: 500 }
      );
    }

    const orderedMap = new Map<string, number>();
    for (const row of (lines || []) as Record<string, any>[]) {
      const dnId = row.dn_id;
      const qtyOrdered = Number(row.qty_ordered || 0);
      if (!dnId) continue;
      orderedMap.set(dnId, (orderedMap.get(dnId) || 0) + qtyOrdered);
    }

    const boxCountMap = new Map<string, number>();
    const openBoxMap = new Map<string, number>();
    const closedBoxMap = new Map<string, number>();

    for (const row of (boxes || []) as Record<string, any>[]) {
      const dnId = row.dn_id;
      if (!dnId) continue;

      boxCountMap.set(dnId, (boxCountMap.get(dnId) || 0) + 1);

      const s = String(row.status || "").toUpperCase();
      if (s === "CLOSED") {
        closedBoxMap.set(dnId, (closedBoxMap.get(dnId) || 0) + 1);
      } else {
        openBoxMap.set(dnId, (openBoxMap.get(dnId) || 0) + 1);
      }
    }

    const packedMap = new Map<string, number>();
    for (const row of (boxItems || []) as Record<string, any>[]) {
      const dnId = row.dn_box?.dn_id;
      if (!dnId) continue;
      packedMap.set(dnId, (packedMap.get(dnId) || 0) + Number(row.qty || 0));
    }

    const items = filteredHeaders.map((row) => {
      const id = row.id;
      const qtyOrdered = orderedMap.get(id) || 0;
      const qtyPacked = packedMap.get(id) || 0;
      const balance = qtyOrdered - qtyPacked;
      const progress = qtyOrdered > 0 ? Math.round((qtyPacked / qtyOrdered) * 100) : 0;

      return {
        id,
        dn_no: row.dn_no || row.DNNo || row.dnNo || `DN-${String(id).slice(0, 8)}`,
        customer_label: pickCustomerLabel(row),
        status: row.status || "OPEN",
        qty_ordered: qtyOrdered,
        qty_packed: qtyPacked,
        balance,
        progress,
        box_count: boxCountMap.get(id) || 0,
        open_box_count: openBoxMap.get(id) || 0,
        closed_box_count: closedBoxMap.get(id) || 0,
        created_at: row.created_at || null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}