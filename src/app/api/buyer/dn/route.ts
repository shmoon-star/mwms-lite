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
      .from("dn_header")
      .select("id, dn_no, status, buyer_id, ship_from, ship_to, created_at, confirmed_at")
      .order("created_at", { ascending: false });

    // ADMIN sees all; BUYER sees only their buyer_id
    if (profile.role === "BUYER" && buyer?.id) {
      query = query.eq("buyer_id", buyer.id);
    }

    if (status) query = query.eq("status", status);
    if (q) query = query.ilike("dn_no", `%${q}%`);

    const { data: dns, error: dnsErr } = await query;
    if (dnsErr) throw dnsErr;

    return NextResponse.json({
      ok: true,
      scope: profile.role,
      buyer_code: buyer?.buyer_code ?? null,
      data: dns ?? [],
    });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
