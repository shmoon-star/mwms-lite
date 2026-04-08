import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function n(v: unknown) {
  const num = Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function pickVendorName(vendor: Record<string, any> | null | undefined) {
  if (!vendor) return "-";
  return (
    vendor.vendor_name ||
    vendor.name ||
    vendor.vendor_code ||
    vendor.code ||
    "-"
  );
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id: asnId } = await params;
    const sb = await createClient();

    const { data: header, error: headerError } = await sb
      .from("asn_header")
      .select("*")
      .eq("id", asnId)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: headerError?.message || "ASN not found" },
        { status: 404 }
      );
    }

    const { data: lines, error: lineError } = await sb
      .from("asn_line")
      .select("*")
      .eq("asn_id", asnId)
      .order("line_no", { ascending: true });

    if (lineError) {
      return NextResponse.json(
        { ok: false, error: lineError.message },
        { status: 500 }
      );
    }

    const lineRows = lines || [];

    const poLineIds = Array.from(
      new Set(lineRows.map((row: any) => row.po_line_id).filter(Boolean))
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

    const poHeaderIds = Array.from(
      new Set(
        poLines
          .map((row) => row.po_id || row.po_header_id || null)
          .filter(Boolean)
      )
    );

    let poHeaders: Record<string, any>[] = [];
    if (poHeaderIds.length > 0) {
      const { data: poHeaderData, error: poHeaderError } = await sb
        .from("po_header")
        .select("*")
        .in("id", poHeaderIds);

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

    const skuList = Array.from(
      new Set(lineRows.map((row: any) => row.sku).filter(Boolean))
    );

    if (skuList.length > 0) {
      const { error: productError } = await sb
        .from("products")
        .select("sku, name, brand")
        .in("sku", skuList);

      if (productError) {
        return NextResponse.json(
          { ok: false, error: productError.message },
          { status: 500 }
        );
      }
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

let poHeader: Record<string, any> | null = null;

if (header.po_id) {
  const { data, error } = await sb
    .from("po_header")
    .select("*")
    .eq("id", header.po_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  poHeader = data || null;
}

let vendor: Record<string, any> | null = null;

if (header.vendor_id) {
  const { data, error } = await sb
    .from("vendor")
    .select("*")
    .eq("id", header.vendor_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  vendor = data || null;
}

    const sampleLine = lineRows[0] || {};
    const samplePoLine = sampleLine?.po_line_id
      ? poLineMap.get(sampleLine.po_line_id)
      : null;

const headerView = {
  id: header.id,
  asn_no: header.asn_no || `ASN-${String(header.id).slice(0, 8)}`,
  po_no: poHeader?.po_no || "-",
  vendor_code: vendor?.vendor_code || vendor?.code || "-",
  vendor_name: vendor?.vendor_name || vendor?.name || "-",
  status: header.status || "OPEN",
  created_at: header.created_at || null,
  confirmed_at: header.confirmed_at || null,
};

    const lineViews = lineRows.map((row: any) => {
      const poLine = row.po_line_id ? poLineMap.get(row.po_line_id) : null;

const expected = n(
  row.qty ??
    row.asn_qty ??
    row.qty_expected ??
    row.expected_qty
);

      const received = n(row.qty_received ?? row.received_qty);

      return {
        asn_line_id: String(row.id),
        line_no: row.line_no ?? null,
        carton_no: row.carton_no || "",
        sku: row.sku || "",
        asn_qty: expected,
        received_qty: received,
        balance_qty: Math.max(expected - received, 0),
      };
    });

    const { data: pendingGr } = await sb
      .from("gr_header")
      .select("id, gr_no, status")
      .eq("asn_id", asnId)
      .eq("status", "PENDING")
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      asn: {
        id: String(header.id),
        asn_no: headerView.asn_no,
        po_no: headerView.po_no,
        vendor_code: headerView.vendor_code,
        vendor_name: headerView.vendor_name,
        gr_id: pendingGr?.id ? String(pendingGr.id) : null,
        gr_no: pendingGr?.gr_no || null,
        gr_status: pendingGr?.status || null,
        lines: lineViews,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}