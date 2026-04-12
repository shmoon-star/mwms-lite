import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const dnId = String(id ?? "").trim();
    if (!dnId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const sb = await createClient();

    // ── 1. 헤더 조회 ──────────────────────────────────────────
    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status")
      .eq("id", dnId)
      .single();

    if (hErr) throw hErr;
    if (!header) return NextResponse.json({ ok: false, error: "DN not found" }, { status: 404 });

    const s = String(header.status ?? "").toUpperCase();

    if (s === "CANCELLED") {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }
    if (["SHIPPED", "CONFIRMED"].includes(s)) {
      return NextResponse.json(
        { ok: false, error: `이미 ${s} 상태인 DN은 취소할 수 없습니다.` },
        { status: 400 }
      );
    }

    // ── 2. DN 라인 조회 ───────────────────────────────────────
    const { data: lines, error: lErr } = await sb
      .from("dn_lines")
      .select("id, sku, qty_ordered, qty_packed, qty_shipped")
      .eq("dn_id", dnId);

    if (lErr) throw lErr;

    // ── 3. 예약 재고 복원 (RESERVED 이상인 경우) ─────────────
    // 레코드는 그대로 유지하고 inventory qty_reserved만 원복
    const needsInvRestore = ["RESERVED", "PICKED", "PACKING", "PACKED"].includes(s);

    if (needsInvRestore && (lines ?? []).length > 0) {
      for (const line of lines ?? []) {
        const sku = String(line.sku ?? "").trim();
        const qty = Number(line.qty_ordered ?? 0);
        if (!sku || qty <= 0) continue;

        const { data: inv, error: invErr } = await sb
          .from("inventory")
          .select("sku, qty_reserved")
          .eq("sku", sku)
          .single();

        if (invErr) throw invErr;
        if (!inv) continue;

        // qty_reserved 차감 (마이너스 방지)
        const newReserved = Math.max(0, Number(inv.qty_reserved ?? 0) - qty);
        const { error: invUpdErr } = await sb
          .from("inventory")
          .update({ qty_reserved: newReserved })
          .eq("sku", sku);

        if (invUpdErr) throw invUpdErr;

        // inventory_tx 취소 로그 기록 (레코드로 남김)
        const { data: existingTx } = await sb
          .from("inventory_tx")
          .select("id")
          .eq("ref_type", "dn_header")
          .eq("ref_id", dnId)
          .eq("sku", sku)
          .eq("tx_type", "DN_CANCEL")
          .maybeSingle();

        if (!existingTx) {
          await sb.from("inventory_tx").insert({
            sku,
            tx_type: "DN_CANCEL",
            qty_delta: -qty,
            ref_type: "dn_header",
            ref_id: dnId,
            note: header.dn_no ? `DN Cancel ${header.dn_no}` : "DN Cancel",
          });
        }
      }
    }

    // ── 4. 박스 상태 → CANCELLED (레코드 보존, 삭제 안 함) ───
    // 박스 안에 무엇이 있었는지 이력이 남아야 하므로 DELETE 하지 않음
    const { data: boxes } = await sb
      .from("dn_box")
      .select("id")
      .eq("dn_id", dnId);

    if ((boxes ?? []).length > 0) {
      const boxIds = (boxes ?? []).map((b) => b.id);
      await sb
        .from("dn_box")
        .update({ status: "CANCELLED" })
        .in("id", boxIds);
      // dn_box_item은 삭제하지 않고 그대로 보존
    }

    // ── 5. DN 헤더 상태 → CANCELLED (레코드 보존) ────────────
    // cancelled_at 컬럼이 없는 경우 fallback 처리
    const now = new Date().toISOString();
    const { error: hdrUpdErr } = await sb
      .from("dn_header")
      .update({ status: "CANCELLED", cancelled_at: now })
      .eq("id", dnId);

    if (hdrUpdErr) {
      // cancelled_at 컬럼 미존재 시 status만 업데이트
      const { error: fallbackErr } = await sb
        .from("dn_header")
        .update({ status: "CANCELLED" })
        .eq("id", dnId);
      if (fallbackErr) throw fallbackErr;
    }

    return NextResponse.json({ ok: true, status: "CANCELLED" });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
