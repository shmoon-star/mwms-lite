/**
 * 패킹리스트 수량 검증
 * PO SKU별 발주수량 vs PL SKU별 포장수량 비교
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type SkuQtyMismatch = {
  sku: string;
  po_qty: number;
  pl_qty: number;
  diff: number; // pl_qty - po_qty (양수=초과, 음수=부족)
};

export type QtyValidationResult =
  | { ok: true; skuRows: { sku: string; po_qty: number; pl_qty: number }[] }
  | { ok: false; mismatches: SkuQtyMismatch[]; skuRows: { sku: string; po_qty: number; pl_qty: number }[]; message: string };

export const QTY_MISMATCH_MESSAGE =
  "발주수량과 납품예정수량이 일치하지 않습니다. 담당 MD와 재확인 후 필요 시 수정을 요청해 주세요.";

/**
 * @param sb      Supabase 클라이언트 (server 또는 admin)
 * @param poNo    po_header.po_no
 * @param plId    packing_list_header.id
 */
export async function validatePlQtyByPo(
  sb: SupabaseClient,
  poNo: string,
  plId: string
): Promise<QtyValidationResult> {
  // ── 1. PO 라인: SKU별 발주수량 합산 ──────────────────────────────
  const { data: poHeaderRow, error: poHeaderErr } = await sb
    .from("po_header")
    .select("id")
    .eq("po_no", poNo)
    .maybeSingle();

  if (poHeaderErr) throw new Error(poHeaderErr.message);

  let poSkuMap = new Map<string, number>();

  if (poHeaderRow?.id) {
    const { data: poLines, error: poLineErr } = await sb
      .from("po_line")
      .select("sku, qty_ordered, qty")
      .eq("po_id", poHeaderRow.id);

    if (poLineErr) throw new Error(poLineErr.message);

    for (const row of poLines ?? []) {
      const sku = String(row.sku ?? "").trim();
      if (!sku) continue;
      const qty = Number(row.qty_ordered ?? row.qty ?? 0);
      poSkuMap.set(sku, (poSkuMap.get(sku) ?? 0) + (Number.isFinite(qty) ? qty : 0));
    }
  }

  // ── 2. PL 라인: SKU별 포장수량 합산 ─────────────────────────────
  const { data: plLines, error: plLineErr } = await sb
    .from("packing_list_lines")
    .select("sku, qty")
    .eq("packing_list_id", plId);

  if (plLineErr) throw new Error(plLineErr.message);

  const plSkuMap = new Map<string, number>();
  for (const row of plLines ?? []) {
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    const qty = Number(row.qty ?? 0);
    plSkuMap.set(sku, (plSkuMap.get(sku) ?? 0) + (Number.isFinite(qty) ? qty : 0));
  }

  // ── 3. 전체 SKU 합집합 비교 ──────────────────────────────────────
  const allSkus = new Set([...poSkuMap.keys(), ...plSkuMap.keys()]);

  const skuRows: { sku: string; po_qty: number; pl_qty: number }[] = [];
  const mismatches: SkuQtyMismatch[] = [];

  for (const sku of Array.from(allSkus).sort()) {
    const po_qty = poSkuMap.get(sku) ?? 0;
    const pl_qty = plSkuMap.get(sku) ?? 0;
    skuRows.push({ sku, po_qty, pl_qty });

    if (po_qty !== pl_qty) {
      mismatches.push({ sku, po_qty, pl_qty, diff: pl_qty - po_qty });
    }
  }

  if (mismatches.length > 0) {
    return { ok: false, mismatches, skuRows, message: QTY_MISMATCH_MESSAGE };
  }

  return { ok: true, skuRows };
}
