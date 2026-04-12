import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const sku = req.nextUrl.searchParams.get("sku")?.trim();

    if (!sku) {
      return NextResponse.json({ ok: false, error: "sku is required" }, { status: 400 });
    }

    // DN_RESERVE 트랜잭션에서 해당 SKU의 예약 내역 조회
    const { data: txRows, error: txErr } = await supabase
      .from("inventory_tx")
      .select("ref_id, qty_delta")
      .eq("sku", sku)
      .eq("tx_type", "DN_RESERVE")
      .not("ref_id", "is", null);

    if (txErr) throw txErr;

    // DN_SHIP으로 이미 출고된 것 제거하기 위해 ship 트랜잭션도 조회
    const { data: shipRows } = await supabase
      .from("inventory_tx")
      .select("ref_id, qty_delta")
      .eq("sku", sku)
      .eq("tx_type", "DN_SHIP")
      .not("ref_id", "is", null);

    const shippedDnIds = new Set((shipRows ?? []).map((r: any) => r.ref_id));

    // 아직 출고 안 된 DN만 필터
    const activeDnIds = (txRows ?? [])
      .filter((r: any) => !shippedDnIds.has(r.ref_id))
      .map((r: any) => ({ dn_id: r.ref_id as string, qty: Number(r.qty_delta ?? 0) }));

    if (activeDnIds.length === 0) {
      return NextResponse.json({ ok: true, reservations: [] });
    }

    const dnIds = activeDnIds.map((r) => r.dn_id);

    // DN 헤더에서 dn_no, status 조회
    const { data: dnHeaders, error: dnErr } = await supabase
      .from("dn_header")
      .select("id, dn_no, status")
      .in("id", dnIds);

    if (dnErr) throw dnErr;

    const dnMap = new Map((dnHeaders ?? []).map((d: any) => [d.id, d]));

    const reservations = activeDnIds.map((r) => {
      const dn = dnMap.get(r.dn_id);
      return {
        dn_id: r.dn_id,
        dn_no: dn?.dn_no ?? null,
        status: dn?.status ?? null,
        qty: r.qty,
      };
    });

    return NextResponse.json({ ok: true, reservations });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
