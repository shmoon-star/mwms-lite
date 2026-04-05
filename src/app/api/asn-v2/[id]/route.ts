import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AsnHeaderRow = {
  id: string;
  asn_no: string | null;
  po_id: string | null;
  vendor_id: string | null;
  status: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string;
  line_no: number | null;
  sku: string | null;
  carton_no: string | null;
  qty_expected: number | null;
  qty: number | null;
  created_at: string | null;
};

type GrLineRow = {
  asn_line_id: string | null;
  qty_received: number | null;
  qty: number | null;
};

type PackingListHeaderRow = {
  id: string;
  pl_no: string | null;
  po_no: string | null;
};

type PackingListLineRow = {
  packing_list_id: string;
  line_no: number | null;
  sku: string | null;
  qty: number | null;
  carton_no: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type PoHeaderRow = {
  id: string;
  po_no: string | null;
};

type PoLineRow = {
  po_id: string;
  qty_ordered: number | null;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeaderStatus(v: string | null | undefined) {
  return String(v || "").trim().toUpperCase();
}

function computeStatus(asnQty: number, receivedQty: number) {
  if (asnQty <= 0) return "OPEN";
  if (receivedQty <= 0) return "OPEN";
  if (receivedQty < asnQty) return "PARTIAL_RECEIVED";
  return "FULL_RECEIVED";
}

function makePackingLineKey(lineNo: number | null, sku: string | null) {
  return `${String(lineNo ?? "")}::${String(sku ?? "").trim().toUpperCase()}`;
}

function pickAsnQty(
  line: Pick<AsnLineRow, "qty_expected" | "qty">,
  plLine?: Pick<PackingListLineRow, "qty"> | null
) {
  const q1 = safeNum(line.qty_expected);
  if (q1 > 0) return q1;

  const q2 = safeNum(line.qty);
  if (q2 > 0) return q2;

  const q3 = safeNum(plLine?.qty);
  if (q3 > 0) return q3;

  return 0;
}

function pickCartonNo(
  line: Pick<AsnLineRow, "carton_no">,
  plLine?: Pick<PackingListLineRow, "carton_no"> | null
) {
  const c1 = String(line.carton_no || "").trim();
  if (c1) return c1;

  const c2 = String(plLine?.carton_no || "").trim();
  if (c2) return c2;

  return null;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    const { data: headerRaw, error: headerErr } = await sb
      .from("asn_header")
      .select(`
        id,
        asn_no,
        po_id,
        vendor_id,
        status,
        source_type,
        source_id,
        created_at
      `)
      .eq("id", id)
      .maybeSingle();

    if (headerErr) throw headerErr;

    if (!headerRaw) {
      return NextResponse.json(
        { ok: false, error: "ASN not found" },
        { status: 404 }
      );
    }

    const header = headerRaw as AsnHeaderRow;

    const { data: lineRowsRaw, error: lineErr } = await sb
      .from("asn_line")
      .select(`
        id,
        asn_id,
        line_no,
        sku,
        carton_no,
        qty_expected,
        qty,
        created_at
      `)
      .eq("asn_id", id)
      .order("line_no", { ascending: true })
      .order("created_at", { ascending: true });

    if (lineErr) throw lineErr;

    const lineRows = (lineRowsRaw ?? []) as AsnLineRow[];
    const asnLineIds = lineRows.map((r) => r.id);

    let grLineRows: GrLineRow[] = [];
    if (asnLineIds.length > 0) {
      const { data: grRowsRaw, error: grErr } = await sb
        .from("gr_line")
        .select(`
          asn_line_id,
          qty_received,
          qty
        `)
        .in("asn_line_id", asnLineIds);

      if (grErr) throw grErr;
      grLineRows = (grRowsRaw ?? []) as GrLineRow[];
    }

    let packingList: PackingListHeaderRow | null = null;
    let packingLineMap = new Map<string, PackingListLineRow>();

    if (
      String(header.source_type || "").toUpperCase() === "PACKING_LIST" &&
      header.source_id
    ) {
      const { data: plRaw, error: plErr } = await sb
        .from("packing_list_header")
        .select("id, pl_no, po_no")
        .eq("id", header.source_id)
        .maybeSingle();

      if (plErr) throw plErr;
      if (plRaw) {
        packingList = plRaw as PackingListHeaderRow;
      }

      const { data: plLinesRaw, error: plLinesErr } = await sb
        .from("packing_list_lines")
        .select(`
          packing_list_id,
          line_no,
          sku,
          qty,
          carton_no
        `)
        .eq("packing_list_id", header.source_id);

      if (plLinesErr) throw plLinesErr;

      const plLines = (plLinesRaw ?? []) as PackingListLineRow[];
      packingLineMap = new Map(
        plLines.map((row) => [makePackingLineKey(row.line_no, row.sku), row])
      );
    }

    let po: PoHeaderRow | null = null;
    let poQty = 0;

    if (header.po_id) {
      const { data: poRaw, error: poErr } = await sb
        .from("po_header")
        .select("id, po_no")
        .eq("id", header.po_id)
        .maybeSingle();

      if (!poErr && poRaw) {
        po = poRaw as PoHeaderRow;
      }
    } else if (packingList?.po_no) {
      const { data: poRaw, error: poErr } = await sb
        .from("po_header")
        .select("id, po_no")
        .eq("po_no", packingList.po_no)
        .maybeSingle();

      if (!poErr && poRaw) {
        po = poRaw as PoHeaderRow;
      }
    }

    if (po?.id) {
      const { data: poLineRowsRaw, error: poLineErr } = await sb
        .from("po_line")
        .select("po_id, qty_ordered")
        .eq("po_id", po.id);

      if (!poLineErr) {
        const poLineRows = (poLineRowsRaw ?? []) as PoLineRow[];
        poQty = poLineRows.reduce((sum, row) => sum + safeNum(row.qty_ordered), 0);
      }
    }

    let vendor: VendorRow | null = null;
    if (header.vendor_id) {
      const { data: vendorRaw, error: vendorErr } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .eq("id", header.vendor_id)
        .maybeSingle();

      if (!vendorErr && vendorRaw) {
        vendor = vendorRaw as VendorRow;
      }
    }

    const receivedByAsnLineId = new Map<string, number>();
    for (const row of grLineRows) {
      const asnLineId = String(row.asn_line_id || "").trim();
      if (!asnLineId) continue;

      const receivedQty = safeNum(row.qty_received ?? row.qty ?? 0);
      receivedByAsnLineId.set(
        asnLineId,
        safeNum(receivedByAsnLineId.get(asnLineId)) + receivedQty
      );
    }

    const lines = lineRows.map((line) => {
      const plLine = packingLineMap.get(makePackingLineKey(line.line_no, line.sku));

      const asnQty = pickAsnQty(line, plLine);
      const cartonNo = pickCartonNo(line, plLine);
      const receivedQty = safeNum(receivedByAsnLineId.get(line.id));
      const balanceQty = asnQty - receivedQty;

      return {
        id: line.id,
        line_no: line.line_no,
        carton_no: cartonNo,
        sku: line.sku,
        asn_qty: asnQty,
        received_qty: receivedQty,
        balance_qty: balanceQty,
        created_at: line.created_at,
      };
    });

    const totalCartons = new Set(
      lines.map((row) => String(row.carton_no || "").trim()).filter(Boolean)
    ).size;

    const asnQty = lines.reduce((sum, row) => sum + safeNum(row.asn_qty), 0);
    const receivedQty = lines.reduce((sum, row) => sum + safeNum(row.received_qty), 0);
    const balanceQty = asnQty - receivedQty;
    const computedStatus = computeStatus(asnQty, receivedQty);

    return NextResponse.json({
      ok: true,
      asn: {
        id: header.id,
        asn_no: header.asn_no,
        po_id: po?.id ?? header.po_id ?? null,
        po_no: po?.po_no ?? packingList?.po_no ?? null,
        vendor_id: header.vendor_id,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        source_type: header.source_type,
        source_id: header.source_id,
        source_ref_no:
          String(header.source_type || "").toUpperCase() === "PACKING_LIST"
            ? packingList?.pl_no ?? null
            : null,
        header_status: normalizeHeaderStatus(header.status),
        computed_status: computedStatus,
        po_qty: poQty,
        total_cartons: totalCartons,
        asn_qty: asnQty,
        received_qty: receivedQty,
        balance_qty: balanceQty,
        created_at: header.created_at,
        lines,
      },
    });
  } catch (e: any) {
    console.error("GET /api/asn-v2/[id] error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load ASN detail",
      },
      { status: 500 }
    );
  }
}