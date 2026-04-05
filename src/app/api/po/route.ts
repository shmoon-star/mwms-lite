import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PoHeaderRow = {
  id: string;
  po_no: string | null;
  vendor_id: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const { data: headersRaw, error: headersError } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta, created_at")
      .order("created_at", { ascending: false });

    if (headersError) {
      return NextResponse.json(
        { ok: false, error: headersError.message },
        { status: 500 }
      );
    }

    const headers = (headersRaw ?? []) as PoHeaderRow[];

    const vendorIds = [
      ...new Set(headers.map((row) => row.vendor_id).filter(Boolean)),
    ] as string[];

    let vendorMap = new Map<string, VendorRow>();

    if (vendorIds.length > 0) {
      const { data: vendorsRaw, error: vendorsError } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      if (vendorsError) {
        return NextResponse.json(
          { ok: false, error: vendorsError.message },
          { status: 500 }
        );
      }

      vendorMap = new Map(
        ((vendorsRaw ?? []) as VendorRow[]).map((v) => [v.id, v])
      );
    }

    const items = headers
      .map((row) => {
        const vendor = row.vendor_id ? vendorMap.get(row.vendor_id) : null;

        return {
          id: row.id,
          po_no: row.po_no,
          vendor_id: row.vendor_id,
          vendor_code: vendor?.vendor_code ?? null,
          vendor_name: vendor?.vendor_name ?? null,
          status: row.status,
          eta: row.eta,
          created_at: row.created_at,
        };
      })
      .filter((row) => {
        if (!q) return true;

        const target = [
          row.po_no,
          row.vendor_code,
          row.vendor_name,
          row.status,
          row.eta,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return target.includes(q);
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