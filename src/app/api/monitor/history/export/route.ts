import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/history/export?ym=2025-06&buyer=MUSINSA-JP
 *
 * 특정 월/바이어 DN별 안분 결과 CSV
 */
export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const ym = url.searchParams.get("ym");
    const buyer = url.searchParams.get("buyer");

    if (!ym) {
      return NextResponse.json({ ok: false, error: "year_month required" }, { status: 400 });
    }

    // Settlement
    let stQuery = sb.from("history_settlement").select("*").eq("year_month", ym);
    if (buyer) stQuery = stQuery.eq("buyer_code", buyer);
    else stQuery = stQuery.is("buyer_code", null);

    const { data: sts } = await stQuery;
    const st = (sts ?? [])[0];
    if (!st) {
      return NextResponse.json({ ok: false, error: "Settlement not found" }, { status: 404 });
    }

    const totalCost =
      Number(st.forwarding_cost || 0) +
      Number(st.processing_cost || 0) +
      Number(st.other_cost || 0);

    const dnNos: string[] = Array.isArray(st.dn_nos) ? st.dn_nos : [];

    // Shipments 조회
    let shipments: any[] = [];
    if (dnNos.length > 0) {
      // DN 매칭 (remarks에 dn_no 저장됨)
      const { data } = await sb
        .from("history_document")
        .select("*")
        .eq("doc_type", "SHIPMENT")
        .in("remarks", dnNos);
      shipments = data ?? [];
    } else {
      let shQuery = sb.from("history_document").select("*").eq("doc_type", "SHIPMENT").eq("year_month", ym);
      if (buyer) shQuery = shQuery.eq("buyer_code", buyer);
      const { data } = await shQuery;
      shipments = data ?? [];
    }

    const totalQty = shipments.reduce((s, d) => s + Number(d.qty || 0), 0);

    // DN별 집계
    const dnMap = new Map<string, { dn_no: string; buyer: string | null; qty: number; item_count: number }>();
    for (const d of shipments) {
      const key = d.remarks || "UNKNOWN";
      if (!dnMap.has(key)) {
        dnMap.set(key, {
          dn_no: key,
          buyer: d.buyer_code || null,
          qty: 0,
          item_count: 0,
        });
      }
      const entry = dnMap.get(key)!;
      entry.qty += Number(d.qty || 0);
      entry.item_count += 1;
    }

    const rows = Array.from(dnMap.values()).map(d => ({
      ...d,
      ratio: totalQty > 0 ? d.qty / totalQty : 0,
      allocated_cost: totalQty > 0 ? Math.round((d.qty / totalQty) * totalCost) : 0,
    })).sort((a, b) => b.qty - a.qty);

    // CSV
    const header = ["year_month", "buyer_code", "dn_no", "buyer", "line_count", "qty", "ratio_%", "allocated_cost_KRW"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        ym,
        buyer || "전체",
        r.dn_no,
        r.buyer || "",
        r.item_count,
        r.qty,
        (r.ratio * 100).toFixed(2),
        r.allocated_cost,
      ].join(","));
    }

    const csv = "\ufeff" + lines.join("\n"); // BOM for Excel UTF-8
    const filename = `history_settlement_${ym}${buyer ? `_${buyer}` : ""}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
