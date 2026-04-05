import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);

    const status = (url.searchParams.get("status") || "").trim();
    const sourceType = (url.searchParams.get("source_type") || "").trim();

    let query = sb
      .from("asn_header")
      .select(`
        id,
        asn_no,
        po_id,
        status,
        source_type,
        source_id,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (sourceType) {
      query = query.eq("source_type", sourceType);
    }

    const { data: asnRows, error: asnError } = await query;

    if (asnError) {
      throw asnError;
    }

    const poIds = Array.from(
      new Set((asnRows || []).map((r) => r.po_id).filter(Boolean))
    );

    const packingListIds = Array.from(
      new Set(
        (asnRows || [])
          .filter((r) => r.source_type === "PACKING_LIST" && r.source_id)
          .map((r) => r.source_id)
      )
    );

    let poMap = new Map<string, { id: string; po_no: string }>();
    let plMap = new Map<string, { id: string; pl_no?: string; po_no?: string }>();

    if (poIds.length > 0) {
      const { data: poRows, error: poError } = await sb
        .from("po_header")
        .select("id, po_no")
        .in("id", poIds);

      if (poError) {
        throw poError;
      }

      poMap = new Map((poRows || []).map((r) => [r.id, r]));
    }

    if (packingListIds.length > 0) {
      const { data: plRows, error: plError } = await sb
        .from("packing_list_header")
        .select("id, pl_no, po_no")
        .in("id", packingListIds);

      if (plError) {
        throw plError;
      }

      plMap = new Map((plRows || []).map((r) => [r.id, r]));
    }

    const items = (asnRows || []).map((row) => {
      const po = row.po_id ? poMap.get(row.po_id) : null;
      const pl =
        row.source_type === "PACKING_LIST" && row.source_id
          ? plMap.get(row.source_id)
          : null;

      return {
        id: row.id,
        asn_no: row.asn_no,
        status: row.status,
        po_id: row.po_id,
        po_no: po?.po_no || pl?.po_no || null,
        source_type: row.source_type,
        source_id: row.source_id,
        source_ref_no:
          row.source_type === "PACKING_LIST" ? pl?.pl_no || null : null,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (error: any) {
    console.error("GET /api/asn/list error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Failed to load ASN list",
      },
      { status: 500 }
    );
  }
}