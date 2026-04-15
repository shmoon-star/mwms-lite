import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/export-dashboard?season=26ss
 *
 * 수출 대시보드 데이터 집계 (admin 전용)
 */
export async function GET(req: NextRequest) {
  try {
    // Auth check: ADMIN 유저만 접근
    const profile = await getCurrentUserProfile();
    if (profile.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden: ADMIN only" }, { status: 403 });
    }

    // Admin client로 RLS 우회 (이미 위에서 권한 검증함)
    const sb = createAdminClient();
    const url = new URL(req.url);
    const season = url.searchParams.get("season") || ""; // '', '26ss', '25fw' or 'all'

    let query = sb.from("history_export_raw").select("*");
    if (season && season !== "all") query = query.eq("order_season", season);
    query = query.limit(20000);

    const { data: rows, error } = await query;
    if (error) throw error;

    const data = rows || [];

    // === Summary ===
    const summary = {
      total_rows: data.length,
      total_ordered: data.reduce((s, d) => s + (d.qty_ordered || 0), 0),
      total_shipped: data.reduce((s, d) => s + (d.qty_shipped || 0), 0),
      total_amount: data.reduce((s, d) => s + (Number(d.invoice_amount) || 0), 0),
      unique_brands: new Set(data.map(d => d.brand_name).filter(Boolean)).size,
      unique_bl: new Set(data.map(d => d.bl_no).filter(Boolean)).size,
    };

    // === 월별 DC 출고 (dc_outbound_date 기준) ===
    const monthlyMap = new Map<string, { year_month: string; qty_shipped: number; row_count: number }>();
    for (const d of data) {
      if (!d.dc_outbound_date) continue;
      const ym = String(d.dc_outbound_date).slice(0, 7);
      if (!monthlyMap.has(ym)) monthlyMap.set(ym, { year_month: ym, qty_shipped: 0, row_count: 0 });
      const e = monthlyMap.get(ym)!;
      e.qty_shipped += d.qty_shipped || 0;
      e.row_count += 1;
    }
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.year_month.localeCompare(b.year_month));

    // === 브랜드별 (Top 20, 실 선적 수량 기준) ===
    const brandMap = new Map<string, { brand: string; qty_shipped: number; qty_ordered: number }>();
    for (const d of data) {
      if (!d.brand_name) continue;
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

    // === Lead Time 평균 ===
    const leadTime = {
      dc_in_to_dc_out: avg(data.map(d => d.lt_dc_in_to_dc_out).filter(isFiniteNum)),
      dc_out_to_shipment: avg(data.map(d => d.lt_dc_out_to_shipment).filter(isFiniteNum)),
      dc_out_to_cn_in: avg(data.map(d => d.lt_dc_out_to_cn_in).filter(isFiniteNum)),
      total_avg: avg(data.map(d => Number(d.avg_total_lt)).filter(isFiniteNum)),
    };

    // === 상품 master 기반 피벗: 물류 현황 × 브랜드 ===
    const { data: masterRows } = await sb
      .from("history_product_master")
      .select("brand_name, logistics_status, total_order_qty")
      .limit(20000);

    const masterData = masterRows || [];

    // 물류 현황 목록 (정렬)
    const logisticsSet = new Set<string>();
    for (const m of masterData) {
      if (m.logistics_status) logisticsSet.add(m.logistics_status);
    }
    const logisticsList = Array.from(logisticsSet).sort();

    // 브랜드 × 물류 현황 매트릭스
    const brandLogisticsMap = new Map<string, Record<string, number>>();
    for (const m of masterData) {
      if (!m.brand_name) continue;
      if (!brandLogisticsMap.has(m.brand_name)) {
        brandLogisticsMap.set(m.brand_name, {});
      }
      const row = brandLogisticsMap.get(m.brand_name)!;
      const status = m.logistics_status || "미지정";
      row[status] = (row[status] || 0) + (m.total_order_qty || 0);
    }

    const brandLogistics = Array.from(brandLogisticsMap.entries())
      .map(([brand, counts]) => {
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        return { brand, ...counts, total };
      })
      .sort((a, b) => b.total - a.total);

    // 물류 현황별 총합
    const logisticsSummary: { status: string; qty: number; brand_count: number }[] = [];
    for (const st of logisticsList) {
      let qty = 0;
      let brandCount = 0;
      for (const [, counts] of brandLogisticsMap) {
        if (counts[st]) {
          qty += counts[st];
          brandCount += 1;
        }
      }
      logisticsSummary.push({ status: st, qty, brand_count: brandCount });
    }

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
      logisticsList,
      brandLogistics,
      logisticsSummary,
      masterTotal: masterData.reduce((s, m) => s + (m.total_order_qty || 0), 0),
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

function isFiniteNum(n: any): n is number {
  return typeof n === "number" && isFinite(n);
}
