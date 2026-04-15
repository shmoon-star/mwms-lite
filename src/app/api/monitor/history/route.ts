import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/history
 *
 * Summary + Charts용 집계 데이터 반환
 */
export async function GET() {
  try {
    const sb = await createClient();

    const { data: docs, error: docErr } = await sb
      .from("history_document")
      .select("*")
      .order("doc_date", { ascending: true });
    if (docErr) throw docErr;

    const { data: settles, error: stErr } = await sb
      .from("history_settlement")
      .select("*")
      .order("year_month", { ascending: true });
    if (stErr) throw stErr;

    const documents = docs ?? [];
    const settlements = settles ?? [];

    // === Summary ===
    const summary = {
      total_docs: documents.length,
      po_count: documents.filter(d => d.doc_type === "PO").length,
      dn_count: documents.filter(d => d.doc_type === "DN").length,
      shipment_count: documents.filter(d => d.doc_type === "SHIPMENT").length,
      gr_count: documents.filter(d => d.doc_type === "GR").length,
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

    // === 바이어별 월별 출고량 (SHIPMENT 기준) ===
    const buyerMonthlyMap = new Map<string, Map<string, number>>();
    for (const d of documents) {
      if (d.doc_type !== "SHIPMENT") continue;
      const ym = d.year_month || (d.doc_date ? String(d.doc_date).slice(0, 7) : null);
      if (!ym) continue;
      const buyer = d.buyer_code || "UNKNOWN";
      if (!buyerMonthlyMap.has(buyer)) buyerMonthlyMap.set(buyer, new Map());
      const m = buyerMonthlyMap.get(buyer)!;
      m.set(ym, (m.get(ym) || 0) + Number(d.qty || 0));
    }
    const allMonths = Array.from(new Set(monthly.map(m => m.year_month))).sort();
    const buyerMonthly = Array.from(buyerMonthlyMap.entries()).map(([buyer, m]) => {
      const row: any = { buyer_code: buyer };
      for (const ym of allMonths) row[ym] = m.get(ym) || 0;
      return row;
    });

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
      summary,
      monthly,
      buyerMonthly,
      vendorMonthly,
      leadTime,
      allocations,
      allMonths,
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
