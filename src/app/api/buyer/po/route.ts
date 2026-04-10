import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);

    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";

    let query = sb
      .from("po_header")
      .select("id, po_no, vendor_id, buyer_id, status, eta, created_at")
      .order("created_at", { ascending: false });

    // ADMIN sees all; BUYER sees only their buyer_id
    if (profile.role === "BUYER" && buyer?.id) {
      query = query.eq("buyer_id", buyer.id);
    }

    if (status) query = query.eq("status", status);
    if (q) query = query.ilike("po_no", `%${q}%`);

    const { data: pos, error: posErr } = await query;
    if (posErr) throw posErr;

    // Enrich with vendor names
    const vendorIds = [...new Set((pos ?? []).map((p: any) => p.vendor_id).filter(Boolean))];
    const vendorMap = new Map<string, { vendor_code: string; vendor_name: string | null }>();

    if (vendorIds.length > 0) {
      const { data: vendors } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      for (const v of vendors ?? []) {
        vendorMap.set(v.id, { vendor_code: v.vendor_code, vendor_name: v.vendor_name });
      }
    }

    const enriched = (pos ?? []).map((p: any) => {
      const v = vendorMap.get(p.vendor_id);
      return {
        id: p.id,
        po_no: p.po_no,
        vendor_code: v?.vendor_code ?? "-",
        vendor_name: v?.vendor_name ?? "-",
        buyer_id: p.buyer_id,
        status: p.status,
        eta: p.eta,
        created_at: p.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      scope: profile.role,
      buyer_code: buyer?.buyer_code ?? null,
      data: enriched,
    });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
