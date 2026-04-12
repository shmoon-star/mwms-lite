import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeView(view: string) {
  const v = String(view || "all").toLowerCase();
  if (v === "open" || v === "closed" || v === "all") return v;
  return "all";
}

function inferExpected(row: Record<string, any>) {
  return Number(
    row.qty_expected ??
      row.expected_qty ??
      row.qty ??
      row.qty_ordered ??
      row.planned_qty ??
      0
  );
}

function inferReceived(row: Record<string, any>) {
  return Number(
    row.qty_received ??
      row.received_qty ??
      row.qty_done ??
      0
  );
}

function deriveAsnStatus(expected: number, received: number) {
  if (received <= 0) return "OPEN";
  if (expected > 0 && received < expected) return "PARTIAL_RECEIVED";
  return "FULL_RECEIVED";
}

function isClosedStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return ["FULL_RECEIVED", "CONFIRMED", "CLOSED", "RECEIVED", "CANCELLED"].includes(s);
}

async function loadAsnLines(sb: any, asnIds: string[]) {
  if (!asnIds.length) return [];

  const { data, error } = await sb
    .from("asn_line")
    .select("*")
    .in("asn_id", asnIds);

  if (error) {
    throw new Error(error.message || "Failed to load ASN lines");
  }

  return data || [];
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

    const headerRows = (headers || []) as Record<string, any>[];
    const asnIds = headerRows.map((row) => row.id).filter(Boolean);

    if (asnIds.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: {
          total_asn: 0,
          open_asn: 0,
          closed_asn: 0,
          total_expected: 0,
          total_received: 0,
          total_balance: 0,
        },
        items: [],
      });
    }

    const lines = await loadAsnLines(sb, asnIds);

    const poHeaderIdsFromHeader = Array.from(
      new Set(
        headerRows
          .map((row) => row.po_id || row.po_header_id || null)
          .filter(Boolean)
      )
    );

    const poLineIds = Array.from(
      new Set(lines.map((row: any) => row.po_line_id).filter(Boolean))
    );

    let poLines: Record<string, any>[] = [];
    if (poLineIds.length > 0) {
      const { data: poLineData, error: poLineError } = await sb
        .from("po_line")
        .select("*")
        .in("id", poLineIds);

      if (poLineError) {
        return NextResponse.json(
          { ok: false, error: poLineError.message },
          { status: 500 }
        );
      }

      poLines = poLineData || [];
    }

    const poHeaderIdsFromLine = Array.from(
      new Set(
        poLines
          .map((row) => row.po_id || row.po_header_id || null)
          .filter(Boolean)
      )
    );

    const allPoHeaderIds = Array.from(
      new Set([...poHeaderIdsFromHeader, ...poHeaderIdsFromLine])
    );

    let poHeaders: Record<string, any>[] = [];
    if (allPoHeaderIds.length > 0) {
      const { data: poHeaderData, error: poHeaderError } = await sb
        .from("po_header")
        .select("*")
        .in("id", allPoHeaderIds);

      if (poHeaderError) {
        return NextResponse.json(
          { ok: false, error: poHeaderError.message },
          { status: 500 }
        );
      }

      poHeaders = poHeaderData || [];
    }

    const vendorIds = Array.from(
      new Set(poHeaders.map((row) => row.vendor_id).filter(Boolean))
    );

    let vendors: Record<string, any>[] = [];
    if (vendorIds.length > 0) {
      const { data: vendorData, error: vendorError } = await sb
        .from("vendor")
        .select("*")
        .in("id", vendorIds);

      if (vendorError) {
        return NextResponse.json(
          { ok: false, error: vendorError.message },
          { status: 500 }
        );
      }

      vendors = vendorData || [];
    }

    const poLineMap = new Map<string, Record<string, any>>();
    for (const row of poLines) {
      if (row.id) poLineMap.set(row.id, row);
    }

    const poHeaderMap = new Map<string, Record<string, any>>();
    for (const row of poHeaders) {
      if (row.id) poHeaderMap.set(row.id, row);
    }

    const vendorMap = new Map<string, Record<string, any>>();
    for (const row of vendors) {
      if (row.id) vendorMap.set(row.id, row);
    }

    const expectedMap = new Map<string, number>();
    const receivedMap = new Map<string, number>();
    const samplePoLineByAsn = new Map<string, Record<string, any>>();

    for (const row of lines || []) {
      const asnId = row.asn_id;
      if (!asnId) continue;

      expectedMap.set(asnId, (expectedMap.get(asnId) || 0) + inferExpected(row));
      receivedMap.set(asnId, (receivedMap.get(asnId) || 0) + inferReceived(row));

      if (!samplePoLineByAsn.has(asnId) && row.po_line_id) {
        const poLine = poLineMap.get(row.po_line_id);
        if (poLine) samplePoLineByAsn.set(asnId, poLine);
      }
    }

    const normalizedItems = headerRows.map((row) => {
      const samplePoLine = samplePoLineByAsn.get(row.id);

      const poHeaderDirect =
        row.po_id || row.po_header_id
          ? poHeaderMap.get(row.po_id || row.po_header_id)
          : null;

      const poHeaderViaLine =
        samplePoLine
          ? poHeaderMap.get(samplePoLine.po_id || samplePoLine.po_header_id)
          : null;

      const poHeader = poHeaderDirect || poHeaderViaLine || null;

      let qtyExpected = expectedMap.get(row.id) || 0;
      const qtyReceived = receivedMap.get(row.id) || 0;

      if (qtyExpected <= 0 && qtyReceived > 0) {
        qtyExpected = qtyReceived;
      }

      const balance = Math.max(qtyExpected - qtyReceived, 0);
      const status = deriveAsnStatus(qtyExpected, qtyReceived);

      const vendor =
        row.vendor_id
          ? vendorMap.get(row.vendor_id)
          : poHeader?.vendor_id
          ? vendorMap.get(poHeader.vendor_id)
          : null;

      const vendorLabel =
        vendor?.vendor_name ||
        vendor?.name ||
        vendor?.vendor_code ||
        vendor?.code ||
        row.vendor_name ||
        row.vendor_code ||
        row.supplier_name ||
        "-";

      return {
        id: row.id,
        asn_no: row.asn_no || `ASN-${String(row.id).slice(0, 8)}`,
        po_no: row.po_no || row.po_number || poHeader?.po_no || "-",
        vendor_label: vendorLabel,
        status,
        qty_expected: qtyExpected,
        qty_received: qtyReceived,
        balance,
        created_at: row.created_at || null,
        confirmed_at: row.confirmed_at || null,
      };
    });

    const filteredItems =
      view === "open"
        ? normalizedItems.filter((row) => !isClosedStatus(row.status))
        : view === "closed"
        ? normalizedItems.filter((row) => isClosedStatus(row.status))
        : normalizedItems;

    const summary = {
      total_asn: filteredItems.length,
      open_asn: filteredItems.filter((row) => !isClosedStatus(row.status)).length,
      closed_asn: filteredItems.filter((row) => isClosedStatus(row.status)).length,
      total_expected: filteredItems.reduce((sum, row) => sum + row.qty_expected, 0),
      total_received: filteredItems.reduce((sum, row) => sum + row.qty_received, 0),
      total_balance: filteredItems.reduce((sum, row) => sum + row.balance, 0),
    };

    return NextResponse.json({
      ok: true,
      summary,
      items: filteredItems,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}