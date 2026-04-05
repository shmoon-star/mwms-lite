import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
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

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sb = await createClient();

    const { data: header, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .eq("id", id)
      .single();

    if (headerError) {
      return NextResponse.json({ ok: false, error: headerError.message }, { status: 500 });
    }

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("*")
      .eq("dn_id", id)
      .order("created_at", { ascending: true });

    if (lineError) {
      return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("id, dn_id, box_no, status, remarks, packed_at, created_at")
      .eq("dn_id", id)
      .order("created_at", { ascending: false });

    if (boxError) {
      return NextResponse.json({ ok: false, error: boxError.message }, { status: 500 });
    }

    const boxIds = (boxes || []).map((b) => b.id);

    let items: Record<string, any>[] = [];
    if (boxIds.length > 0) {
      const { data: itemRows, error: itemError } = await sb
        .from("dn_box_item")
        .select("*")
        .in("dn_box_id", boxIds)
        .order("created_at", { ascending: true });

      if (itemError) {
        return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
      }

      items = itemRows || [];
    }

    const skuList = [...new Set((lines || []).map((row: any) => row.sku).filter(Boolean))];

    const inventoryMap = new Map<string, number>();
    if (skuList.length > 0) {
      const { data: invRows, error: invError } = await sb
        .from("inventory")
        .select("*")
        .in("sku", skuList);

      if (invError) {
        return NextResponse.json({ ok: false, error: invError.message }, { status: 500 });
      }

      for (const row of invRows || []) {
        inventoryMap.set(row.sku, Number(row.qty_onhand || 0));
      }
    }

    const packedMap = new Map<string, number>();
    for (const item of items) {
      const sku = item.sku;
      if (!sku) continue;
      packedMap.set(sku, (packedMap.get(sku) || 0) + Number(item.qty || 0));
    }

    const normalizedLines = (lines || []).map((row: any) => {
      const qtyOrdered = Number(row.qty_ordered || 0);
      const qtyPacked = packedMap.get(row.sku) || 0;
      const balance = qtyOrdered - qtyPacked;
      const qtyOnhand = inventoryMap.get(row.sku) || 0;

      return {
        id: row.id,
        sku: row.sku,
        product_name:
  row.description ||
  row.product_name ||
  row.sku_name ||
  row.item_name ||
  null,
        qty_ordered: qtyOrdered,
        qty_packed: qtyPacked,
        balance,
        qty_onhand: qtyOnhand,
      };
    });

    const summary = {
      qty_ordered: normalizedLines.reduce((sum, row) => sum + row.qty_ordered, 0),
      qty_packed: normalizedLines.reduce((sum, row) => sum + row.qty_packed, 0),
      balance: normalizedLines.reduce((sum, row) => sum + row.balance, 0),
      box_count: (boxes || []).length,
    };

    const boxMap = new Map<string, Record<string, any>[]>();
    for (const item of items) {
      const prev = boxMap.get(item.dn_box_id) || [];
      prev.push(item);
      boxMap.set(item.dn_box_id, prev);
    }

    const normalizedBoxes = (boxes || []).map((box: any) => ({
      id: box.id,
      dn_id: box.dn_id,
      box_no: box.box_no,
      status: box.status || "OPEN",
      remarks: box.remarks || null,
      packed_at: box.packed_at || null,
      created_at: box.created_at || null,
      items: (boxMap.get(box.id) || []).map((item: any) => ({
        id: item.id,
        dn_box_id: item.dn_box_id,
        sku: item.sku,
        qty: Number(item.qty || 0),
        source_type: item.source_type || "MANUAL",
        created_at: item.created_at || null,
      })),
    }));

    return NextResponse.json({
      ok: true,
      header: {
        id: header.id,
        dn_no: header.dn_no || header.DNNo || header.dnNo || `DN-${String(header.id).slice(0, 8)}`,
        customer_label: pickCustomerLabel(header),
        status: header.status || "OPEN",
        created_at: header.created_at || null,
        shipped_at: header.shipped_at || header.confirmed_at || null,
      },
      summary,
      lines: normalizedLines,
      boxes: normalizedBoxes,
      raw_header: header,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}