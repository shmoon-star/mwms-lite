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

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);

    const sourceType = (url.searchParams.get("source_type") || "").trim().toUpperCase();
    const computedStatusFilter = (url.searchParams.get("computed_status") || "")
      .trim()
      .toUpperCase();
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();

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
    const vendorIds = Array.from(new Set(headerRows.map((r) => r.vendor_id).filter(Boolean))) as string[];
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
        qty,
        created_at
      `)
      .in("asn_id", asnIds)
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
    for (const row of grLineRows) {
      const asnLineId = String(row.asn_line_id || "").trim();
      if (!asnLineId) continue;

      const receivedQty = safeNum(row.qty_received ?? row.qty ?? 0);
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

    const computedStatusByAsnId = new Map<string, string>();
    const poQtyByAsnId = new Map<string, number>();

    for (const header of headerRows) {
      const lines = lineRowsByAsnId.get(header.id) || [];
      let totalAsnQty = 0;
      let totalReceived = 0;

      for (const line of lines) {
        const plLine =
          String(header.source_type || "").toUpperCase() === "PACKING_LIST" && header.source_id
            ? packingLineMap.get(
                `${header.source_id}::${makePackingLineKey(line.line_no, line.sku)}`
              )
            : null;

        totalAsnQty += pickAsnQty(line, plLine);
        totalReceived += safeNum(receivedByAsnLineId.get(line.id));
      }

      computedStatusByAsnId.set(header.id, computeStatus(totalAsnQty, totalReceived));

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

      poQtyByAsnId.set(header.id, po ? safeNum(poQtyMap.get(po.id)) : 0);
    }

    let items = lineRows
      .map((line) => {
        const header = headerRows.find((h) => h.id === line.asn_id);
        if (!header) return null;

        const vendor = header.vendor_id ? vendorMap.get(header.vendor_id) : null;
        const pl =
          String(header.source_type || "").toUpperCase() === "PACKING_LIST" && header.source_id
            ? packingListMap.get(header.source_id)
            : null;

        const po =
          header.po_id
            ? poByIdMap.get(header.po_id)
            : pl?.po_no
            ? poByNoMap.get(pl.po_no)
            : null;

        const plLine =
          String(header.source_type || "").toUpperCase() === "PACKING_LIST" && header.source_id
            ? packingLineMap.get(
                `${header.source_id}::${makePackingLineKey(line.line_no, line.sku)}`
              )
            : null;

        const asnQty = pickAsnQty(line, plLine);
        const cartonNo = pickCartonNo(line, plLine);
        const receivedQty = safeNum(receivedByAsnLineId.get(line.id));
        const balanceQty = asnQty - receivedQty;
        const computedStatus = computedStatusByAsnId.get(header.id) || "OPEN";

        return {
          asn_id: header.id,
          asn_no: header.asn_no,
          po_id: po?.id ?? header.po_id ?? null,
          po_no: po?.po_no ?? pl?.po_no ?? null,
          po_qty: safeNum(poQtyByAsnId.get(header.id)),
          vendor_id: header.vendor_id,
          vendor_code: vendor?.vendor_code ?? null,
          vendor_name: vendor?.vendor_name ?? null,
          source_type: header.source_type,
          source_id: header.source_id,
          source_ref_no:
            String(header.source_type || "").toUpperCase() === "PACKING_LIST"
              ? pl?.pl_no ?? null
              : null,
          header_status: String(header.status || "").trim().toUpperCase(),
          computed_status: computedStatus,
          line_id: line.id,
          line_no: line.line_no,
          carton_no: cartonNo,
          sku: line.sku,
          asn_qty: asnQty,
          received_qty: receivedQty,
          balance_qty: balanceQty,
          asn_created_at: header.created_at,
          line_created_at: line.created_at,
        };
      })
      .filter(Boolean) as Array<{
      asn_id: string;
      asn_no: string | null;
      po_id: string | null;
      po_no: string | null;
      po_qty: number;
      vendor_id: string | null;
      vendor_code: string | null;
      vendor_name: string | null;
      source_type: string | null;
      source_id: string | null;
      source_ref_no: string | null;
      header_status: string | null;
      computed_status: string;
      line_id: string;
      line_no: number | null;
      carton_no: string | null;
      sku: string | null;
      asn_qty: number;
      received_qty: number;
      balance_qty: number;
      asn_created_at: string | null;
      line_created_at: string | null;
    }>;

    if (computedStatusFilter) {
      items = items.filter(
        (item) => String(item.computed_status || "").toUpperCase() === computedStatusFilter
      );
    }

    if (keyword) {
      items = items.filter((item) => {
        const haystack = [
          item.asn_no,
          item.po_no,
          item.vendor_code,
          item.vendor_name,
          item.source_type,
          item.source_ref_no,
          item.sku,
          item.carton_no,
          item.header_status,
          item.computed_status,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");

        return haystack.includes(keyword);
      });
    }

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e: any) {
    console.error("GET /api/asn-v2/details error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load ASN v2 all details",
      },
      { status: 500 }
    );
  }
}