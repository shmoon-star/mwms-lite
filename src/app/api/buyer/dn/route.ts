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
      .select("id, dn_no, status, buyer_id, ship_from, ship_to, created_at, confirmed_at, shipped_at, planned_gi_date, planned_delivery_date")
      .order("created_at", { ascending: false });

    // ADMIN sees all; BUYER sees only their buyer_id
    if (profile.role === "BUYER" && buyer?.id) {
      query = query.eq("buyer_id", buyer.id);
    }

    if (status) query = query.eq("status", status);
    if (q) query = query.ilike("dn_no", `%${q}%`);

    const { data: dns, error: dnsErr } = await query;
    if (dnsErr) throw dnsErr;

    // qty_total 집계 (dn_lines)
    const dnIds = (dns ?? []).map((r: any) => r.id).filter(Boolean);
    let qtyMap = new Map<string, number>();
    if (dnIds.length > 0) {
      const { data: lines } = await sb
        .from("dn_lines")
        .select("dn_id, qty_ordered, qty")
        .in("dn_id", dnIds);
      for (const l of lines ?? []) {
        const qty = Number(l.qty_ordered ?? l.qty ?? 0);
        qtyMap.set(l.dn_id, (qtyMap.get(l.dn_id) ?? 0) + qty);
      }
    }

    const OPEN_STATUSES = ["PENDING", "RESERVED", "PICKED", "PACKING", "PACKED"];
    const data = (dns ?? []).map((r: any) => ({
      ...r,
      qty_total: qtyMap.get(r.id) ?? 0,
    }));

    const summary = {
      total_dn: data.length,
      open_dn: data.filter((r: any) => OPEN_STATUSES.includes(String(r.status ?? "").toUpperCase())).length,
      shipped_dn: data.filter((r: any) => ["SHIPPED", "CONFIRMED"].includes(String(r.status ?? "").toUpperCase())).length,
      total_qty: data.reduce((s: number, r: any) => s + r.qty_total, 0),
      shipped_qty: data.filter((r: any) => ["SHIPPED", "CONFIRMED"].includes(String(r.status ?? "").toUpperCase()))
        .reduce((s: number, r: any) => s + r.qty_total, 0),
    };

    return NextResponse.json({
      ok: true,
      scope: profile.role,
      buyer_code: buyer?.buyer_code ?? null,
      summary,
      data,
    });
  } catch (e: any) {
    const msg = e?.message ?? "Failed";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
