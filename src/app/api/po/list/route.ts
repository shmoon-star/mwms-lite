// src/app/api/po/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentVendorInfo } from "@/lib/authz";
import { applyVendorCodeScope } from "@/lib/vendor-scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const me = await getCurrentUserProfile();
    const myVendor = await getCurrentVendorInfo(me);

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();

    let query = sb
      .from("po_header")
      .select(`
        id,
        po_no,
        vendor_id,
        status,
        eta,
        created_at
      `)
      .order("created_at", { ascending: false });

    query = applyVendorCodeScope(query, me, myVendor?.vendor_code, "vendor_id");

    if (status) {
      query = query.eq("status", status);
    }

    if (q) {
      query = query.ilike("po_no", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: data ?? [],
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to fetch PO list";
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