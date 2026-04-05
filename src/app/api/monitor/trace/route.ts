import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PackingListHeader = {
  id: string;
  packing_list_no: string | null;
  vendor_id: string | null;
  status: string | null;
  asn_id: string | null;
  created_at: string | null;
};

type AsnHeader = {
  id: string;
  asn_no: string | null;
  status: string | null;
};

type GrHeader = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  status: string | null;
};

type VendorRow = {
  id: string;
  vendor_name: string | null;
};

export async function GET() {
  try {
    const sb = await createClient();

    const { data: pls, error: plError } = await sb
      .from("packing_list_header")
      .select("id, packing_list_no, vendor_id, status, asn_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (plError) {
      return NextResponse.json(
        { ok: false, error: plError.message },
        { status: 500 }
      );
    }

    const plRows = (pls || []) as PackingListHeader[];

    const asnIds = [...new Set(plRows.map((r) => r.asn_id).filter(Boolean))] as string[];
    const vendorIds = [...new Set(plRows.map((r) => r.vendor_id).filter(Boolean))] as string[];

    let asnMap = new Map<string, AsnHeader>();
    if (asnIds.length > 0) {
      const { data: asns, error: asnError } = await sb
        .from("asn_header")
        .select("id, asn_no, status")
        .in("id", asnIds);

      if (asnError) {
        return NextResponse.json(
          { ok: false, error: asnError.message },
          { status: 500 }
        );
      }

      asnMap = new Map(((asns || []) as AsnHeader[]).map((r) => [r.id, r]));
    }

    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const { data: vendors, error: vendorError } = await sb
        .from("vendors")
        .select("id, vendor_name")
        .in("id", vendorIds);

      if (vendorError) {
        return NextResponse.json(
          { ok: false, error: vendorError.message },
          { status: 500 }
        );
      }

      vendorMap = new Map(((vendors || []) as VendorRow[]).map((r) => [r.id, r]));
    }

    const { data: grs, error: grError } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status");

    if (grError) {
      return NextResponse.json(
        { ok: false, error: grError.message },
        { status: 500 }
      );
    }

    const grRows = (grs || []) as GrHeader[];
    const grMap = new Map<string, GrHeader[]>();

    for (const row of grRows) {
      if (!row.asn_id) continue;
      const prev = grMap.get(row.asn_id) || [];
      prev.push(row);
      grMap.set(row.asn_id, prev);
    }

    const items = plRows.map((pl) => {
      const asn = pl.asn_id ? asnMap.get(pl.asn_id) : null;
      const grList = pl.asn_id ? grMap.get(pl.asn_id) || [] : [];
      const vendor = pl.vendor_id ? vendorMap.get(pl.vendor_id) : null;

      return {
        packing_list_id: pl.id,
        packing_list_no: pl.packing_list_no,
        vendor_name: vendor?.vendor_name ?? null,
        packing_list_status: pl.status,
        asn_id: asn?.id ?? null,
        asn_no: asn?.asn_no ?? null,
        asn_status: asn?.status ?? null,
        gr_count: grList.length,
        grs: grList.map((g) => ({
          id: g.id,
          gr_no: g.gr_no,
          status: g.status,
        })),
        created_at: pl.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}