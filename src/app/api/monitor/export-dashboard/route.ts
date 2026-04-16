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

    // === 상품 master 기반 피벗: 물류 현황 × 브랜드 ===
    // Supabase 기본 1000 row 제한 우회 — 페이지네이션
    const masterData: any[] = [];
    let masterPage = 0;
    const MASTER_PAGE_SIZE = 1000;
    while (true) {
      const { data: chunk, error } = await sb
        .from("history_product_master")
        .select("brand_name, logistics_status, total_order_qty")
        .range(masterPage * MASTER_PAGE_SIZE, (masterPage + 1) * MASTER_PAGE_SIZE - 1);
      if (error) throw error;
      if (!chunk || chunk.length === 0) break;
      masterData.push(...chunk);
      if (chunk.length < MASTER_PAGE_SIZE) break;
      masterPage++;
      if (masterPage > 20) break; // safety
    }

    // 물류 현황 목록 — "입고 전", "행택 부착"만 (선적 완료는 수출 raw에서 추적)
    // Master에는 25fw + 26ss가 섞여있어 선적 완료는 혼동 방지를 위해 제외
    const RELEVANT_STATUSES = ["0. 입고 전", "4. 행택 부착 완료"];
    const logisticsList = RELEVANT_STATUSES;

    // 브랜드 × 물류 현황 매트릭스 (RELEVANT_STATUSES만)
    const brandLogisticsMap = new Map<string, Record<string, number>>();
    for (const m of masterData) {
      if (!m.brand_name) continue;
      const status = m.logistics_status;
      if (!status || !RELEVANT_STATUSES.includes(status)) continue; // 입고 전 / 행택 부착만
      if (!brandLogisticsMap.has(m.brand_name)) {
        brandLogisticsMap.set(m.brand_name, {});
      }
      const row = brandLogisticsMap.get(m.brand_name)!;
      row[status] = (row[status] || 0) + (m.total_order_qty || 0);
    }

    const brandLogistics = Array.from(brandLogisticsMap.entries())
      .map(([brand, counts]) => {
        const total = RELEVANT_STATUSES.reduce((s, st) => s + (counts[st] || 0), 0);
        return { brand, ...counts, total };
      })
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total);

    // 물류 현황별 총합 (입고 전 / 행택 부착만)
    const logisticsSummary: { status: string; qty: number; brand_count: number }[] = [];
    for (const st of RELEVANT_STATUSES) {
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

    // Master 총합 = 입고 전 + 행택 부착 (선적 완료 제외 — 수출 raw에서 추적)
    const masterTotal = logisticsSummary.reduce((s, ls) => s + ls.qty, 0);

    // === 카테고리별 스타일/바코드/수량 집계 (전체 master 기준) ===
    // 전체 master 데이터 별도 로드 (raw_data 포함)
    const fullMasterData: any[] = [];
    let fullPage = 0;
    while (true) {
      const { data: chunk, error } = await sb
        .from("history_product_master")
        .select("style_number, raw_data, total_order_qty")
        .range(fullPage * MASTER_PAGE_SIZE, (fullPage + 1) * MASTER_PAGE_SIZE - 1);
      if (error) break;
      if (!chunk || chunk.length === 0) break;
      fullMasterData.push(...chunk);
      if (chunk.length < MASTER_PAGE_SIZE) break;
      fullPage++;
      if (fullPage > 20) break;
    }

    const categoryMap = new Map<string, {
      category: string;
      styles: Set<string>;
      barcodes: Set<string>;
      qty: number;
    }>();

    for (const m of fullMasterData) {
      const cat = (m.raw_data?.["카테고리"] || "미분류").trim();
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { category: cat, styles: new Set(), barcodes: new Set(), qty: 0 });
      }
      const entry = categoryMap.get(cat)!;
      if (m.style_number) entry.styles.add(m.style_number);
      const barcode = m.raw_data?.["바코드 번호"];
      if (barcode) entry.barcodes.add(String(barcode));
      entry.qty += Number(m.total_order_qty || 0);
    }

    const categories = Array.from(categoryMap.values())
      .map(c => ({
        category: c.category,
        unique_styles: c.styles.size,
        unique_barcodes: c.barcodes.size,
        total_qty: c.qty,
      }))
      .sort((a, b) => b.total_qty - a.total_qty);

    // === 상품 샘플 (무신사 UID 있는 상품, 브랜드별 1개씩) ===
    const productSamples: any[] = [];
    const seenBrands = new Set<string>();
    for (const m of fullMasterData) {
      const uid = m.raw_data?.["무신사 UID * 상품 등록 안 되어 있는 경우 추후 전달"]
        || m.raw_data?.["무신사 UID"]
        || m.raw_data?.["무신사\nUID"];
      const brand = m.raw_data?.["브랜드명"];
      if (!uid || !brand || seenBrands.has(brand)) continue;
      const numUid = String(uid).match(/\d+/)?.[0];
      if (!numUid) continue;

      seenBrands.add(brand);
      productSamples.push({
        uid: numUid,
        brand,
        style_color_code: m.raw_data?.["스타일넘버 (컬러까지) * 컬러 단위까지 다르게 기입"]
          || m.raw_data?.["스타일넘버 (컬러까지)"],
        product_name: m.raw_data?.["상품명 (영문)"] || m.raw_data?.["상품명 (중문) * 컬러명 제외하고 기입"],
        category: m.raw_data?.["카테고리"],
        qty: m.total_order_qty || 0,
        musinsa_url: `https://www.musinsa.com/products/${numUid}`,
      });

      if (productSamples.length >= 24) break;
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
      masterTotal,
      categories,
      productSamples,
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
