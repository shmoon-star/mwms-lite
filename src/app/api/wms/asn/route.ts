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

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();

    const { data: headersRaw, error: headerErr } = await sb
      .from("asn_header")
      .select("id, asn_no, po_id, vendor_id, status, source_type, source_id, created_at")
      .order("created_at", { ascending: false });

    if (headerErr) throw headerErr;

    const headers = (headersRaw ?? []) as AsnHeaderRow[];

    if (headers.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const asnIds = headers.map((r) => r.id);
    const vendorIds = Array.from(
      new Set(headers.map((r) => r.vendor_id).filter(Boolean))
    ) as string[];

    const packingListIds = Array.from(
      new Set(
        headers
          .filter(
            (r) =>
              String(r.source_type || "").toUpperCase() === "PACKING_LIST" &&
              r.source_id
          )
          .map((r) => r.source_id)
      )
    ) as string[];

    const { data: asnLinesRaw, error: asnLineErr } = await sb
      .from("asn_line")
      .select("id, asn_id, line_no, sku, carton_no, qty_expected, qty")
      .in("asn_id", asnIds);

    if (asnLineErr) throw asnLineErr;

    const asnLines = (asnLinesRaw ?? []) as AsnLineRow[];
    const asnLineIds = asnLines.map((r) => r.id);

    let grLines: GrLineRow[] = [];
    if (asnLineIds.length > 0) {
      const { data: grLinesRaw, error: grLineErr } = await sb
        .from("gr_line")
        .select("asn_line_id, qty_received, qty")
        .in("asn_line_id", asnLineIds);

      if (grLineErr) throw grLineErr;

      grLines = (grLinesRaw ?? []) as GrLineRow[];
    }

    let packingHeaderMap = new Map<string, PackingListHeaderRow>();
    if (packingListIds.length > 0) {
      const { data: plHeadersRaw, error: plHeaderErr } = await sb
        .from("packing_list_header")
        .select("id, pl_no, po_no")
        .in("id", packingListIds);

      if (plHeaderErr) throw plHeaderErr;

      const plHeaders = (plHeadersRaw ?? []) as PackingListHeaderRow[];
      packingHeaderMap = new Map(plHeaders.map((r) => [r.id, r]));
    }

    const packingLineMap = new Map<string, PackingListLineRow>();
    if (packingListIds.length > 0) {
      const { data: plLinesRaw, error: plLineErr } = await sb
        .from("packing_list_lines")
        .select("packing_list_id, line_no, sku, qty, carton_no")
        .in("packing_list_id", packingListIds);

      if (plLineErr) throw plLineErr;

      const plLines = (plLinesRaw ?? []) as PackingListLineRow[];
      for (const row of plLines) {
        packingLineMap.set(
          `${row.packing_list_id}::${makePackingLineKey(row.line_no, row.sku)}`,
          row
        );
      }
    }

    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const { data: vendorsRaw } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      const vendors = (vendorsRaw ?? []) as VendorRow[];
      vendorMap = new Map(vendors.map((r) => [r.id, r]));
    }

    const poIds = Array.from(new Set(headers.map((r) => r.po_id).filter(Boolean))) as string[];
    let poMap = new Map<string, PoHeaderRow>();
    if (poIds.length > 0) {
      const { data: poRowsRaw } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("id", poIds);

      const poRows = (poRowsRaw ?? []) as PoHeaderRow[];
      poMap = new Map(poRows.map((r) => [r.id, r]));
    }

    const receivedByAsnLineId = new Map<string, number>();
    for (const row of grLines) {
      const asnLineId = String(row.asn_line_id || "").trim();
      if (!asnLineId) continue;

      receivedByAsnLineId.set(
        asnLineId,
        safeNum(receivedByAsnLineId.get(asnLineId)) +
          safeNum(row.qty_received ?? row.qty ?? 0)
      );
    }

    const lineRowsByAsnId = new Map<string, AsnLineRow[]>();
    for (const line of asnLines) {
      const prev = lineRowsByAsnId.get(line.asn_id) || [];
      prev.push(line);
      lineRowsByAsnId.set(line.asn_id, prev);
    }

    let items = headers.map((header) => {
      const lines = lineRowsByAsnId.get(header.id) || [];
      const vendor = header.vendor_id ? vendorMap.get(header.vendor_id) : null;
      const packingHeader =
        String(header.source_type || "").toUpperCase() === "PACKING_LIST" &&
        header.source_id
          ? packingHeaderMap.get(header.source_id)
          : null;
      const po = header.po_id ? poMap.get(header.po_id) : null;

      let asnQty = 0;
      let receivedQty = 0;
      const cartons = new Set<string>();

      for (const line of lines) {
        const plLine =
          String(header.source_type || "").toUpperCase() === "PACKING_LIST" &&
          header.source_id
            ? packingLineMap.get(
                `${header.source_id}::${makePackingLineKey(line.line_no, line.sku)}`
              )
            : null;

        asnQty += pickAsnQty(line, plLine);
        receivedQty += safeNum(receivedByAsnLineId.get(line.id));

        const cartonNo = pickCartonNo(line, plLine);
        if (cartonNo) cartons.add(cartonNo);
      }

      const balanceQty = asnQty - receivedQty;

      return {
        id: header.id,
        asn_no: header.asn_no,
        po_no: po?.po_no ?? packingHeader?.po_no ?? null,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        total_cartons: cartons.size,
        asn_qty: asnQty,
        received_qty: receivedQty,
        balance_qty: balanceQty,
        status: header.status,
        created_at: header.created_at,
      };
    });

    items = items.filter((row) => safeNum(row.balance_qty) > 0);

    if (keyword) {
      items = items.filter((row) =>
        [
          row.asn_no,
          row.po_no,
          row.vendor_code,
          row.vendor_name,
          row.status,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ")
          .includes(keyword)
      );
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load WMS ASN list" },
      { status: 500 }
    );
  }
}