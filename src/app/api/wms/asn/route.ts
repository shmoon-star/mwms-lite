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

/**
 * Supabase 1000행 제한 우회 — 페이지네이션으로 전체 수집
 */
async function fetchAllPaginated<T>(
  label: string,
  builder: (from: number, to: number) => any,
  opts: { pageSize?: number; maxPages?: number } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 200;
  const out: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const { data, error } = await builder(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error(`[wms/asn] ${label} page ${page} error:`, error);
        throw new Error(`${label} p${page} failed: ${error.message || error}`);
      }
      if (!data || data.length === 0) break;
      out.push(...(data as T[]));
      if (data.length < pageSize) break;
    } catch (e: any) {
      console.error(`[wms/asn] ${label} page ${page} exception:`, e?.message || e);
      throw new Error(`${label} p${page} exception: ${e?.message || e}`);
    }
  }
  return out;
}

/**
 * .in() 조회 시 IDs가 많으면 URL/쿼리 한계에 걸릴 수 있으므로 chunk 단위로 분할 조회
 */
async function fetchByIdsChunked<T>(
  label: string,
  ids: string[],
  chunkSize: number,
  builder: (idsChunk: string[]) => any
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const { data, error } = await builder(chunk);
      if (error) {
        console.error(`[wms/asn] ${label} chunk ${i}/${ids.length} error:`, error);
        throw new Error(`${label} chunk${i} failed: ${error.message || error}`);
      }
      if (data) out.push(...(data as T[]));
    } catch (e: any) {
      console.error(`[wms/asn] ${label} chunk ${i}/${ids.length} exception:`, e?.message || e);
      throw new Error(`${label} chunk${i} exception: ${e?.message || e}`);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();

    console.log("[wms/asn] GET start");

    // 전체 ASN header 조회 (1000행 제한 우회)
    const headers = await fetchAllPaginated<AsnHeaderRow>(
      "asn_header",
      (from, to) =>
        sb
          .from("asn_header")
          .select("id, asn_no, po_id, vendor_id, status, source_type, source_id, created_at")
          .order("created_at", { ascending: false })
          .range(from, to)
    );
    console.log(`[wms/asn] asn_header: ${headers.length} rows`);

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

    // ASN line — asn_id chunk로 분할 조회 (URL 길이 제한 대응)
    // 각 chunk 안에서도 1000행 넘을 수 있으므로 페이지네이션 병행
    const ID_CHUNK = 50; // 한번에 넣을 UUID 개수
    const asnLines: AsnLineRow[] = [];
    for (let i = 0; i < asnIds.length; i += ID_CHUNK) {
      const idsChunk = asnIds.slice(i, i + ID_CHUNK);
      const chunkRows = await fetchAllPaginated<AsnLineRow>(
        `asn_line chunk ${i}`,
        (from, to) =>
          sb
            .from("asn_line")
            .select("id, asn_id, line_no, sku, carton_no, qty_expected, qty")
            .in("asn_id", idsChunk)
            .order("id", { ascending: true })
            .range(from, to)
      );
      asnLines.push(...chunkRows);
    }
    console.log(`[wms/asn] asn_line: ${asnLines.length} rows`);

    const asnLineIds = asnLines.map((r) => r.id);

    let grLines: GrLineRow[] = [];
    if (asnLineIds.length > 0) {
      for (let i = 0; i < asnLineIds.length; i += ID_CHUNK) {
        const idsChunk = asnLineIds.slice(i, i + ID_CHUNK);
        const chunkRows = await fetchAllPaginated<GrLineRow>(
          `gr_line chunk ${i}`,
          (from, to) =>
            sb
              .from("gr_line")
              .select("asn_line_id, qty_received, qty")
              .in("asn_line_id", idsChunk)
              .order("asn_line_id", { ascending: true })
              .range(from, to)
        );
        grLines.push(...chunkRows);
      }
      console.log(`[wms/asn] gr_line: ${grLines.length} rows`);
    }

    // packing_list_header — chunk 조회
    let packingHeaderMap = new Map<string, PackingListHeaderRow>();
    if (packingListIds.length > 0) {
      const plHeaders = await fetchByIdsChunked<PackingListHeaderRow>(
        "packing_list_header",
        packingListIds,
        ID_CHUNK,
        (ids) =>
          sb
            .from("packing_list_header")
            .select("id, pl_no, po_no")
            .in("id", ids)
      );
      packingHeaderMap = new Map(plHeaders.map((r) => [r.id, r]));
      console.log(`[wms/asn] packing_list_header: ${plHeaders.length}`);
    }

    // packing_list_lines — chunk + paginate (가장 큰 테이블, line 수 폭발 가능)
    const packingLineMap = new Map<string, PackingListLineRow>();
    if (packingListIds.length > 0) {
      let plLineCount = 0;
      for (let i = 0; i < packingListIds.length; i += ID_CHUNK) {
        const idsChunk = packingListIds.slice(i, i + ID_CHUNK);
        const chunkRows = await fetchAllPaginated<PackingListLineRow>(
          `packing_list_lines chunk ${i}`,
          (from, to) =>
            sb
              .from("packing_list_lines")
              .select("packing_list_id, line_no, sku, qty, carton_no")
              .in("packing_list_id", idsChunk)
              .order("packing_list_id", { ascending: true })
              .range(from, to)
        );
        for (const row of chunkRows) {
          packingLineMap.set(
            `${row.packing_list_id}::${makePackingLineKey(row.line_no, row.sku)}`,
            row
          );
        }
        plLineCount += chunkRows.length;
      }
      console.log(`[wms/asn] packing_list_lines: ${plLineCount}`);
    }

    // vendor
    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const vendors = await fetchByIdsChunked<VendorRow>(
        "vendor",
        vendorIds,
        ID_CHUNK,
        (ids) =>
          sb.from("vendor").select("id, vendor_code, vendor_name").in("id", ids)
      );
      vendorMap = new Map(vendors.map((r) => [r.id, r]));
      console.log(`[wms/asn] vendor: ${vendors.length}`);
    }

    // po_header
    const poIds = Array.from(new Set(headers.map((r) => r.po_id).filter(Boolean))) as string[];
    let poMap = new Map<string, PoHeaderRow>();
    if (poIds.length > 0) {
      const poRows = await fetchByIdsChunked<PoHeaderRow>(
        "po_header",
        poIds,
        ID_CHUNK,
        (ids) => sb.from("po_header").select("id, po_no").in("id", ids)
      );
      poMap = new Map(poRows.map((r) => [r.id, r]));
      console.log(`[wms/asn] po_header: ${poRows.length}`);
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

    items = items.filter(
      (row) =>
        safeNum(row.balance_qty) > 0 &&
        String(row.status ?? "").toUpperCase() !== "CANCELLED"
    );

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
    console.error("[wms/asn] FATAL:", e?.stack || e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load WMS ASN list" },
      { status: 500 }
    );
  }
}