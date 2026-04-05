import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function n(v: unknown) {
  return Number(v ?? 0);
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

    let products: Record<string, any>[] = [];
    if (skuList.length > 0) {
      const { data: productData, error: productError } = await sb
        .from("products")
        .select("sku, name, brand")
        .in("sku", skuList);

      if (productError) {
        return NextResponse.json(
          { ok: false, error: productError.message },
          { status: 500 }
        );
      }

      products = productData || [];
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

    const productMap = new Map<string, Record<string, any>>();
    for (const row of products) {
      if (row.sku) productMap.set(row.sku, row);
    }

    let poHeader: Record<string, any> | null = null;
    if (header.po_id || header.po_header_id) {
      poHeader = poHeaderMap.get(header.po_id || header.po_header_id) || null;
    }
    if (!poHeader) {
      const sampleLine = lineRows.find((row: any) => row.po_line_id);
      if (sampleLine) {
        const poLine = poLineMap.get(sampleLine.po_line_id);
        if (poLine) {
          poHeader = poHeaderMap.get(poLine.po_id || poLine.po_header_id) || null;
        }
      }
    }

    const vendor =
      header.vendor_id
        ? vendorMap.get(header.vendor_id)
        : poHeader?.vendor_id
        ? vendorMap.get(poHeader.vendor_id)
        : null;

    const headerView = {
      id: header.id,
      asn_no: header.asn_no || `ASN-${String(header.id).slice(0, 8)}`,
      po_no: header.po_no || header.po_number || poHeader?.po_no || "-",
      vendor_label:
        header.vendor_name ||
        header.vendor_code ||
        pickVendorName(vendor),
      status: header.status || "OPEN",
      created_at: header.created_at || null,
      confirmed_at: header.confirmed_at || null,
    };

    const lineViews = lineRows.map((row: any) => {
      const product = productMap.get(row.sku);
      const expected = n(row.qty_expected ?? row.expected_qty ?? row.qty);
      const received = n(row.qty_received ?? row.received_qty);
      return {
        id: row.id,
        line_no: row.line_no ?? null,
        sku: row.sku || "",
        brand: product?.brand || "",
        description: product?.name || "",
        qty_expected: expected,
        qty_received: received,
        balance: Math.max(expected - received, 0),
        carton_no: row.carton_no || "",
        created_at: row.created_at || null,
      };
    });

    const totalExpected = lineViews.reduce((sum, row) => sum + row.qty_expected, 0);
    const totalReceived = lineViews.reduce((sum, row) => sum + row.qty_received, 0);

    const cartonMap = new Map<
      string,
      {
        carton_no: string;
        line_count: number;
        qty_expected: number;
        qty_received: number;
        created_at: string | null;
        items: Array<{
          sku: string;
          brand: string;
          description: string;
          qty_expected: number;
          qty_received: number;
          balance: number;
          line_no: number | null;
          created_at: string | null;
        }>;
      }
    >();

    for (const row of lineViews) {
      const cartonNo = row.carton_no || "NO_CARTON";
      const prev = cartonMap.get(cartonNo) || {
        carton_no: cartonNo,
        line_count: 0,
        qty_expected: 0,
        qty_received: 0,
        created_at: row.created_at,
        items: [],
      };

      prev.line_count += 1;
      prev.qty_expected += row.qty_expected;
      prev.qty_received += row.qty_received;
      if (!prev.created_at && row.created_at) prev.created_at = row.created_at;

      prev.items.push({
        sku: row.sku,
        brand: row.brand,
        description: row.description,
        qty_expected: row.qty_expected,
        qty_received: row.qty_received,
        balance: row.balance,
        line_no: row.line_no,
        created_at: row.created_at,
      });

      cartonMap.set(cartonNo, prev);
    }

    const cartons = Array.from(cartonMap.values()).sort((a, b) =>
      String(a.carton_no).localeCompare(String(b.carton_no))
    );

    return NextResponse.json({
      ok: true,
      header: headerView,
      summary: {
        qty_expected: totalExpected,
        qty_received: totalReceived,
        balance: Math.max(totalExpected - totalReceived, 0),
        carton_count: cartons.length,
      },
      lines: lineViews,
      cartons,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}