import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";


export async function POST(req: Request) {
  try {
    const { dn_no } = await req.json();
    const dnNo = String(dn_no || "").trim();
    if (!dnNo) return NextResponse.json({ ok: false, error: "dn_no required" }, { status: 400 });

    const sb = supabaseServer();

    const { data: dn, error: e0 } = await sb.from("dn_header").select("*").eq("dn_no", dnNo).single();
    if (e0) return NextResponse.json({ ok: false, error: e0.message }, { status: 500 });

    const { data: lines, error: e1 } = await sb.from("dn_line").select("*").eq("dn_id", dn.id);
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 500 });

    // 재고 체크 & 차감
    for (const l of lines || []) {
      const sku = l.sku;
      const qty = Number(l.qty || 0);

      const { data: inv } = await sb.from("inventory").select("*").eq("sku", sku).single();
      const onhand = inv?.onhand ?? 0;
      if (onhand < qty) {
        return NextResponse.json({ ok: false, error: `insufficient stock sku=${sku} onhand=${onhand} req=${qty}` }, { status: 400 });
      }
    }

    for (const l of lines || []) {
      const sku = l.sku;
      const qty = Number(l.qty || 0);
      const { data: inv } = await sb.from("inventory").select("*").eq("sku", sku).single();
      await sb.from("inventory").update({ onhand: (inv!.onhand - qty), updated_at: new Date().toISOString() }).eq("sku", sku);
    }

    await sb.from("dn_header").update({ status: "GI_POSTED" }).eq("id", dn.id);

    return NextResponse.json({ ok: true, data: { dn_no: dnNo } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
