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

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

/** Quantity 가중 평균 (qty가 큰 건이 더 영향) */
function weightedAvg(pairs: { days: number; qty: number }[]): number {
  const totalQty = pairs.reduce((s, p) => s + p.qty, 0);
  if (totalQty === 0) return avg(pairs.map(p => p.days));
  const weighted = pairs.reduce((s, p) => s + p.days * p.qty, 0);
  return Math.round((weighted / totalQty) * 10) / 10;
}

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const buyerFilter = url.searchParams.get("buyer") || ""; // ship_to 필터

    const [poRes, asnRes, asnLineRes, grRes, grLineRes, plRes, dnRes, dnLineRes, shipRes, shipDnRes] = await Promise.all([
      sb.from("po_header").select("id, eta, created_at"),
      sb.from("asn_header").select("id, created_at, source_type, source_id, po_id"),
      sb.from("asn_line").select("asn_id, qty_expected, qty_received").then(r => r),
      sb.from("gr_header").select("id, asn_id, status, confirmed_at, created_at"),
      sb.from("gr_line").select("gr_id, qty_received").then(r => r),
      sb.from("packing_list_header").select("id, eta"),
      sb.from("dn_header").select("id, status, planned_gi_date, shipped_at, confirmed_at, created_at, ship_to"),
      sb.from("dn_lines").select("dn_id, qty").then(r => r),
      sb.from("shipment_header").select("id, status, etd, eta, atd, ata, created_at"),
      sb.from("shipment_dn").select("shipment_id, dn_id"),
    ]);

    if (poRes.error) throw poRes.error;
    if (asnRes.error) throw asnRes.error;
    if (grRes.error) throw grRes.error;
    if (plRes.error) throw plRes.error;
    if (dnRes.error) throw dnRes.error;
    if (shipRes.error) throw shipRes.error;
    if (shipDnRes.error) throw shipDnRes.error;

    const pos = poRes.data ?? [];
    const asns = asnRes.data ?? [];
    const asnLines = asnLineRes.data ?? [];
    const grs = grRes.data ?? [];
    const grLines = grLineRes.data ?? [];
    const pls = plRes.data ?? [];
    const allDns = dnRes.data ?? [];
    // 바이어 필터 적용
    const dns = buyerFilter ? allDns.filter((d: any) => String(d.ship_to || "").includes(buyerFilter)) : allDns;
    // 사용 가능한 바이어 목록
    const availableBuyers = [...new Set(allDns.map((d: any) => d.ship_to).filter(Boolean))].sort();
    const dnLines = dnLineRes.data ?? [];
    const ships = shipRes.data ?? [];
    const shipDns = shipDnRes.data ?? [];

    const poMap = new Map(pos.map((p: any) => [p.id, p]));
    const asnMap = new Map(asns.map((a: any) => [a.id, a]));
    const plEtaMap = new Map(pls.map((p: any) => [p.id, p.eta]));

    // GR별 수량 합계
    const grQtyMap = new Map<string, number>();
    for (const l of grLines) {
      grQtyMap.set(l.gr_id, (grQtyMap.get(l.gr_id) ?? 0) + Number(l.qty_received ?? 0));
    }

    // DN별 수량 합계
    const dnQtyMap = new Map<string, number>();
    for (const l of dnLines) {
      dnQtyMap.set(l.dn_id, (dnQtyMap.get(l.dn_id) ?? 0) + Number(l.qty ?? 0));
    }

    // Shipment → DN 매핑
    const shipDnMap = new Map<string, string[]>();
    const dnToShipMap = new Map<string, string>();
    for (const sd of shipDns) {
      if (!shipDnMap.has(sd.shipment_id)) shipDnMap.set(sd.shipment_id, []);
      shipDnMap.get(sd.shipment_id)!.push(sd.dn_id);
      dnToShipMap.set(sd.dn_id, sd.shipment_id);
    }
    const shipMap = new Map(ships.map((s: any) => [s.id, s]));

    const TOLERANCE = 2;

    // ============================================
    // 1. Inbound Compliance (Quantity 기준)
    // ============================================
    let inOnTimeQty = 0;
    let inLateQty = 0;

    const confirmedGrs = grs.filter((g: any) =>
      g.status && ["CONFIRMED", "FULL_RECEIVED"].includes(String(g.status).toUpperCase()) && g.confirmed_at
    );

    for (const gr of confirmedGrs) {
      const asn = asnMap.get(gr.asn_id);
      if (!asn) continue;

      let eta: string | null = null;
      if (asn.source_type === "PACKING_LIST" && asn.source_id) {
        eta = plEtaMap.get(asn.source_id) ?? null;
      }
      if (!eta && asn.po_id) {
        eta = poMap.get(asn.po_id)?.eta ?? null;
      }
      if (!eta) continue;

      const etaDate = toDateStr(eta);
      const confirmDate = toDateStr(gr.confirmed_at);
      if (!etaDate || !confirmDate) continue;

      const qty = grQtyMap.get(gr.id) ?? 0;
      if (qty <= 0) continue;

      const deadline = addDays(etaDate, TOLERANCE);
      if (confirmDate <= deadline) {
        inOnTimeQty += qty;
      } else {
        inLateQty += qty;
      }
    }

    // ============================================
    // 2. Outbound Compliance (Quantity 기준)
    // ============================================
    let outOnTimeQty = 0;
    let outLateQty = 0;

    for (const dn of dns) {
      if (!dn.planned_gi_date || !dn.confirmed_at) continue;

      const planned = toDateStr(dn.planned_gi_date);
      const actual = toDateStr(dn.confirmed_at);
      if (!planned || !actual) continue;

      const qty = dnQtyMap.get(dn.id) ?? 0;
      if (qty <= 0) continue;

      const deadline = addDays(planned, TOLERANCE);
      if (actual <= deadline) {
        outOnTimeQty += qty;
      } else {
        outLateQty += qty;
      }
    }

    // ============================================
    // 3. Inbound Lead Time (PO→ASN, ASN→GR) — Qty 가중 평균
    // ============================================
    const inPoToAsn: { days: number; qty: number }[] = [];
    const inAsnToGr: { days: number; qty: number }[] = [];

    for (const gr of confirmedGrs) {
      const asn = asnMap.get(gr.asn_id);
      if (!asn) continue;

      const qty = grQtyMap.get(gr.id) ?? 0;

      const asnDate = toDateStr(asn.created_at);
      const grDate = toDateStr(gr.confirmed_at);

      if (asnDate && grDate) {
        inAsnToGr.push({ days: Math.max(dayDiff(asnDate, grDate), 0), qty });
      }

      if (asn.po_id) {
        const po = poMap.get(asn.po_id);
        const poDate = toDateStr(po?.created_at);
        if (poDate && asnDate) {
          inPoToAsn.push({ days: Math.max(dayDiff(poDate, asnDate), 0), qty });
        }
      }
    }

    const inPoToAsnAvg = avg(inPoToAsn.map(p => p.days));
    const inAsnToGrAvg = avg(inAsnToGr.map(p => p.days));

    const inboundLeadTime = {
      segments: [
        { segment: "PO → ASN", avg_days: inPoToAsnAvg, qty: inPoToAsn.reduce((s, p) => s + p.qty, 0) },
        { segment: "ASN → GR", avg_days: inAsnToGrAvg, qty: inAsnToGr.reduce((s, p) => s + p.qty, 0) },
      ],
      total_days: Math.round((inPoToAsnAvg + inAsnToGrAvg) * 10) / 10,
      total_qty: inPoToAsn.reduce((s, p) => s + p.qty, 0) + inAsnToGr.reduce((s, p) => s + p.qty, 0),
    };

    // ============================================
    // 4. Outbound Lead Time (4구간) — Qty 가중 평균
    //    DN→Ship, Ship→ATD, ATD→ATA, ATA→GR
    // ============================================
    const outDnToShip: { days: number; qty: number }[] = [];
    const outShipToAtd: { days: number; qty: number }[] = [];
    const outAtdToAta: { days: number; qty: number }[] = [];
    const outAtaToGr: { days: number; qty: number }[] = [];

    for (const dn of dns) {
      const createDate = toDateStr(dn.created_at);
      const shipDate = toDateStr(dn.shipped_at);
      const qty = dnQtyMap.get(dn.id) ?? 0;

      if (createDate && shipDate) {
        outDnToShip.push({ days: Math.max(dayDiff(createDate, shipDate), 0), qty });
      }

      const shipmentId = dnToShipMap.get(dn.id);
      if (shipmentId) {
        const ship = shipMap.get(shipmentId);
        const atdDate = toDateStr(ship?.atd);
        const ataDate = toDateStr(ship?.ata);
        const grDate = toDateStr(ship?.buyer_gr_date);

        if (shipDate && atdDate) {
          outShipToAtd.push({ days: Math.max(dayDiff(shipDate, atdDate), 0), qty });
        }
        if (atdDate && ataDate) {
          outAtdToAta.push({ days: Math.max(dayDiff(atdDate, ataDate), 0), qty });
        }
        if (ataDate && grDate) {
          outAtaToGr.push({ days: Math.max(dayDiff(ataDate, grDate), 0), qty });
        }
      }
    }

    const outSegs = [
      { segment: "DN → Ship", avg_days: avg(outDnToShip.map(p => p.days)), qty: outDnToShip.reduce((s, p) => s + p.qty, 0) },
      { segment: "Ship → ATD", avg_days: avg(outShipToAtd.map(p => p.days)), qty: outShipToAtd.reduce((s, p) => s + p.qty, 0) },
      { segment: "ATD → ATA", avg_days: avg(outAtdToAta.map(p => p.days)), qty: outAtdToAta.reduce((s, p) => s + p.qty, 0) },
      { segment: "ATA → GR", avg_days: avg(outAtaToGr.map(p => p.days)), qty: outAtaToGr.reduce((s, p) => s + p.qty, 0) },
    ];
    const outTotalDays = Math.round(outSegs.reduce((s, seg) => s + seg.avg_days, 0) * 10) / 10;
    const outTotalQty = outSegs.reduce((s, seg) => s + seg.qty, 0);

    const outboundLeadTime = {
      segments: outSegs,
      total_days: outTotalDays,
      total_qty: outTotalQty,
    };

    return NextResponse.json({
      ok: true,
      tolerance_days: TOLERANCE,
      inbound_compliance: { on_time: inOnTimeQty, late: inLateQty, total: inOnTimeQty + inLateQty, unit: "qty" },
      outbound_compliance: { on_time: outOnTimeQty, late: outLateQty, total: outOnTimeQty + outLateQty, unit: "qty" },
      inbound_lead_time: inboundLeadTime,
      outbound_lead_time: outboundLeadTime,
      buyers: availableBuyers,
      current_buyer: buyerFilter || "ALL",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
