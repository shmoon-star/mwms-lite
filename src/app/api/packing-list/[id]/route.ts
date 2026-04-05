// src/app/api/packing-list/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, assertUuidVendorAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sb = await createClient();
    const me = await getCurrentUserProfile();

    const { data: header, error: headerError } = await sb
      .from("packing_list_header")
      .select(`
        id,
        pl_no,
        po_no,
        vendor_id,
        status,
        total_qty,
        created_at,
        updated_at
      `)
      .eq("id", params.id)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, message: "Packing List not found" },
        { status: 404 }
      );
    }

    assertUuidVendorAccess(me, header.vendor_id);

    const { data: lines, error: lineError } = await sb
      .from("packing_list_line")
      .select(`
        id,
        packing_list_id,
        po_no,
        sku,
        qty,
        carton_no,
        created_at
      `)
      .eq("packing_list_id", params.id)
      .order("created_at", { ascending: true });

    if (lineError) throw lineError;

    return NextResponse.json({
      ok: true,
      data: {
        header,
        lines: lines ?? [],
      },
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to fetch packing list";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      500;

    return NextResponse.json(
      { ok: false, message: msg },
      { status }
    );
  }
}