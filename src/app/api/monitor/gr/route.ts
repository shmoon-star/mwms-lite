import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeStatusParam(status: string) {
  const v = (status || "OPEN").trim().toUpperCase();
  if (["OPEN", "PENDING", "CONFIRMED", "ALL", "DRAFT", "CLOSED"].includes(v)) {
    return v;
  }
  return "OPEN";
}

type GrHeaderRow = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
};

type GrLineRow = {
  gr_id: string;
  asn_line_id: string | null;
  qty_expected: number | null;
  qty_received: number | null;
};

type AsnHeaderRow = {
  id: string;
  asn_no: string | null;
  po_id: string | null;
  source_type: string | null;
  source_id: string | null;
  vendor_id: string | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string;
  qty_expected: number | null;
  qty: number | null;
};

type PackingListHeaderRow = {
  id: string;
  po_no: string | null;
};

type PoHeaderRow = {
  id: string;
  po_no: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
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

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const status = normalizeStatusParam(url.searchParams.get("status") || "OPEN");

    let query = sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status, created_at, confirmed_at")
      .order("created_at", { ascending: false });

    if (status === "OPEN") {
      query = query.in("status", ["DRAFT", "PENDING", "OPEN"]);
    } else if (status === "CLOSED") {
      query = query.eq("status", "CONFIRMED");
    } else if (status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data: headers, error: headerError } = await query;

    if (headerError) {
      return NextResponse.json(
        { ok: false, error: headerError.message },
        { status: 500 }
      );
    }

    const headerRows = (headers || []) as GrHeaderRow[];

    if (headerRows.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const grIds = headerRows.map((r) => r.id);
    const asnIds = [...new Set(headerRows.map((r) => r.asn_id).filter(Boolean))] as string[];

    const { data: lineRows, error: lineError } = await sb
      .from("gr_line")
      .select("gr_id, asn_line_id, qty_expected, qty_received")
      .in("gr_id", grIds);

    if (lineError) {
      return NextResponse.json(
        { ok: false, error: lineError.message },
        { status: 500 }
      );
    }

    let asnMap = new Map<string, AsnHeaderRow>();
    if (asnIds.length > 0) {
      const { data: asnRows, error: asnError } = await sb
        .from("asn_header")
        .select("id, asn_no, po_id, source_type, source_id, vendor_id")
        .in("id", asnIds);

      if (asnError) {
        return NextResponse.json(
          { ok: false, error: asnError.message },
          { status: 500 }
        );
      }

      asnMap = new Map(((asnRows || []) as AsnHeaderRow[]).map((r) => [r.id, r]));
    }

    const asnLineIdSet = [
      ...new Set(
        ((lineRows || []) as GrLineRow[])
          .map((r) => r.asn_line_id)
          .filter(Boolean)
      ),
    ] as string[];

    let asnLineMap = new Map<string, AsnLineRow>();
    if (asnLineIdSet.length > 0) {
      const { data: asnLineRows, error: asnLineError } = await sb
        .from("asn_line")
        .select("id, asn_id, qty_expected, qty")
        .in("id", asnLineIdSet);

      if (asnLineError) {
        return NextResponse.json(
          { ok: false, error: asnLineError.message },
          { status: 500 }
        );
      }

      asnLineMap = new Map(((asnLineRows || []) as AsnLineRow[]).map((r) => [r.id, r]));
    }

    const packingListIds = [
      ...new Set(
        [...asnMap.values()]
          .filter(
            (r) =>
              String(r.source_type || "").toUpperCase() === "PACKING_LIST" &&
              r.source_id
          )
          .map((r) => r.source_id)
      ),
    ] as string[];

    let packingListMap = new Map<string, PackingListHeaderRow>();
    if (packingListIds.length > 0) {
      const { data: plRows, error: plError } = await sb
        .from("packing_list_header")
        .select("id, po_no")
        .in("id", packingListIds);

      if (plError) {
        return NextResponse.json(
          { ok: false, error: plError.message },
          { status: 500 }
        );
      }

      packingListMap = new Map(
        ((plRows || []) as PackingListHeaderRow[]).map((r) => [r.id, r])
      );
    }

    const poIds = [
      ...new Set([...asnMap.values()].map((r) => r.po_id).filter(Boolean)),
    ] as string[];

    let poMap = new Map<string, PoHeaderRow>();
    if (poIds.length > 0) {
      const { data: poRows, error: poError } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("id", poIds);

      if (poError) {
        return NextResponse.json(
          { ok: false, error: poError.message },
          { status: 500 }
        );
      }

      poMap = new Map(((poRows || []) as PoHeaderRow[]).map((r) => [r.id, r]));
    }

    const vendorIds = [
      ...new Set([...asnMap.values()].map((r) => r.vendor_id).filter(Boolean)),
    ] as string[];

    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const { data: vendorRows, error: vendorError } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      if (vendorError) {
        return NextResponse.json(
          { ok: false, error: vendorError.message },
          { status: 500 }
        );
      }

      vendorMap = new Map(((vendorRows || []) as VendorRow[]).map((r) => [r.id, r]));
    }

    const lineMap = new Map<string, { expected_total: number; received_total: number }>();
    ((lineRows || []) as GrLineRow[]).forEach((row) => {
      const prev = lineMap.get(row.gr_id) || {
        expected_total: 0,
        received_total: 0,
      };

      const asnLine = row.asn_line_id ? asnLineMap.get(row.asn_line_id) : null;
      const expectedQty = pickExpectedQty(row, asnLine);

      prev.expected_total += expectedQty;
      prev.received_total += safeNum(row.qty_received || 0);

      lineMap.set(row.gr_id, prev);
    });

    const items = headerRows.map((row) => {
      const agg = lineMap.get(row.id) || { expected_total: 0, received_total: 0 };
      const asn = row.asn_id ? asnMap.get(row.asn_id) : null;
      const vendor = asn?.vendor_id ? vendorMap.get(asn.vendor_id) : null;

      let poNo: string | null = null;

      if (asn?.po_id) {
        poNo = poMap.get(asn.po_id)?.po_no ?? null;
      } else if (
        String(asn?.source_type || "").toUpperCase() === "PACKING_LIST" &&
        asn?.source_id
      ) {
        poNo = packingListMap.get(asn.source_id)?.po_no ?? null;
      }

      return {
        id: row.id,
        gr_no: row.gr_no,
        asn_id: row.asn_id,
        asn_no: asn?.asn_no || null,
        po_no: poNo,
        vendor_code: vendor?.vendor_code || null,
        vendor_name: vendor?.vendor_name || null,
        status: row.status,
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
        expected_total: agg.expected_total,
        received_total: agg.received_total,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}