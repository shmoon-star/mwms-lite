import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — 정산 상세 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const sb = await createClient();
    const { id } = await ctx.params;

    const { data: settlement, error: sErr } = await sb
      .from("monthly_settlement")
      .select("*")
      .eq("id", id)
      .single();

    if (sErr || !settlement) {
      return NextResponse.json({ ok: false, error: "Settlement not found" }, { status: 404 });
    }

    const { data: rawDns, error: dnErr } = await sb
      .from("monthly_settlement_dn")
      .select("*")
      .eq("settlement_id", id)
      .order("shipped_at", { ascending: true });

    // DN의 shipment → invoice_no 조회
    const dnIds = (rawDns ?? []).map((d: any) => d.dn_id).filter(Boolean);
    let invoiceMap = new Map<string, string>();
    if (dnIds.length > 0) {
      const { data: sdRows } = await sb.from("shipment_dn").select("shipment_id, dn_id").in("dn_id", dnIds);
      const shipIds = [...new Set((sdRows ?? []).map((r: any) => r.shipment_id).filter(Boolean))];
      if (shipIds.length > 0) {
        const { data: ships } = await sb.from("shipment_header").select("id, invoice_no").in("id", shipIds);
        const shipInvMap = new Map((ships ?? []).map((s: any) => [s.id, s.invoice_no || ""]));
        for (const sd of sdRows ?? []) {
          invoiceMap.set(sd.dn_id, shipInvMap.get(sd.shipment_id) || "");
        }
      }
    }

    const dns = (rawDns ?? []).map((d: any) => ({
      ...d,
      invoice_no: invoiceMap.get(d.dn_id) || "",
    }));

    if (dnErr) throw dnErr;

    const totalCost = Number(settlement.forwarding_cost ?? 0) + Number(settlement.processing_cost ?? 0) + Number(settlement.other_cost ?? 0);
    const totalQty = settlement.total_qty ?? 0;

    return NextResponse.json({
      ok: true,
      settlement: {
        ...settlement,
        total_cost: totalCost,
        cost_per_pcs: totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 0,
        forwarding_per_pcs: totalQty > 0 ? Math.round((Number(settlement.forwarding_cost ?? 0) / totalQty) * 100) / 100 : 0,
        processing_per_pcs: totalQty > 0 ? Math.round((Number(settlement.processing_cost ?? 0) / totalQty) * 100) / 100 : 0,
        other_per_pcs: totalQty > 0 ? Math.round((Number(settlement.other_cost ?? 0) / totalQty) * 100) / 100 : 0,
      },
      dns: dns ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

/** PATCH — 정산 수정/확정 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const sb = await createClient();
    const { id } = await ctx.params;
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.forwarding_cost !== undefined) updates.forwarding_cost = Number(body.forwarding_cost);
    if (body.processing_cost !== undefined) updates.processing_cost = Number(body.processing_cost);
    if (body.other_cost !== undefined) updates.other_cost = Number(body.other_cost);
    if (body.note !== undefined) updates.note = body.note;

    if (body.status === "CONFIRMED") {
      updates.status = "CONFIRMED";
      updates.confirmed_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("monthly_settlement")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, settlement: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
