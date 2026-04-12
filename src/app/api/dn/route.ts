import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function buildDnNo() {
  return `DN-${Date.now()}`;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: headers, error: headerError } = await supabase
      .from("dn_header")
      .select("id, dn_no, status, ship_from, ship_to, created_at, confirmed_at, shipped_at, planned_gi_date, planned_delivery_date")
      .order("created_at", { ascending: false });

    if (headerError) throw headerError;

    const dnIds = (headers ?? []).map((row: any) => row.id).filter(Boolean);

    let lineRows: any[] = [];
    if (dnIds.length > 0) {
      const { data: lines, error: lineError } = await supabase
        .from("dn_lines")
        .select("dn_id, qty_ordered, qty")
        .in("dn_id", dnIds);

      if (lineError) throw lineError;
      lineRows = lines ?? [];
    }

    const qtyMap = new Map<string, number>();
    for (const line of lineRows) {
      const dnId = String(line.dn_id || "");
      if (!dnId) continue;

      const qty = safeNum(line.qty_ordered ?? line.qty);
      qtyMap.set(dnId, (qtyMap.get(dnId) || 0) + qty);
    }

    const dns = (headers ?? []).map((row: any) => ({
      ...row,
      qty_total: qtyMap.get(String(row.id)) || 0,
    }));

    return NextResponse.json({
      ok: true,
      dns,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    await req.json().catch(() => ({}));

    const dn_no = buildDnNo();

    const { data, error } = await supabase
      .from("dn_header")
      .insert({
        dn_no,
        status: "PENDING",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      dn: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}