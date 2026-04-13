import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/monitor/settlement/dns — 아직 정산되지 않은 모든 shipped/confirmed DN */
export async function GET() {
  try {
    const sb = await createClient();

    // 이미 정산된 DN ID 목록
    const { data: settledDns } = await sb
      .from("monthly_settlement_dn")
      .select("dn_id");

    const settledIds = new Set((settledDns ?? []).map((d: any) => d.dn_id));

    // shipped_at 또는 confirmed_at이 있는 DN (출고 완료된 것)
    const { data: dns, error } = await sb
      .from("dn_header")
      .select("id, dn_no, status, ship_to, shipped_at, confirmed_at, created_at")
      .not("shipped_at", "is", null)
      .order("confirmed_at", { ascending: true });

    if (error) throw error;

    const dnIds = (dns ?? []).filter((d: any) => !settledIds.has(d.id)).map((d: any) => d.id);

    // DN별 수량
    let lineQtyMap = new Map<string, number>();
    if (dnIds.length > 0) {
      const { data: lines } = await sb
        .from("dn_lines")
        .select("dn_id, qty")
        .in("dn_id", dnIds);

      for (const l of lines ?? []) {
        lineQtyMap.set(l.dn_id, (lineQtyMap.get(l.dn_id) ?? 0) + Number(l.qty ?? 0));
      }
    }

    const items = (dns ?? [])
      .filter((d: any) => !settledIds.has(d.id))
      .map((d: any) => ({
        ...d,
        qty: lineQtyMap.get(d.id) ?? 0,
      }));

    return NextResponse.json({
      ok: true,
      items,
      totalQty: items.reduce((s: number, d: any) => s + d.qty, 0),
      totalDns: items.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
