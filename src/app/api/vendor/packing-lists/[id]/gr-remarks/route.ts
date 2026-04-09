import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  SHORTAGE: "Shortage",
  OVERAGE: "Overage",
  DEFECT_RETURN: "Quality Defect - Return Pending",
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id: plId } = await context.params;
    const sb = await createClient();

    // 1. Packing list header → asn_id
    const { data: plHeader, error: plErr } = await sb
      .from("packing_list_header")
      .select("id, pl_no, po_no, asn_id, status, vendor_id")
      .eq("id", plId)
      .maybeSingle();

    if (plErr) throw plErr;
    if (!plHeader) {
      return NextResponse.json({ ok: false, error: "Packing list not found" }, { status: 404 });
    }

    if (!plHeader.asn_id) {
      return NextResponse.json({ ok: true, remarks: [], message: "No ASN linked yet" });
    }

    // 2. GR header(s) for this ASN
    const { data: grHeaders, error: grErr } = await sb
      .from("gr_header")
      .select("id, gr_no, status, confirmed_at")
      .eq("asn_id", plHeader.asn_id)
      .order("created_at", { ascending: true });

    if (grErr) throw grErr;

    if (!grHeaders || grHeaders.length === 0) {
      return NextResponse.json({ ok: true, remarks: [], message: "No GR created yet" });
    }

    const grIds = grHeaders.map((g: any) => g.id);
    const grMap = new Map(grHeaders.map((g: any) => [g.id, g]));

    // 3. GR lines with variance_reason
    const { data: grLines, error: grLineErr } = await sb
      .from("gr_line")
      .select("id, gr_id, sku, qty_expected, qty_received, qty, variance_reason")
      .in("gr_id", grIds);

    if (grLineErr) throw grLineErr;

    // 4. Aggregate by SKU across all GRs — track qty per reason
    type ReasonQty = {
      reason: string;
      label: string;
      expected_qty: number;
      received_qty: number;
      delta: number;
    };

    type SkuEntry = {
      sku: string;
      asn_qty: number;
      received_qty: number;
      reasonMap: Map<string, { expected: number; received: number }>;
      gr_nos: string[];
    };

    const skuMap = new Map<string, SkuEntry>();

    for (const line of grLines ?? []) {
      const sku = String(line.sku ?? "").trim();
      if (!sku) continue;

      const grHeader = grMap.get(line.gr_id);
      const grNo = grHeader?.gr_no ?? "";
      const expected = safeNum(line.qty_expected);
      const received = safeNum(line.qty_received ?? line.qty ?? 0);
      const reason = String(line.variance_reason ?? "").trim() || "NONE";

      if (!skuMap.has(sku)) {
        skuMap.set(sku, { sku, asn_qty: 0, received_qty: 0, reasonMap: new Map(), gr_nos: [] });
      }

      const entry = skuMap.get(sku)!;
      entry.asn_qty += expected;
      entry.received_qty += received;

      // Accumulate qty per reason
      const existing = entry.reasonMap.get(reason) ?? { expected: 0, received: 0 };
      entry.reasonMap.set(reason, {
        expected: existing.expected + expected,
        received: existing.received + received,
      });

      if (grNo && !entry.gr_nos.includes(grNo)) entry.gr_nos.push(grNo);
    }

    // Finalize
    const remarks = Array.from(skuMap.values())
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((entry) => {
        const delta = entry.received_qty - entry.asn_qty;
        let result = "MATCH";
        if (delta < 0) result = "SHORT";
        if (delta > 0) result = "OVER";

        // Build per-reason breakdown (exclude NONE if all match)
        const reason_details: ReasonQty[] = Array.from(entry.reasonMap.entries())
          .filter(([reason]) => reason !== "NONE")
          .map(([reason, qty]) => ({
            reason,
            label: REASON_LABELS[reason] ?? reason,
            expected_qty: qty.expected,
            received_qty: qty.received,
            delta: qty.received - qty.expected,
          }));

        return {
          sku: entry.sku,
          asn_qty: entry.asn_qty,
          received_qty: entry.received_qty,
          delta,
          result,
          reason_details,
          gr_nos: entry.gr_nos,
        };
      });

    const hasDiscrepancy = remarks.some((r) => r.delta !== 0);
    const grStatuses = [...new Set(grHeaders.map((g: any) => g.status))];

    return NextResponse.json({
      ok: true,
      has_discrepancy: hasDiscrepancy,
      gr_status: grStatuses.length === 1 ? grStatuses[0] : grStatuses.join(", "),
      remarks,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load GR remarks" },
      { status: 500 }
    );
  }
}
