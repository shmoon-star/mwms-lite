import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeStatusByPacking(totalOrdered: number, totalPacked: number) {
  if (totalPacked <= 0) return "OPEN";
  if (totalPacked < totalOrdered) return "PACKING";
  return "PACKED";
}

async function recalcDnStatus(sb: any, dnId: string) {
  const { data: dnLines, error: dnLinesError } = await sb
    .from("dn_lines")
    .select("*")
    .eq("dn_id", dnId);

  if (dnLinesError) throw dnLinesError;

  const { data: packedItems, error: packedItemsError } = await sb
    .from("dn_box_item")
    .select("qty, dn_box!inner(dn_id)")
    .eq("dn_box.dn_id", dnId);

  if (packedItemsError) throw packedItemsError;

  const totalOrdered = (dnLines || []).reduce(
    (sum: number, row: any) => sum + Number(row.qty_ordered || 0),
    0
  );

  const totalPacked = (packedItems || []).reduce(
    (sum: number, row: any) => sum + Number(row.qty || 0),
    0
  );

  const nextStatus = normalizeStatusByPacking(totalOrdered, totalPacked);

  const { error: headerUpdateError } = await sb
    .from("dn_header")
    .update({
      status: nextStatus,
    })
    .eq("id", dnId);

  if (headerUpdateError) throw headerUpdateError;

  return nextStatus;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id: dnId } = await params;
    const sb = await createClient();
    const body = await req.json().catch(() => ({}));

    const action = String(body?.action || "").trim();

    if (!action) {
      return NextResponse.json(
        { ok: false, error: "action is required" },
        { status: 400 }
      );
    }

    if (action === "create_box") {
      const boxNo = String(body?.box_no || "").trim();
      const remarks = String(body?.remarks || "").trim() || null;
      const boxType = String(body?.box_type || "").trim() || null;
      const boxWeightKg =
        body?.box_weight_kg === "" || body?.box_weight_kg == null
          ? null
          : Number(body.box_weight_kg);

      if (!boxNo) {
        return NextResponse.json(
          { ok: false, error: "box_no is required" },
          { status: 400 }
        );
      }

      if (boxWeightKg != null && (!Number.isFinite(boxWeightKg) || boxWeightKg < 0)) {
        return NextResponse.json(
          { ok: false, error: "box_weight_kg must be 0 or greater" },
          { status: 400 }
        );
      }

      const { data: existing, error: existingError } = await sb
        .from("dn_box")
        .select("*")
        .eq("dn_id", dnId)
        .eq("box_no", boxNo)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json(
          { ok: false, error: existingError.message },
          { status: 500 }
        );
      }

      if (existing) {
        return NextResponse.json({
          ok: true,
          message: "Box already exists",
          box: existing,
        });
      }

      const { data: created, error: createError } = await sb
        .from("dn_box")
        .insert({
          dn_id: dnId,
          box_no: boxNo,
          status: "OPEN",
          remarks,
          box_type: boxType,
          box_weight_kg: boxWeightKg,
        })
        .select("*")
        .single();

      if (createError) {
        return NextResponse.json(
          { ok: false, error: createError.message },
          { status: 500 }
        );
      }

      try {
        await recalcDnStatus(sb, dnId);
      } catch {}

      return NextResponse.json({ ok: true, box: created });
    }

    if (action === "add_item") {
      const boxId = String(body?.box_id || "").trim();
      const sku = String(body?.sku || "").trim();
      const qty = Number(body?.qty || 0);

      if (!boxId || !sku || qty <= 0) {
        return NextResponse.json(
          { ok: false, error: "box_id, sku, qty(>0) are required" },
          { status: 400 }
        );
      }

      const { data: box, error: boxError } = await sb
        .from("dn_box")
        .select("*")
        .eq("id", boxId)
        .eq("dn_id", dnId)
        .single();

      if (boxError) {
        return NextResponse.json(
          { ok: false, error: boxError.message },
          { status: 500 }
        );
      }

      if (String(box.status || "").toUpperCase() === "CLOSED") {
        return NextResponse.json(
          { ok: false, error: "Closed box cannot be modified" },
          { status: 400 }
        );
      }

      const { data: dnLine, error: dnLineError } = await sb
        .from("dn_lines")
        .select("*")
        .eq("dn_id", dnId)
        .eq("sku", sku)
        .maybeSingle();

      if (dnLineError) {
        return NextResponse.json(
          { ok: false, error: dnLineError.message },
          { status: 500 }
        );
      }

      if (!dnLine) {
        return NextResponse.json(
          { ok: false, error: `SKU not found in DN lines: ${sku}` },
          { status: 400 }
        );
      }

      const { data: allItems, error: allItemsError } = await sb
        .from("dn_box_item")
        .select("*, dn_box!inner(dn_id)")
        .eq("sku", sku)
        .eq("dn_box.dn_id", dnId);

      if (allItemsError) {
        return NextResponse.json(
          { ok: false, error: allItemsError.message },
          { status: 500 }
        );
      }

      const alreadyPacked = (allItems || []).reduce((sum: number, row: any) => {
        return sum + Number(row.qty || 0);
      }, 0);

      const qtyOrdered = Number(dnLine.qty_ordered || 0);

      if (alreadyPacked + qty > qtyOrdered) {
        return NextResponse.json(
          {
            ok: false,
            error: `Packed qty exceeds ordered qty. sku=${sku}, ordered=${qtyOrdered}, packed=${alreadyPacked}, request=${qty}`,
          },
          { status: 400 }
        );
      }

      const { data: existingItem, error: existingItemError } = await sb
        .from("dn_box_item")
        .select("*")
        .eq("dn_box_id", boxId)
        .eq("sku", sku)
        .maybeSingle();

      if (existingItemError) {
        return NextResponse.json(
          { ok: false, error: existingItemError.message },
          { status: 500 }
        );
      }

      if (existingItem) {
        const nextQty = Number(existingItem.qty || 0) + qty;

        const { error: updateItemError } = await sb
          .from("dn_box_item")
          .update({
            qty: nextQty,
          })
          .eq("id", existingItem.id);

        if (updateItemError) {
          return NextResponse.json(
            { ok: false, error: updateItemError.message },
            { status: 500 }
          );
        }
      } else {
        const { error: insertItemError } = await sb
          .from("dn_box_item")
          .insert({
            dn_box_id: boxId,
            sku,
            qty,
            source_type: "MANUAL",
          });

        if (insertItemError) {
          return NextResponse.json(
            { ok: false, error: insertItemError.message },
            { status: 500 }
          );
        }
      }

      const nextStatus = await recalcDnStatus(sb, dnId);

      return NextResponse.json({
        ok: true,
        message: "Item added",
        status: nextStatus,
      });
    }

    if (action === "close_box") {
      const boxId = String(body?.box_id || "").trim();

      if (!boxId) {
        return NextResponse.json(
          { ok: false, error: "box_id is required" },
          { status: 400 }
        );
      }

      const { data: items, error: itemError } = await sb
        .from("dn_box_item")
        .select("id")
        .eq("dn_box_id", boxId);

      if (itemError) {
        return NextResponse.json(
          { ok: false, error: itemError.message },
          { status: 500 }
        );
      }

      if (!items || items.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot close empty box" },
          { status: 400 }
        );
      }

      const { error: closeError } = await sb
        .from("dn_box")
        .update({
          status: "CLOSED",
          packed_at: new Date().toISOString(),
        })
        .eq("id", boxId);

      if (closeError) {
        return NextResponse.json(
          { ok: false, error: closeError.message },
          { status: 500 }
        );
      }

      const nextStatus = await recalcDnStatus(sb, dnId);

      return NextResponse.json({
        ok: true,
        message: "Box closed",
        status: nextStatus,
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}