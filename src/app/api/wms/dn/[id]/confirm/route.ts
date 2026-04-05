import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function n(v: unknown) {
  return Number(v ?? 0);
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id: dnId } = await params;
    const sb = await createClient();

    if (!dnId) {
      return NextResponse.json(
        { ok: false, error: "dn id is required" },
        { status: 400 }
      );
    }

    const { data: header, error: headerError } = await sb
      .from("dn_header")
      .select("*")
      .eq("id", dnId)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: headerError?.message || "DN not found" },
        { status: 404 }
      );
    }

    const currentStatus = String(header.status || "").toUpperCase();
    if (currentStatus === "SHIPPED") {
      return NextResponse.json(
        { ok: false, error: "DN already shipped" },
        { status: 400 }
      );
    }

    const { data: lines, error: lineError } = await sb
      .from("dn_lines")
      .select("*")
      .eq("dn_id", dnId)
      .order("id", { ascending: true });

    if (lineError) {
      return NextResponse.json(
        { ok: false, error: lineError.message },
        { status: 500 }
      );
    }

    const lineRows = lines || [];
    if (lineRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No DN lines found" },
        { status: 400 }
      );
    }

    const { data: boxes, error: boxError } = await sb
      .from("dn_box")
      .select("id")
      .eq("dn_id", dnId);

    if (boxError) {
      return NextResponse.json(
        { ok: false, error: boxError.message },
        { status: 500 }
      );
    }

    const boxIds = (boxes || []).map((b: any) => b.id);

    let boxItems: any[] = [];
    if (boxIds.length > 0) {
      const { data: itemRows, error: itemError } = await sb
        .from("dn_box_item")
        .select("*")
        .in("dn_box_id", boxIds);

      if (itemError) {
        return NextResponse.json(
          { ok: false, error: itemError.message },
          { status: 500 }
        );
      }

      boxItems = itemRows || [];
    }

    const packedMap = new Map<string, number>();
    for (const item of boxItems) {
      const sku = String(item.sku || "");
      if (!sku) continue;
      packedMap.set(sku, (packedMap.get(sku) || 0) + n(item.qty));
    }

    let totalPacked = 0;
    let totalOrdered = 0;

    for (const line of lineRows) {
      const sku = String(line.sku || "");
      const ordered = n(line.qty_ordered ?? line.qty);
      const packed = packedMap.get(sku) || 0;

      totalOrdered += ordered;
      totalPacked += packed;
    }

    if (totalPacked <= 0) {
      return NextResponse.json(
        { ok: false, error: "Cannot confirm. packed qty is 0." },
        { status: 400 }
      );
    }

    for (const line of lineRows) {
      const sku = String(line.sku || "");
      const packed = packedMap.get(sku) || 0;

      if (packed <= 0) continue;

      const { data: invRow, error: invError } = await sb
        .from("inventory")
        .select("*")
        .eq("sku", sku)
        .maybeSingle();

      if (invError) {
        return NextResponse.json(
          { ok: false, error: invError.message },
          { status: 500 }
        );
      }

      if (!invRow) {
        return NextResponse.json(
          { ok: false, error: `Inventory not found for sku=${sku}` },
          { status: 400 }
        );
      }

      const nextOnhand = n(invRow.qty_onhand) - packed;
      const nextReserved = Math.max(n(invRow.qty_reserved) - packed, 0);

      const { error: invUpdateError } = await sb
        .from("inventory")
        .update({
          qty_onhand: nextOnhand,
          qty_reserved: nextReserved,
        })
        .eq("sku", sku);

      if (invUpdateError) {
        return NextResponse.json(
          { ok: false, error: invUpdateError.message },
          { status: 500 }
        );
      }

      const { error: txError } = await sb
        .from("inventory_tx")
        .insert({
          sku,
          tx_type: "DN_SHIP",
          qty_delta: -packed,
          ref_type: "DN",
          ref_id: dnId,
          created_at: new Date().toISOString(),
        });

      if (txError) {
        return NextResponse.json(
          { ok: false, error: txError.message },
          { status: 500 }
        );
      }
    }

    const nextStatus =
      totalPacked >= totalOrdered ? "SHIPPED" : "PARTIAL_SHIPPED";

    const { error: headerUpdateError } = await sb
      .from("dn_header")
      .update({
        status: nextStatus,
        confirmed_at: new Date().toISOString(),
        shipped_at: new Date().toISOString(),
      })
      .eq("id", dnId);

    if (headerUpdateError) {
      return NextResponse.json(
        { ok: false, error: headerUpdateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      dn_id: dnId,
      status: nextStatus,
      total_ordered: totalOrdered,
      total_packed: totalPacked,
      total_balance: Math.max(totalOrdered - totalPacked, 0),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}