import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/export-dashboard?season=26ss
 *
 * 수출 대시보드 데이터 집계 (public 접근 허용)
 * 내부 집계 데이터만 노출 — 민감 정보 없음
 */
export async function GET(req: NextRequest) {
  try {
    // Admin client로 RLS 우회 (public 대시보드)
    const sb = createAdminClient();
    const url = new URL(req.url);
    const season = url.searchParams.get("season") || ""; // '', '26ss', '25fw' or 'all'

    // Supabase 기본 1000 row 제한 우회 — 페이지네이션
    const data: any[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      let q = sb.from("history_export_raw").select("*");
      if (season && season !== "all") q = q.eq("order_season", season);
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data: chunk, error } = await q;
      if (error) throw error;
      if (!chunk || chunk.length === 0) break;
      data.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
      if (page > 30) break; // safety (최대 30,000)
    }

    // === Summary ===
    // "실 선적" 지표들은 모두 "CN창고 입고 완료" 상태만 카운트 (실제 도착 완료분)
    // Google Sheet 원본 값의 공백 변형(CN창고/CN 창고, 입고/입 고 등)을 흡수하기 위해
    // 공백 제거 후 비교한다.
    const normalizeStatus = (s: any): string => String(s ?? "").replace(/\s+/g, "");
    const SHIPPED_STATUS_NORM = normalizeStatus("CN창고입고완료");
    const isShipped = (d: any) => normalizeStatus(d.shipment_status) === SHIPPED_STATUS_NORM;
    const summary = {
      total_rows: data.length,
      total_ordered: data.reduce((s, d) => s + (d.qty_ordered || 0), 0),
      total_shipped: data.reduce((s, d) => s + (isShipped(d) ? (d.qty_shipped || 0) : 0), 0),
      total_amount: data.reduce((s, d) => s + (isShipped(d) ? (Number(d.invoice_amount) || 0) : 0), 0),
      unique_brands: new Set(data.filter(isShipped).map(d => d.brand_name).filter(Boolean)).size,
      unique_bl: new Set(data.filter(isShipped).map(d => d.bl_no).filter(Boolean)).size,
    };

    // === 월별 DC 출고 (dc_outbound_date 기준, CN창고 입고 완료분만) ===
    const monthlyMap = new Map<string, { year_month: string; qty_shipped: number; row_count: number }>();
    for (const d of data) {
      if (!d.dc_outbound_date) continue;
      if (!isShipped(d)) continue;
      const ym = String(d.dc_outbound_date).slice(0, 7);
      if (!monthlyMap.has(ym)) monthlyMap.set(ym, { year_month: ym, qty_shipped: 0, row_count: 0 });
      const e = monthlyMap.get(ym)!;
      e.qty_shipped += d.qty_shipped || 0;
      e.row_count += 1;
    }
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.year_month.localeCompare(b.year_month));

    // === 브랜드별 (Top 20, 실 선적 수량 기준, CN창고 입고 완료분만) ===
    const brandMap = new Map<string, { brand: string; qty_shipped: number; qty_ordered: number }>();
    for (const d of data) {
      if (!d.brand_name) continue;
      if (!isShipped(d)) continue;
      if (!brandMap.has(d.brand_name)) brandMap.set(d.brand_name, { brand: d.brand_name, qty_shipped: 0, qty_ordered: 0 });
      const e = brandMap.get(d.brand_name)!;
      e.qty_shipped += d.qty_shipped || 0;
      e.qty_ordered += d.qty_ordered || 0;
    }
    const brands = Array.from(brandMap.values())
      .sort((a, b) => b.qty_shipped - a.qty_shipped)
      .slice(0, 20);

    // === 시즌 × Shipment Status ===
    const statusMap = new Map<string, { key: string; season: string; status: string; qty: number; brand_count: number; brands: Set<string> }>();
    for (const d of data) {
      const key = `${d.order_season || ""}|${d.shipment_status || ""}`;
      if (!statusMap.has(key)) {
        statusMap.set(key, {
          key,
          season: d.order_season || "",
          status: d.shipment_status || "",
          qty: 0,
          brand_count: 0,
          brands: new Set(),
        });
      }
      const e = statusMap.get(key)!;
      e.qty += d.qty_shipped || 0;
      if (d.brand_name) e.brands.add(d.brand_name);
    }
    const status = Array.from(statusMap.values()).map(s => ({
      season: s.season,
      status: s.status,
      qty: s.qty,
      brand_count: s.brands.size,
    }));

    // === Lead Time 평균 (실제 날짜 기준 재계산) ===
    // 각 구간별 모수: 양쪽 날짜가 모두 있고, 차이가 양수(0~90일)인 건만 포함
    // CN 입고 미도착 건은 제외
    const diffDays = (a: any, b: any): number | null => {
      if (!a || !b) return null;
      const d1 = new Date(a).getTime();
      const d2 = new Date(b).getTime();
      if (isNaN(d1) || isNaN(d2)) return null;
      const days = Math.round((d2 - d1) / 86400000);
      // 이상치 제거: 음수이거나 90일 초과 시 제외
      if (days < 0 || days > 90) return null;
      return days;
    };

    const leadStage1: number[] = []; // DC 입고 → DC 출고
    const leadStage2: number[] = []; // DC 출고 → 선적 (ATD)
    const leadStage3: number[] = []; // 선적 → CN 도착 (ATA Warehouse)
    const leadTotal: number[] = [];  // DC 입고 → CN 도착 (전체)

    for (const d of data) {
      const s1 = diffDays(d.dc_inbound_date, d.dc_outbound_date);
      const s2 = diffDays(d.dc_outbound_date, d.atd_port || d.shipment_date);
      const s3 = diffDays(d.atd_port || d.shipment_date, d.ata_warehouse);
      const tot = diffDays(d.dc_inbound_date, d.ata_warehouse);

      if (s1 !== null) leadStage1.push(s1);
      if (s2 !== null) leadStage2.push(s2);
      if (s3 !== null) leadStage3.push(s3); // CN 미도착은 null → 자동 제외
      if (tot !== null) leadTotal.push(tot);
    }

    const leadTime = {
      dc_in_to_dc_out: avg(leadStage1),
      dc_out_to_shipment: avg(leadStage2),
      dc_out_to_cn_in: avg(leadStage3),
      total_avg: avg(leadTotal),
      counts: {
        stage1: leadStage1.length,
        stage2: leadStage2.length,
        stage3: leadStage3.length,
        total: leadTotal.length,
      },
    };

    // === 최근 sync 로그 ===
    const { data: logs } = await sb
      .from("history_sync_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ok: true,
      summary,
      monthly,
      brands,
      status,
      leadTime,
      syncLogs: logs || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10;
}

