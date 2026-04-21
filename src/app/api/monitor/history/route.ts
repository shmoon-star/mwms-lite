import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/history?bu=CN
 *
 * Summary + Charts용 집계 데이터 반환
 * - bu 파라미터 있으면 해당 BU만 집계 (CN/JP/TW)
 * - bu 없거나 "ALL"이면 전체 BU 합산
 */
export async function GET(req: NextRequest) {
  try {
    const buParam = (req.nextUrl.searchParams.get("bu") || "").trim().toUpperCase();
    const bu = buParam && buParam !== "ALL" ? buParam : null;

    const sb = await createClient();

    // Supabase 기본 1000행 제한 우회 — 페이지네이션으로 전체 조회
    const PAGE_SIZE = 1000;

    const documents: any[] = [];
    {
      let page = 0;
      while (true) {
        let q = sb
          .from("history_document")
          .select("*")
          // tie-breaker `id` 필수 — 같은 doc_date row가 많을 때 페이지 경계에서
          // 중복/누락 발생하던 버그 수정
          .order("doc_date", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (bu) q = q.eq("business_unit", bu);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        documents.push(...data);
        if (data.length < PAGE_SIZE) break;
        page += 1;
        if (page > 100) break; // safety: 최대 100,000행
      }
    }

    const settlements: any[] = [];
    {
      let page = 0;
      while (true) {
        let q = sb
          .from("history_settlement")
          .select("*")
          .order("year_month", { ascending: true })
          .order("id", { ascending: true })  // tie-breaker
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (bu) q = q.eq("business_unit", bu);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        settlements.push(...data);
        if (data.length < PAGE_SIZE) break;
        page += 1;
        if (page > 50) break; // safety: 최대 50,000행
      }
    }

    // 선택된 BU별 row 개수 (UI에서 탭 뱃지 표시용)
    const buCounts: Record<string, number> = {};
    if (!bu) {
      // ALL 조회 시 업로드된 BU 목록 조사
      const { data: buRows } = await sb
        .from("history_document")
        .select("business_unit")
        .not("business_unit", "is", null)
        .limit(100000);
      for (const r of buRows || []) {
        const v = (r as any).business_unit as string;
        buCounts[v] = (buCounts[v] || 0) + 1;
      }
    }

    // === Summary ===
    // "건수"는 unique doc_no(문서 번호) 기준으로 카운트 (line 수가 아님)
    const uniqueDocsByType = (type: string): Set<string> => {
      const set = new Set<string>();
      for (const d of documents) {
        if (d.doc_type !== type) continue;
        if (d.doc_no) set.add(String(d.doc_no));
      }
      return set;
    };

    const poDocs = uniqueDocsByType("PO");
    const dnDocs = uniqueDocsByType("DN");
    const shipmentDocs = uniqueDocsByType("SHIPMENT");
    const grDocs = uniqueDocsByType("GR");

    // === Shipment 컨테이너 종류별 분류 ===
    // 같은 shipment_no는 컨테이너 1번만 카운트 (첫 번째 등장값 기준)
    const shipmentContainerMap = new Map<string, string>(); // shipment_no → container
    for (const d of documents) {
      if (d.doc_type !== "SHIPMENT") continue;
      if (!d.doc_no) continue;
      if (shipmentContainerMap.has(String(d.doc_no))) continue;
      const container = (d.container ? String(d.container).trim() : "") || "(미지정)";
      shipmentContainerMap.set(String(d.doc_no), container);
    }
    const containerCountMap = new Map<string, number>();
    for (const c of shipmentContainerMap.values()) {
      containerCountMap.set(c, (containerCountMap.get(c) || 0) + 1);
    }
    const shipmentByContainer = Array.from(containerCountMap.entries())
      .map(([container, count]) => ({ container, count }))
      .sort((a, b) => b.count - a.count);

    const summary = {
      total_docs: poDocs.size + dnDocs.size + shipmentDocs.size + grDocs.size,
      total_lines: documents.length, // 참고용 (총 row 수)
      po_count: poDocs.size,
      dn_count: dnDocs.size,
      shipment_count: shipmentDocs.size,
      gr_count: grDocs.size,
      total_po_qty: documents.filter(d => d.doc_type === "PO").reduce((s, d) => s + (d.qty || 0), 0),
      total_dn_qty: documents.filter(d => d.doc_type === "DN").reduce((s, d) => s + (d.qty || 0), 0),
      total_shipment_qty: documents.filter(d => d.doc_type === "SHIPMENT").reduce((s, d) => s + (d.qty || 0), 0),
      total_gr_qty: documents.filter(d => d.doc_type === "GR").reduce((s, d) => s + (d.qty || 0), 0),
      total_cost: settlements.reduce(
        (s, st) => s + Number(st.forwarding_cost || 0) + Number(st.processing_cost || 0) + Number(st.other_cost || 0),
        0
      ),
      date_range: {
        from: documents.length > 0 ? documents[0]?.doc_date : null,
        to: documents.length > 0 ? documents[documents.length - 1]?.doc_date : null,
      },
    };

    // === 월별 물동량 (by doc_type) ===
    const monthlyMap = new Map<string, { year_month: string; PO: number; DN: number; SHIPMENT: number; GR: number }>();
    for (const d of documents) {
      const ym = d.year_month || (d.doc_date ? String(d.doc_date).slice(0, 7) : null);
      if (!ym) continue;
      if (!monthlyMap.has(ym)) {
        monthlyMap.set(ym, { year_month: ym, PO: 0, DN: 0, SHIPMENT: 0, GR: 0 });
      }
      const entry = monthlyMap.get(ym)!;
      entry[d.doc_type as "PO" | "DN" | "SHIPMENT" | "GR"] += Number(d.qty || 0);
    }
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.year_month.localeCompare(b.year_month));

    // === 브랜드(벤더)별 월별 출고량 (SHIPMENT 기준) ===
    // vendor_code 기준으로 집계 — CN에선 Shipment buyer_code가 실제 브랜드지만
    // JP에선 buyer_code가 "MUSINSA-JP" 법인 하나뿐이라 의미 없음. vendor 기준이
    // 도메인적으로 일관됨. vendor_code가 없으면 buyer_code fallback.
    const buyerMonthlyMap = new Map<
      string,
      { key: string; vendor_code: string | null; buyer_code: string | null; months: Map<string, number> }
    >();
    for (const d of documents) {
      if (d.doc_type !== "SHIPMENT") continue;
      const ym = d.year_month || (d.doc_date ? String(d.doc_date).slice(0, 7) : null);
      if (!ym) continue;
      const vendorCode = d.vendor_code as string | null;
      const buyerCode = d.buyer_code as string | null;
      const key = vendorCode || buyerCode || "UNKNOWN";
      if (!buyerMonthlyMap.has(key)) {
        buyerMonthlyMap.set(key, {
          key,
          vendor_code: vendorCode,
          buyer_code: buyerCode,
          months: new Map(),
        });
      }
      const entry = buyerMonthlyMap.get(key)!;
      entry.months.set(ym, (entry.months.get(ym) || 0) + Number(d.qty || 0));
    }
    const allMonths = Array.from(new Set(monthly.map(m => m.year_month))).sort();

    // vendor 테이블 조회 → vendor_code → vendor_name 매핑
    const vendorCodes = Array.from(
      new Set(
        Array.from(buyerMonthlyMap.values())
          .map(e => e.vendor_code)
          .filter(Boolean) as string[]
      )
    );
    const vendorNameMap = new Map<string, string>();
    if (vendorCodes.length > 0) {
      const { data: vendorRows } = await sb
        .from("vendor")
        .select("*")
        .in("vendor_code", vendorCodes);
      for (const v of vendorRows || []) {
        const code = (v as any).vendor_code || (v as any).code;
        const name = (v as any).vendor_name || (v as any).name;
        if (code && name) vendorNameMap.set(code, name);
      }
    }

    // Top 20 (총 출고량 기준)
    const buyerMonthly = Array.from(buyerMonthlyMap.values())
      .map(entry => {
        const row: any = {
          vendor_code: entry.vendor_code,
          vendor_name: entry.vendor_code
            ? vendorNameMap.get(entry.vendor_code) || null
            : null,
          buyer_code: entry.buyer_code,
          // 화면에 표시할 기본 라벨: vendor_name > vendor_code > buyer_code
          display_label:
            (entry.vendor_code && vendorNameMap.get(entry.vendor_code)) ||
            entry.vendor_code ||
            entry.buyer_code ||
            "UNKNOWN",
        };
        let total = 0;
        for (const ym of allMonths) {
          const v = entry.months.get(ym) || 0;
          row[ym] = v;
          total += v;
        }
        row._total = total;
        return row;
      })
      .sort((a, b) => b._total - a._total)
      .slice(0, 20);
    const buyerCountTotal = buyerMonthlyMap.size;

    // === 벤더별 월별 입고량 (GR 기준, 없으면 PO) ===
    const vendorMonthlyMap = new Map<string, Map<string, number>>();
    for (const d of documents) {
      if (d.doc_type !== "GR" && d.doc_type !== "PO") continue;
      const ym = d.year_month || (d.doc_date ? String(d.doc_date).slice(0, 7) : null);
      if (!ym) continue;
      const vendor = d.vendor_code || "UNKNOWN";
      if (!vendorMonthlyMap.has(vendor)) vendorMonthlyMap.set(vendor, new Map());
      const m = vendorMonthlyMap.get(vendor)!;
      m.set(ym, (m.get(ym) || 0) + Number(d.qty || 0));
    }
    const vendorMonthly = Array.from(vendorMonthlyMap.entries()).map(([vendor, m]) => {
      const row: any = { vendor_code: vendor };
      for (const ym of allMonths) row[ym] = m.get(ym) || 0;
      return row;
    });

    // === Shipment Lead Time (ETD → ATA) ===
    const leadTimeMap = new Map<string, { ym: string; lead_sum: number; count: number }>();
    for (const d of documents) {
      if (d.doc_type !== "SHIPMENT") continue;
      if (!d.etd || !d.ata) continue;
      const etd = new Date(d.etd);
      const ata = new Date(d.ata);
      const days = Math.round((ata.getTime() - etd.getTime()) / 86400000);
      const ym = d.year_month || String(d.doc_date || "").slice(0, 7);
      if (!ym) continue;
      if (!leadTimeMap.has(ym)) leadTimeMap.set(ym, { ym, lead_sum: 0, count: 0 });
      const entry = leadTimeMap.get(ym)!;
      entry.lead_sum += days;
      entry.count += 1;
    }
    const leadTime = Array.from(leadTimeMap.values())
      .map(e => ({ year_month: e.ym, avg_days: e.count > 0 ? Math.round((e.lead_sum / e.count) * 10) / 10 : 0 }))
      .sort((a, b) => a.year_month.localeCompare(b.year_month));

    // === 자동 안분 (SKU 레벨) ===
    // Shipment의 SKU별 Qty 비율로 월별 비용 안분
    const allocations = calculateAllocations(documents, settlements);

    return NextResponse.json({
      ok: true,
      bu: bu || "ALL",
      buCounts,
      summary,
      monthly,
      buyerMonthly,
      buyerCountTotal,
      vendorMonthly,
      leadTime,
      allocations,
      allMonths,
      shipmentByContainer,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}

/**
 * Settlement 자동 안분 (DN 레벨)
 *
 * 로직 (우선순위):
 * 1. Settlement.dn_nos가 있으면 → 해당 DN 번호들의 Shipment만 대상
 * 2. 없으면 → month + buyer_code로 필터링 (기존 방식)
 *
 * 안분: 총비용 × (DN Qty / 총 Qty) = DN별 비용
 */
function calculateAllocations(documents: any[], settlements: any[]) {
  const results: any[] = [];

  for (const st of settlements) {
    const ym = st.year_month;
    const buyerFilter = st.buyer_code;
    const dnNos: string[] = Array.isArray(st.dn_nos) ? st.dn_nos : [];

    // 대상 Shipment 필터링
    let shipments: any[];
    if (dnNos.length > 0) {
      // DN 번호 매칭 방식 (Shipment의 remarks에 dn_no 저장됨)
      const dnSet = new Set(dnNos);
      shipments = documents.filter(
        d => d.doc_type === "SHIPMENT" && d.remarks && dnSet.has(d.remarks)
      );
    } else {
      // 월 + 바이어 매칭
      shipments = documents.filter(
        d => d.doc_type === "SHIPMENT"
          && (d.year_month === ym || String(d.doc_date || "").slice(0, 7) === ym)
          && (!buyerFilter || d.buyer_code === buyerFilter)
      );
    }

    const totalQty = shipments.reduce((s, d) => s + Number(d.qty || 0), 0);
    const totalCost =
      Number(st.forwarding_cost || 0) +
      Number(st.processing_cost || 0) +
      Number(st.other_cost || 0);

    if (totalQty === 0) {
      results.push({
        year_month: ym,
        buyer_code: buyerFilter,
        dn_nos: dnNos,
        total_cost: totalCost,
        forwarding_cost: Number(st.forwarding_cost || 0),
        processing_cost: Number(st.processing_cost || 0),
        other_cost: Number(st.other_cost || 0),
        total_qty: 0,
        cost_per_pcs: 0,
        dns: [],
        warning: "해당 Shipment 데이터가 없어 안분 불가",
      });
      continue;
    }

    // DN별 집계 (Shipment.remarks = dn_no)
    const dnMap = new Map<string, { dn_no: string; buyer: string | null; qty: number; item_count: number }>();
    for (const d of shipments) {
      const dnKey = d.remarks || "UNKNOWN";
      if (!dnMap.has(dnKey)) {
        dnMap.set(dnKey, {
          dn_no: dnKey,
          buyer: d.buyer_code || null,
          qty: 0,
          item_count: 0,
        });
      }
      const entry = dnMap.get(dnKey)!;
      entry.qty += Number(d.qty || 0);
      entry.item_count += 1;
    }

    const dns = Array.from(dnMap.values())
      .map(d => ({
        ...d,
        ratio: d.qty / totalQty,
        allocated_cost: Math.round((d.qty / totalQty) * totalCost),
      }))
      .sort((a, b) => b.qty - a.qty);

    results.push({
      year_month: ym,
      buyer_code: buyerFilter,
      dn_nos: dnNos,
      total_cost: totalCost,
      forwarding_cost: Number(st.forwarding_cost || 0),
      processing_cost: Number(st.processing_cost || 0),
      other_cost: Number(st.other_cost || 0),
      total_qty: totalQty,
      cost_per_pcs: Math.round((totalCost / totalQty) * 100) / 100,
      dns,
    });
  }

  return results;
}
