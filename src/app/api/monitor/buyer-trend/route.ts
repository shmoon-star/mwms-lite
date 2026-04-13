import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function toDateStr(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const sb = await createClient();

    // DN header + lines
    const { data: dns, error: dnErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status, ship_to, created_at, shipped_at, confirmed_at");

    if (dnErr) throw dnErr;

    const dnIds = (dns ?? []).map((d: any) => d.id).filter(Boolean);

    let lines: any[] = [];
    if (dnIds.length > 0) {
      const { data, error } = await sb
        .from("dn_lines")
        .select("dn_id, sku, qty, qty_shipped")
        .in("dn_id", dnIds);
      if (error) throw error;
      lines = data ?? [];
    }

    // DN별 수량 합계
    const dnQtyMap = new Map<string, number>();
    for (const l of lines) {
      const qty = Number(l.qty_shipped ?? l.qty ?? 0);
      dnQtyMap.set(l.dn_id, (dnQtyMap.get(l.dn_id) ?? 0) + qty);
    }

    // GR 데이터 (inbound)
    const { data: grs, error: grErr } = await sb
      .from("gr_header")
      .select("id, status, confirmed_at, created_at");
    if (grErr) throw grErr;

    const grIds = (grs ?? []).map((g: any) => g.id).filter(Boolean);
    let grLines: any[] = [];
    if (grIds.length > 0) {
      const { data, error } = await sb
        .from("gr_line")
        .select("gr_id, qty_received")
        .in("gr_id", grIds);
      if (error) throw error;
      grLines = data ?? [];
    }

    const grQtyMap = new Map<string, number>();
    for (const l of grLines) {
      grQtyMap.set(l.gr_id, (grQtyMap.get(l.gr_id) ?? 0) + Number(l.qty_received ?? 0));
    }

    // ── 바이어(ship_to)별 일별 출고 ──
    const buyerDaily: Record<string, Record<string, number>> = {};
    const allDates = new Set<string>();

    for (const dn of dns ?? []) {
      const buyer = String(dn.ship_to || "").trim();
      if (!buyer) continue;

      const date = toDateStr(dn.shipped_at || dn.created_at);
      if (!date) continue;

      const qty = dnQtyMap.get(dn.id) ?? 0;
      if (qty <= 0) continue;

      if (!buyerDaily[buyer]) buyerDaily[buyer] = {};
      buyerDaily[buyer][date] = (buyerDaily[buyer][date] || 0) + qty;
      allDates.add(date);
    }

    // ── 전체 일별 IN/OUT ──
    const dailyIO: Record<string, { IN: number; OUT: number }> = {};

    // OUT: DN 기준
    for (const dn of dns ?? []) {
      const date = toDateStr(dn.shipped_at || dn.created_at);
      if (!date) continue;
      const qty = dnQtyMap.get(dn.id) ?? 0;
      if (!dailyIO[date]) dailyIO[date] = { IN: 0, OUT: 0 };
      dailyIO[date].OUT += qty;
      allDates.add(date);
    }

    // IN: GR 기준
    for (const gr of grs ?? []) {
      const date = toDateStr(gr.confirmed_at || gr.created_at);
      if (!date) continue;
      const qty = grQtyMap.get(gr.id) ?? 0;
      if (!dailyIO[date]) dailyIO[date] = { IN: 0, OUT: 0 };
      dailyIO[date].IN += qty;
      allDates.add(date);
    }

    const sortedDates = [...allDates].sort();

    // 바이어별 합계
    const buyerTotals: { buyer: string; total: number }[] = [];
    for (const [buyer, dateMap] of Object.entries(buyerDaily)) {
      buyerTotals.push({ buyer, total: Object.values(dateMap).reduce((s, v) => s + v, 0) });
    }
    buyerTotals.sort((a, b) => b.total - a.total);

    const dailyArr = sortedDates.map(date => ({
      date: date.slice(5), // MM-DD
      IN: dailyIO[date]?.IN ?? 0,
      OUT: dailyIO[date]?.OUT ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      dates: sortedDates.map(d => d.slice(5)),
      daily: dailyArr,
      buyers: buyerDaily,
      buyerTotals,
      summary: {
        totalIN: dailyArr.reduce((s, d) => s + d.IN, 0),
        totalOUT: dailyArr.reduce((s, d) => s + d.OUT, 0),
        days: sortedDates.length,
        buyerCount: buyerTotals.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
