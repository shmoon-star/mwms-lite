import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_REASONS = ["DEFECT_DISPOSAL", "COUNT_ADJUSTMENT"] as const;
type AdjustmentReason = (typeof VALID_REASONS)[number];

const REASON_LABELS: Record<AdjustmentReason, string> = {
  DEFECT_DISPOSAL: "Quality Defect - Disposal Pending",
  COUNT_ADJUSTMENT: "Physical Count Adjustment",
};

type AdjustmentItem = {
  sku: string;
  qty: number; // positive = add, negative = remove
  reason: AdjustmentReason;
  note?: string;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const sb = await createClient();
    const now = new Date().toISOString();

    const body = await req.json().catch(() => null);
    if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items array is required" },
        { status: 400 }
      );
    }

    const items: AdjustmentItem[] = [];
    for (const raw of body.items) {
      const sku = String(raw?.sku ?? "").trim();
      const qty = safeNum(raw?.qty);
      const reason = String(raw?.reason ?? "") as AdjustmentReason;

      if (!sku) {
        return NextResponse.json(
          { ok: false, error: `SKU is required for all adjustment items` },
          { status: 400 }
        );
      }
      if (qty === 0) {
        return NextResponse.json(
          { ok: false, error: `Adjustment qty cannot be 0 for SKU: ${sku}` },
          { status: 400 }
        );
      }
      if (!VALID_REASONS.includes(reason)) {
        return NextResponse.json(
          { ok: false, error: `Invalid reason "${reason}" for SKU: ${sku}. Valid: ${VALID_REASONS.join(", ")}` },
          { status: 400 }
        );
      }

      items.push({ sku, qty, reason, note: raw?.note ?? "" });
    }

    const results: { sku: string; qty: number; reason: string; new_qty_onhand: number }[] = [];

    for (const item of items) {
      const { sku, qty, reason, note } = item;

      // 현재 재고 조회
      const { data: invRow, error: invReadErr } = await sb
        .from("inventory")
        .select("sku, qty_onhand, qty_reserved, allocated")
        .eq("sku", sku)
        .maybeSingle();

      if (invReadErr) {
        return NextResponse.json(
          { ok: false, error: invReadErr.message },
          { status: 500 }
        );
      }

      const currentQty = safeNum(invRow?.qty_onhand);
      const newQty = currentQty + qty;

      // 재고가 음수가 되는 경우 차단 (폐기 시)
      if (newQty < 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Adjustment would result in negative stock for SKU: ${sku} (current: ${currentQty}, adjustment: ${qty})`,
          },
          { status: 400 }
        );
      }

      // 재고 업데이트 또는 생성
      if (invRow?.sku) {
        const { error: updateErr } = await sb
          .from("inventory")
          .update({ qty_onhand: newQty })
          .eq("sku", sku);

        if (updateErr) {
          return NextResponse.json(
            { ok: false, error: updateErr.message },
            { status: 500 }
          );
        }
      } else {
        // 재고가 없는 SKU에 조정 (COUNT_ADJUSTMENT만 허용)
        if (reason === "DEFECT_DISPOSAL") {
          return NextResponse.json(
            { ok: false, error: `No inventory found for SKU: ${sku}. Cannot dispose non-existent stock.` },
            { status: 400 }
          );
        }

        const { error: insertErr } = await sb.from("inventory").insert({
          sku,
          qty_onhand: qty,
          qty_reserved: 0,
          allocated: 0,
        });

        if (insertErr) {
          return NextResponse.json(
            { ok: false, error: insertErr.message },
            { status: 500 }
          );
        }
      }

      // inventory_tx 기록
      const reasonLabel = REASON_LABELS[reason];
      const txNote = [
        `Adjustment: ${reasonLabel}`,
        note ? `Note: ${note}` : null,
        `Before: ${currentQty} → After: ${newQty}`,
      ]
        .filter(Boolean)
        .join(" / ");

      const { error: txErr } = await sb.from("inventory_tx").insert({
        sku,
        qty: qty,
        qty_delta: qty,
        tx_type: "ADJUSTMENT",
        ref_type: "ADJUSTMENT",
        ref_id: null,
        note: txNote,
        created_at: now,
      });

      if (txErr) {
        return NextResponse.json(
          { ok: false, error: txErr.message },
          { status: 500 }
        );
      }

      results.push({ sku, qty, reason: reasonLabel, new_qty_onhand: newQty });
    }

    return NextResponse.json({
      ok: true,
      message: `${results.length} adjustment(s) applied successfully`,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
