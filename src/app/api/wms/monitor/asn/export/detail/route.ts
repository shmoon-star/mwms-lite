import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeView(view: string) {
  const v = String(view || "all").toLowerCase();
  if (["open", "closed", "all"].includes(v)) return v;
  return "all";
}

function n(v: unknown) {
  return Number(v ?? 0);
}

function inferExpected(row: Record<string, any>) {
  const direct = n(row.qty_expected ?? row.expected_qty);
  return direct > 0 ? direct : n(row.qty);
}

function inferReceived(row: Record<string, any>) {
  return n(row.qty_received ?? row.received_qty);
}

function deriveStatus(expected: number, received: number) {
  if (received <= 0) return "OPEN";
  if (expected > 0 && received < expected) return "PARTIAL_RECEIVED";
  return "FULL_RECEIVED";
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function makePackingLineMaps(rows: any[]) {
  const byAsnLine = new Map<string, any>();
  const byPoSku = new Map<string, any>();

  for (const row of rows || []) {
    const asnNo = String(row.asn_no || "").trim();
    const lineNo = String(row.line_no ?? "").trim();
    const poNo = String(row.po_no || "").trim();
    const sku = String(row.sku || "").trim();

    if (asnNo && lineNo) {
      byAsnLine.set(`${asnNo}::${lineNo}`, row);
    }

    if (poNo && sku) {
      const key = `${poNo}::${sku}`;
      if (!byPoSku.has(key)) byPoSku.set(key, []);
      byPoSku.get(key).push(row);
    }
  }

  return { byAsnLine, byPoSku };
}

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = normalizeView(url.searchParams.get("view") || "all");

    const { data: headers, error: headerError } = await sb
      .from("asn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerError) {
      return NextResponse.json(
        { ok: false, error: headerError.message },
        { status: 500 }
      );
    }

    const headerRows = headers || [];
    const headerMap = new Map<string, any>();
    for (const h of headerRows) headerMap.set(h.id, h);

    const { data: lines, error: lineError } = await sb
      .from("asn_line")
      .select("*");

    if (lineError) {
      return NextResponse.json(
        { ok: false, error: lineError.message },
        { status: 500 }
      );
    }

    const lineRows = lines || [];

    const poLineIds = Array.from(
      new Set(lineRows.map((r: any) => r.po_line_id).filter(Boolean))
    );

    let poLines: any[] = [];
    if (poLineIds.length > 0) {
      const { data, error } = await sb
        .from("po_line")
        .select("*")
        .in("id", poLineIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      poLines = data || [];
    }

    const poLineMap = new Map<string, any>();
    for (const row of poLines) poLineMap.set(row.id, row);

    const poHeaderIds = Array.from(
      new Set(
        [
          ...headerRows.map((h: any) => h.po_id || h.po_header_id).filter(Boolean),
          ...poLines.map((pl: any) => pl.po_id || pl.po_header_id).filter(Boolean),
        ]
      )
    );

    let poHeaders: any[] = [];
    if (poHeaderIds.length > 0) {
      const { data, error } = await sb
        .from("po_header")
        .select("*")
        .in("id", poHeaderIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      poHeaders = data || [];
    }

    const poHeaderMap = new Map<string, any>();
    for (const row of poHeaders) poHeaderMap.set(row.id, row);

    const vendorIds = Array.from(
      new Set(poHeaders.map((ph: any) => ph.vendor_id).filter(Boolean))
    );

    let vendors: any[] = [];
    if (vendorIds.length > 0) {
      const { data, error } = await sb
        .from("vendor")
        .select("*")
        .in("id", vendorIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      vendors = data || [];
    }

    const vendorMap = new Map<string, any>();
    for (const row of vendors) vendorMap.set(row.id, row);

    const skuList = Array.from(
      new Set(lineRows.map((r: any) => r.sku).filter(Boolean))
    );

    let products: any[] = [];
    if (skuList.length > 0) {
      const { data, error } = await sb
        .from("products")
        .select("sku, name, brand")
        .in("sku", skuList);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      products = data || [];
    }

    const productMap = new Map<string, any>();
    for (const row of products) productMap.set(row.sku, row);

    const asnNos = Array.from(
      new Set(headerRows.map((h: any) => h.asn_no).filter(Boolean))
    );
    const poNos = Array.from(
      new Set(
        headerRows
          .map((h: any) => h.po_no || h.po_number)
          .filter(Boolean)
      )
    );

    let packingLines: any[] = [];
    if (asnNos.length > 0) {
      const { data, error } = await sb
        .from("packing_list_lines")
        .select("*")
        .in("asn_no", asnNos);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      packingLines = data || [];
    }

    if (packingLines.length === 0 && poNos.length > 0) {
      const { data, error } = await sb
        .from("packing_list_lines")
        .select("*")
        .in("po_no", poNos);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      packingLines = data || [];
    }

    const { byAsnLine, byPoSku } = makePackingLineMaps(packingLines);

    const built = lineRows.map((row: any) => {
      const header = headerMap.get(row.asn_id);

      const poHeaderDirect =
        header?.po_id || header?.po_header_id
          ? poHeaderMap.get(header.po_id || header.po_header_id)
          : null;

      const poLine =
        row.po_line_id ? poLineMap.get(row.po_line_id) : null;

      const poHeaderViaLine =
        poLine?.po_id || poLine?.po_header_id
          ? poHeaderMap.get(poLine.po_id || poLine.po_header_id)
          : null;

      const poHeader = poHeaderDirect || poHeaderViaLine || null;

      const vendor =
        header?.vendor_id
          ? vendorMap.get(header.vendor_id)
          : poHeader?.vendor_id
          ? vendorMap.get(poHeader.vendor_id)
          : null;

      const product = productMap.get(row.sku);

      const expected = inferExpected(row);
      const received = inferReceived(row);
      const balance = Math.max(expected - received, 0);
      const status = deriveStatus(expected, received);

      const asnNo = header?.asn_no || "";
      const poNo = header?.po_no || header?.po_number || poHeader?.po_no || "";

      const packingByAsnLine =
        byAsnLine.get(`${String(asnNo).trim()}::${String(row.line_no ?? "").trim()}`) || null;

      const packingByPoSkuList =
        byPoSku.get(`${String(poNo).trim()}::${String(row.sku || "").trim()}`) || [];

      const packingByPoSku =
        Array.isArray(packingByPoSkuList) && packingByPoSkuList.length > 0
          ? packingByPoSkuList[0]
          : null;

      const cartonNo =
        row.carton_no ||
        packingByAsnLine?.carton_no ||
        packingByPoSku?.carton_no ||
        "";

      return {
        asn_no: asnNo,
        po_no: poNo,
        vendor:
          vendor?.vendor_name ||
          vendor?.name ||
          vendor?.vendor_code ||
          vendor?.code ||
          header?.vendor_name ||
          header?.vendor_code ||
          "",
        carton_no: cartonNo,
        line_no: row.line_no ?? "",
        sku: row.sku || "",
        brand: product?.brand || "",
        description: product?.name || "",
        expected_qty: expected,
        received_qty: received,
        balance,
        status,
        created_at: row.created_at || "",
      };
    });

    const filtered = built.filter((r) => {
      if (view === "open") return r.status !== "FULL_RECEIVED";
      if (view === "closed") return r.status === "FULL_RECEIVED";
      return true;
    });

    const csv = makeCsv(
      [
        "asn_no",
        "po_no",
        "vendor",
        "carton_no",
        "line_no",
        "sku",
        "brand",
        "description",
        "expected_qty",
        "received_qty",
        "balance",
        "status",
        "created_at",
      ],
      filtered.map((r) => [
        r.asn_no,
        r.po_no,
        r.vendor,
        r.carton_no,
        r.line_no,
        r.sku,
        r.brand,
        r.description,
        r.expected_qty,
        r.received_qty,
        r.balance,
        r.status,
        r.created_at,
      ])
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="asn_detail_${view}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}