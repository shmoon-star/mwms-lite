import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET — 정산 목록 */
export async function GET() {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("monthly_settlement")
      .select("*")
      .order("settlement_month", { ascending: false });

    if (error) throw error;

    // 각 정산의 DN 수 조회
    const ids = (data ?? []).map((s: any) => s.id);
    let dnCounts = new Map<string, number>();

    if (ids.length > 0) {
      const { data: sdns } = await sb
        .from("monthly_settlement_dn")
        .select("settlement_id");

      for (const sdn of sdns ?? []) {
        dnCounts.set(sdn.settlement_id, (dnCounts.get(sdn.settlement_id) ?? 0) + 1);
      }
    }

    const items = (data ?? []).map((s: any) => ({
      ...s,
      dn_count: dnCounts.get(s.id) ?? 0,
      total_cost: Number(s.forwarding_cost ?? 0) + Number(s.processing_cost ?? 0) + Number(s.other_cost ?? 0),
      cost_per_pcs: s.total_qty > 0
        ? Math.round(((Number(s.forwarding_cost ?? 0) + Number(s.processing_cost ?? 0) + Number(s.other_cost ?? 0)) / s.total_qty) * 100) / 100
        : 0,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

/** POST — 정산 생성 */
export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const body = await req.json();

    const month = String(body.settlement_month ?? "").trim();
    const forwarding = Number(body.forwarding_cost ?? 0);
    const processing = Number(body.processing_cost ?? 0);
    const other = Number(body.other_cost ?? 0);
    const note = String(body.note ?? "").trim();
    const dnItems: { dn_id: string; dn_no: string; ship_to: string; shipped_at: string; qty: number }[] = body.dns ?? [];

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "settlement_month format: YYYY-MM" }, { status: 400 });
    }

    // DN 없이 수동 입력도 허용 (과거 데이터용)
    const manualQty = Number(body.manual_qty ?? 0);
    const totalQty = dnItems.length > 0
      ? dnItems.reduce((s, d) => s + (d.qty ?? 0), 0)
      : manualQty;

    // 정산 헤더 생성
    const { data: settlement, error: sErr } = await sb
      .from("monthly_settlement")
      .insert({
        settlement_month: month,
        forwarding_cost: forwarding,
        processing_cost: processing,
        other_cost: other,
        total_qty: totalQty,
        status: "DRAFT",
        note,
      })
      .select("*")
      .single();

    if (sErr) throw sErr;

    // DN 라인 생성
    const dnRows = dnItems.map(d => ({
      settlement_id: settlement.id,
      dn_id: d.dn_id,
      dn_no: d.dn_no,
      ship_to: d.ship_to || "",
      shipped_at: d.shipped_at || null,
      qty: d.qty ?? 0,
    }));

    const { error: dnErr } = await sb
      .from("monthly_settlement_dn")
      .insert(dnRows);

    if (dnErr) throw dnErr;

    return NextResponse.json({ ok: true, settlement }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
