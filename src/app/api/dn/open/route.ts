import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = await createClient();

    const { data: headers, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status, created_at, reserved_at, picked_at, packed_at, shipped_at, confirmed_at")
      .neq("status", "SHIPPED")
      .order("created_at", { ascending: false })
      .limit(200);

    if (hErr) throw hErr;

    const dnIds = (headers ?? []).map((x) => x.id);

    if (dnIds.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
      });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, dn_id, sku, qty, qty_picked, qty_packed, qty_shipped, created_at")
      .in("dn_id", dnIds)
      .order("created_at", { ascending: false });

    if (lErr) throw lErr;

    const headerMap = new Map((headers ?? []).map((h) => [h.id, h]));

    const items = (lines ?? [])
      .map((line) => {
        const header = headerMap.get(line.dn_id);
        if (!header) return null;

        return {
          dn_id: header.id,
          dn_no: header.dn_no,
          status: header.status,
          header_created_at: header.created_at,
          reserved_at: header.reserved_at,
          picked_at: header.picked_at,
          packed_at: header.packed_at,
          shipped_at: header.shipped_at,
          confirmed_at: header.confirmed_at,
          line_id: line.id,
          sku: line.sku,
          qty: Number(line.qty ?? 0),
          qty_picked: Number(line.qty_picked ?? 0),
          qty_packed: Number(line.qty_packed ?? 0),
          qty_shipped: Number(line.qty_shipped ?? 0),
          line_created_at: line.created_at,
        };
      })
      .filter(Boolean)
      .filter((row: any) => row.qty_shipped < row.qty);

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}