import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type UpcomingEvent = {
  type: "PO" | "DN" | "SHIPMENT";
  event_type: "ETA" | "GI_DATE" | "DELIVERY_DATE" | "ETD";
  id: string;
  ref_no: string;
  date: string;
  status: string;
  qty: number;
};

function toDateStr(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const sb = await createClient();

    // 1단계: 헤더 3개 병렬
    const [
      { data: poRows },
      { data: dnRows },
      { data: shipRows },
    ] = await Promise.all([
      sb.from("po_header")
        .select("id, po_no, status, eta")
        .not("eta", "is", null)
        .not("status", "in", '("CLOSED","CANCELLED")'),

      sb.from("dn_header")
        .select("id, dn_no, status, planned_gi_date, planned_delivery_date")
        .or("planned_gi_date.not.is.null,planned_delivery_date.not.is.null")
        .not("status", "in", '("SHIPPED","CONFIRMED","CANCELLED")'),

      sb.from("shipment_header")
        .select("id, shipment_no, status, eta, etd")
        .or("eta.not.is.null,etd.not.is.null")
        .not("status", "in", '("CLOSED","CANCELLED","CONFIRMED")'),
    ]);

    // 2단계: qty 쿼리 — 헤더 ID 필터로만 (전체 테이블 fetch 방지)
    const poIds = (poRows ?? []).map((r: any) => r.id).filter(Boolean);
    const dnIds = (dnRows ?? []).map((r: any) => r.id).filter(Boolean);

    const poQtyMap = new Map<string, number>();
    const dnQtyMap = new Map<string, number>();

    await Promise.all([
      poIds.length > 0
        ? sb.from("po_line").select("po_id, qty_ordered").in("po_id", poIds)
            .then(({ data }) => {
              for (const r of data ?? []) {
                poQtyMap.set(r.po_id, (poQtyMap.get(r.po_id) ?? 0) + safeNum(r.qty_ordered));
              }
            })
        : Promise.resolve(),

      dnIds.length > 0
        ? sb.from("dn_lines").select("dn_id, qty_ordered").in("dn_id", dnIds)
            .then(({ data }) => {
              for (const r of data ?? []) {
                dnQtyMap.set(r.dn_id, (dnQtyMap.get(r.dn_id) ?? 0) + safeNum(r.qty_ordered));
              }
            })
        : Promise.resolve(),
    ]);

    // 이벤트 빌드
    const events: UpcomingEvent[] = [];

    for (const po of poRows ?? []) {
      const d = toDateStr(po.eta);
      if (!d) continue;
      events.push({ type: "PO", event_type: "ETA", id: po.id, ref_no: po.po_no || po.id, date: d, status: po.status || "", qty: poQtyMap.get(po.id) ?? 0 });
    }

    for (const dn of dnRows ?? []) {
      const qty = dnQtyMap.get(dn.id) ?? 0;
      const giDate = toDateStr(dn.planned_gi_date);
      if (giDate) events.push({ type: "DN", event_type: "GI_DATE", id: dn.id, ref_no: dn.dn_no || dn.id, date: giDate, status: dn.status || "", qty });
      const delDate = toDateStr(dn.planned_delivery_date);
      if (delDate) events.push({ type: "DN", event_type: "DELIVERY_DATE", id: dn.id, ref_no: dn.dn_no || dn.id, date: delDate, status: dn.status || "", qty });
    }

    for (const ship of shipRows ?? []) {
      const etaDate = toDateStr(ship.eta);
      if (etaDate) events.push({ type: "SHIPMENT", event_type: "ETA", id: ship.id, ref_no: ship.shipment_no || ship.id, date: etaDate, status: ship.status || "", qty: 0 });
      const etdDate = toDateStr(ship.etd);
      if (etdDate) events.push({ type: "SHIPMENT", event_type: "ETD", id: ship.id, ref_no: ship.shipment_no || ship.id, date: etdDate, status: ship.status || "", qty: 0 });
    }

    events.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ ok: true, today: new Date().toISOString().slice(0, 10), events });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
