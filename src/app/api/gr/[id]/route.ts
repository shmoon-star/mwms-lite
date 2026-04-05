import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type GrHeaderRow = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
};

type GrLineRow = {
  id: string;
  gr_id: string;
  asn_line_id: string | null;
  sku: string | null;
  qty_expected: number | null;
  qty_received: number | null;
  qty: number | null;
};

type AsnHeaderRow = {
  id: string;
  asn_no: string | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string;
  line_no: number | null;
  sku: string | null;
  qty_expected: number | null;
  qty: number | null;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pickExpectedQty(
  grLine?: Pick<GrLineRow, "qty_expected"> | null,
  asnLine?: Pick<AsnLineRow, "qty_expected" | "qty"> | null
) {
  const g = safeNum(grLine?.qty_expected);
  if (g > 0) return g;

  const a1 = safeNum(asnLine?.qty_expected);
  if (a1 > 0) return a1;

  const a2 = safeNum(asnLine?.qty);
  if (a2 > 0) return a2;

  return 0;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    const { data: headerRaw, error: headerErr } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status, created_at, confirmed_at")
      .eq("id", id)
      .maybeSingle();

    if (headerErr) throw headerErr;

    if (!headerRaw) {
      return NextResponse.json(
        { ok: false, error: "GR not found" },
        { status: 404 }
      );
    }

    const header = headerRaw as GrHeaderRow;

    const { data: lineRowsRaw, error: lineErr } = await sb
      .from("gr_line")
      .select("id, gr_id, asn_line_id, sku, qty_expected, qty_received, qty")
      .eq("gr_id", id)
      .order("id", { ascending: true });

    if (lineErr) throw lineErr;

    const lineRows = (lineRowsRaw ?? []) as GrLineRow[];

    let asn: AsnHeaderRow | null = null;
    if (header.asn_id) {
      const { data: asnRaw } = await sb
        .from("asn_header")
        .select("id, asn_no")
        .eq("id", header.asn_id)
        .maybeSingle();

      if (asnRaw) asn = asnRaw as AsnHeaderRow;
    }

    const asnLineIds = [
      ...new Set(lineRows.map((r) => r.asn_line_id).filter(Boolean)),
    ] as string[];

    let asnLineMap = new Map<string, AsnLineRow>();
    if (asnLineIds.length > 0) {
      const { data: asnLineRowsRaw, error: asnLineErr } = await sb
        .from("asn_line")
        .select("id, asn_id, line_no, sku, qty_expected, qty")
        .in("id", asnLineIds);

      if (asnLineErr) throw asnLineErr;

      const asnLineRows = (asnLineRowsRaw ?? []) as AsnLineRow[];
      asnLineMap = new Map(asnLineRows.map((r) => [r.id, r]));
    }

    const lines = lineRows.map((row, idx) => {
      const asnLine = row.asn_line_id ? asnLineMap.get(row.asn_line_id) : null;

      const expectedQty = pickExpectedQty(row, asnLine);
      const receivedQty = safeNum(row.qty_received ?? row.qty ?? 0);
      const delta = receivedQty - expectedQty;

      let result = "MATCH";
      if (delta < 0) result = "SHORT";
      if (delta > 0) result = "OVER";
      if (expectedQty === 0 && receivedQty === 0) result = "NOT_RECEIVED";

      return {
        id: row.id,
        line_no: asnLine?.line_no ?? idx + 1,
        sku: row.sku ?? asnLine?.sku ?? null,
        qty_expected: expectedQty,
        qty_received: receivedQty,
        delta,
        result,
      };
    });

    const expectedTotal = lines.reduce((sum, row) => sum + safeNum(row.qty_expected), 0);
    const receivedTotal = lines.reduce((sum, row) => sum + safeNum(row.qty_received), 0);
    const shortage = Math.max(expectedTotal - receivedTotal, 0);
    const overReceipt = Math.max(receivedTotal - expectedTotal, 0);

    let receiptResult = "MATCH";
    if (receivedTotal === 0) receiptResult = "NOT_RECEIVED";
    else if (receivedTotal < expectedTotal) receiptResult = "PARTIAL";
    else if (receivedTotal > expectedTotal) receiptResult = "OVER";
    else receiptResult = "FULL";

    return NextResponse.json({
      ok: true,
      item: {
        id: header.id,
        gr_no: header.gr_no,
        asn_id: header.asn_id,
        asn_no: asn?.asn_no ?? null,
        status: header.status,
        created_at: header.created_at,
        confirmed_at: header.confirmed_at,
        expected_total: expectedTotal,
        received_total: receivedTotal,
        shortage,
        over_receipt: overReceipt,
        receipt_result: receiptResult,
        lines,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load GR detail" },
      { status: 500 }
    );
  }
}