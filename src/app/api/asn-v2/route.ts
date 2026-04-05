import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
};

type GrLineRow = {
  asn_line_id: string | null;
  qty_received: number | null;
  qty: number | null;
};

type GrHeaderRow = {
  id: string;
  asn_id: string | null;
  gr_no: string | null;
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
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

function pickLatestGr(rows: GrHeaderRow[]) {
  if (!rows.length) return null;

  const copy = [...rows];
  copy.sort((a, b) => {
    const aTime = new Date(a.confirmed_at || a.created_at || 0).getTime();
    const bTime = new Date(b.confirmed_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  return copy[0];
}

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);

    const status = (url.searchParams.get("status") || "").trim().toUpperCase();
    const sourceType = (url.searchParams.get("source_type") || "").trim().toUpperCase();
    const computedStatusFilter = (url.searchParams.get("computed_status") || "")
      .trim()
      .toUpperCase();

    let headerQuery = sb
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
      .order("created_at", { ascending: false });

    if (status) {
      headerQuery = headerQuery.eq("status", status);
    }

    if (sourceType) {
      headerQuery = headerQuery.eq("source_type", sourceType);
    }

    const { data: headerRowsRaw, error: headerErr } = await headerQuery;
    if (headerErr) throw headerErr;

    const headerRows = (headerRowsRaw ?? []) as AsnHeaderRow[];
    if (headerRows.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const asnIds = headerRows.map((r) => r.id);
    const vendorIds = Array.from(
      new Set(headerRows.map((r) => r.vendor_id).filter(Boolean))
    ) as string[];

    const packingListIds = Array.from(
      new Set(
        headerRows
          .filter((r) => String(r.source_type || "").toUpperCase() === "PACKING_LIST" && r.source_id)
          .map((r) => r.source_id)
      )
    ) as string[];

    const { data: lineRowsRaw, error: lineErr } = await sb
      .from("asn_line")
      .select(`
        id,
        asn_id,
        line_no,
        sku,
        carton_no,
        qty_expected,
        qty
      `)
      .in("asn_id", asnIds);

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

    let grHeaderMap = new Map<string, GrHeaderRow>();
    {
      const { data: grHeaderRowsRaw, error: grHeaderErr } = await sb
        .from("gr_header")
        .select(`
          id,
          asn_id,
          gr_no,
          status,
          created_at,
          confirmed_at
        `)
        .in("asn_id", asnIds);

      if (!grHeaderErr) {
        const grHeaderRows = (grHeaderRowsRaw ?? []) as GrHeaderRow[];
        const grouped = new Map<string, GrHeaderRow[]>();

        for (const row of grHeaderRows) {
          const key = String(row.asn_id || "").trim();
          if (!key) continue;
          const prev = grouped.get(key) || [];
          prev.push(row);
          grouped.set(key, prev);
        }

        for (const [asnId, rows] of grouped.entries()) {
          const latest = pickLatestGr(rows);
          if (latest) grHeaderMap.set(asnId, latest);
        }
      }
    }

    let packingListMap = new Map<string, PackingListHeaderRow>();
    if (packingListIds.length > 0) {
      const { data: plRowsRaw, error: plErr } = await sb
        .from("packing_list_header")
        .select("id, pl_no, po_no")
        .in("id", packingListIds);

      if (plErr) throw plErr;

      const plRows = (plRowsRaw ?? []) as PackingListHeaderRow[];
      packingListMap = new Map(plRows.map((r) => [r.id, r]));
    }

    const packingLineMap = new Map<string, PackingListLineRow>();
    if (packingListIds.length > 0) {
      const { data: plLineRowsRaw, error: plLineErr } = await sb
        .from("packing_list_lines")
        .select(`
          packing_list_id,
          line_no,
          sku,
          qty,
          carton_no
        `)
        .in("packing_list_id", packingListIds);

      if (plLineErr) throw plLineErr;

      const plLineRows = (plLineRowsRaw ?? []) as PackingListLineRow[];
      for (const row of plLineRows) {
        packingLineMap.set(
          `${row.packing_list_id}::${makePackingLineKey(row.line_no, row.sku)}`,
          row
        );
      }
    }

    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const { data: vendorRowsRaw, error: vendorErr } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      if (!vendorErr) {
        const vendorRows = (vendorRowsRaw ?? []) as VendorRow[];
        vendorMap = new Map(vendorRows.map((r) => [r.id, r]));
      }
    }

    const poNoSet = new Set<string>();
    for (const header of headerRows) {
      if (header.po_id) continue;
      if (
        String(header.source_type || "").toUpperCase() === "PACKING_LIST" &&
        header.source_id
      ) {
        const poNo = packingListMap.get(header.source_id)?.po_no;
        if (poNo) poNoSet.add(poNo);
      }
    }

    let poByIdMap = new Map<string, PoHeaderRow>();
    let poByNoMap = new Map<string, PoHeaderRow>();

    const poIdsFromHeader = Array.from(
      new Set(headerRows.map((r) => r.po_id).filter(Boolean))
    ) as string[];

    if (poIdsFromHeader.length > 0) {
      const { data: poRowsRaw, error: poErr } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("id", poIdsFromHeader);

      if (!poErr) {
        const poRows = (poRowsRaw ?? []) as PoHeaderRow[];
        poByIdMap = new Map(poRows.map((r) => [r.id, r]));
        for (const row of poRows) {
          if (row.po_no) poByNoMap.set(row.po_no, row);
        }
      }
    }

    if (poNoSet.size > 0) {
      const poNos = Array.from(poNoSet);
      const { data: poRowsByNoRaw, error: poByNoErr } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("po_no", poNos);

      if (!poByNoErr) {
        const poRows = (poRowsByNoRaw ?? []) as PoHeaderRow[];
        for (const row of poRows) {
          poByNoMap.set(String(row.po_no || ""), row);
          poByIdMap.set(row.id, row);
        }
      }
    }

    const allPoIds = Array.from(poByIdMap.keys());
    const poQtyMap = new Map<string, number>();

    if (allPoIds.length > 0) {
      const { data: poLineRowsRaw, error: poLineErr } = await sb
        .from("po_line")
        .select("po_id, qty_ordered")
        .in("po_id", allPoIds);

      if (!poLineErr) {
        const poLineRows = (poLineRowsRaw ?? []) as PoLineRow[];
        for (const row of poLineRows) {
          poQtyMap.set(
            row.po_id,
            safeNum(poQtyMap.get(row.po_id)) + safeNum(row.qty_ordered)
          );
        }
      }
    }

    const receivedByAsnLineId = new Map<string, number>();
    for (const gr of grLineRows) {
      const asnLineId = String(gr.asn_line_id || "").trim();
      if (!asnLineId) continue;

      const receivedQty = safeNum(gr.qty_received ?? gr.qty ?? 0);
      receivedByAsnLineId.set(
        asnLineId,
        safeNum(receivedByAsnLineId.get(asnLineId)) + receivedQty
      );
    }

    const lineRowsByAsnId = new Map<string, AsnLineRow[]>();
    for (const line of lineRows) {
      const prev = lineRowsByAsnId.get(line.asn_id) || [];
      prev.push(line);
      lineRowsByAsnId.set(line.asn_id, prev);
    }

    let items = headerRows.map((header) => {
      const lines = lineRowsByAsnId.get(header.id) || [];
      const packingHeader =
        String(header.source_type || "").toUpperCase() === "PACKING_LIST" && header.source_id
          ? packingListMap.get(header.source_id)
          : null;

      const po =
        header.po_id
          ? poByIdMap.get(header.po_id)
          : packingHeader?.po_no
          ? poByNoMap.get(packingHeader.po_no)
          : null;

      const vendor = header.vendor_id ? vendorMap.get(header.vendor_id) : null;

      let asnQty = 0;
      let receivedQty = 0;
      const cartonSet = new Set<string>();

      for (const line of lines) {
        const plLine =
          String(header.source_type || "").toUpperCase() === "PACKING_LIST" && header.source_id
            ? packingLineMap.get(
                `${header.source_id}::${makePackingLineKey(line.line_no, line.sku)}`
              )
            : null;

        const rowAsnQty = pickAsnQty(line, plLine);
        const rowCartonNo = pickCartonNo(line, plLine);

        asnQty += rowAsnQty;
        receivedQty += safeNum(receivedByAsnLineId.get(line.id));

        if (rowCartonNo) {
          cartonSet.add(rowCartonNo);
        }
      }

      const poQty = po ? safeNum(poQtyMap.get(po.id)) : 0;
      const balanceQty = asnQty - receivedQty;
      const computedStatus = computeStatus(asnQty, receivedQty);
      const gr = grHeaderMap.get(header.id) || null;

      return {
        id: header.id,
        asn_no: header.asn_no,
        vendor_id: header.vendor_id,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        po_id: po?.id ?? header.po_id ?? null,
        po_no: po?.po_no ?? packingHeader?.po_no ?? null,
        source_type: header.source_type,
        source_id: header.source_id,
        source_ref_no:
          String(header.source_type || "").toUpperCase() === "PACKING_LIST"
            ? packingHeader?.pl_no ?? null
            : null,
        header_status: normalizeHeaderStatus(header.status),
        computed_status: computedStatus,
        total_cartons: cartonSet.size,
        po_qty: poQty,
        asn_qty: asnQty,
        received_qty: receivedQty,
        balance_qty: balanceQty,
        gr_id: gr?.id ?? null,
        gr_no: gr?.gr_no ?? null,
        gr_status: gr?.status ?? null,
        gr_confirmed_at: gr?.confirmed_at ?? null,
        created_at: header.created_at,
      };
    });

    if (computedStatusFilter) {
      items = items.filter(
        (item) => String(item.computed_status || "").toUpperCase() === computedStatusFilter
      );
    }

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e: any) {
    console.error("GET /api/asn-v2 error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load ASN v2 list",
      },
      { status: 500 }
    );
  }
}