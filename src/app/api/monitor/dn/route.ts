import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type OpenDnRow = {
  id: string;
  dn_no: string;
  status: string;
  qty_ordered: number;
  qty_shipped: number;
  balance: number;
  created_at: string | null;
  packed_box_count: number;
  assigned_box_count: number;
  remaining_box_count: number;
};

export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") || "open").trim().toLowerCase();

    // 지금은 open 기준만 shipment candidate 로직으로 처리
    if (view !== "open") {
      return NextResponse.json(
        { ok: false, error: `unsupported view: ${view}` },
        { status: 400 }
      );
    }

    // 1) DN header
    const { data: dnHeaders, error: dnHeaderErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status, created_at")
      .order("created_at", { ascending: false });

    if (dnHeaderErr) {
      return NextResponse.json(
        { ok: false, error: dnHeaderErr.message },
        { status: 500 }
      );
    }

    const dnIds = (dnHeaders || []).map((x: any) => x.id).filter(Boolean);

    if (!dnIds.length) {
      return NextResponse.json({
        ok: true,
        summary: {
          total_dn: 0,
          open_dn: 0,
          closed_dn: 0,
          total_ordered: 0,
          total_shipped: 0,
          total_balance: 0,
        },
        items: [],
      });
    }

    // 2) DN lines
    const { data: dnLines, error: dnLinesErr } = await sb
      .from("dn_lines")
      .select("dn_id, qty_ordered, qty_shipped")
      .in("dn_id", dnIds);

    if (dnLinesErr) {
      return NextResponse.json(
        { ok: false, error: dnLinesErr.message },
        { status: 500 }
      );
    }

    // 3) dn_box: packed/closed box만 shipment candidate
    const { data: dnBoxes, error: dnBoxErr } = await sb
      .from("dn_box")
      .select("id, dn_id, box_no, status, created_at")
      .in("dn_id", dnIds);

    if (dnBoxErr) {
      return NextResponse.json(
        { ok: false, error: dnBoxErr.message },
        { status: 500 }
      );
    }

    const packedBoxes = (dnBoxes || []).filter((row: any) => {
      const st = String(row.status || "").toUpperCase();
      return st === "CLOSED" || st === "PACKED";
    });

    const packedBoxIds = packedBoxes.map((x: any) => x.id).filter(Boolean);

    // 4) pallet_box: 이미 shipment에 실린 box
    let palletBoxes: any[] = [];
    if (packedBoxIds.length) {
      const { data, error } = await sb
        .from("pallet_box")
        .select("box_id")
        .in("box_id", packedBoxIds);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      palletBoxes = data || [];
    }

    const assignedBoxIdSet = new Set(
      palletBoxes.map((x: any) => x.box_id).filter(Boolean)
    );

    // 5) DN별 집계
    const lineMap = new Map<
      string,
      { qty_ordered: number; qty_shipped: number; balance: number }
    >();

    for (const row of dnLines || []) {
      const dnId = row.dn_id;
      const prev = lineMap.get(dnId) || {
        qty_ordered: 0,
        qty_shipped: 0,
        balance: 0,
      };

      const qtyOrdered = safeNum((row as any).qty_ordered);
      const qtyShipped = safeNum((row as any).qty_shipped);

      prev.qty_ordered += qtyOrdered;
      prev.qty_shipped += qtyShipped;
      prev.balance += qtyOrdered - qtyShipped;

      lineMap.set(dnId, prev);
    }

    const packedBoxCountMap = new Map<string, number>();
    const assignedBoxCountMap = new Map<string, number>();

    for (const box of packedBoxes) {
      const dnId = box.dn_id;
      packedBoxCountMap.set(dnId, (packedBoxCountMap.get(dnId) || 0) + 1);

      if (assignedBoxIdSet.has(box.id)) {
        assignedBoxCountMap.set(dnId, (assignedBoxCountMap.get(dnId) || 0) + 1);
      }
    }

    // 6) Open DN = packed/closed box가 있고, 아직 pallet 미배정 box가 남은 DN
    const items: OpenDnRow[] = (dnHeaders || [])
      .map((header: any) => {
        const lineAgg = lineMap.get(header.id) || {
          qty_ordered: 0,
          qty_shipped: 0,
          balance: 0,
        };

        const packedBoxCount = packedBoxCountMap.get(header.id) || 0;
        const assignedBoxCount = assignedBoxCountMap.get(header.id) || 0;
        const remainingBoxCount = packedBoxCount - assignedBoxCount;

        return {
          id: header.id,
          dn_no: header.dn_no || "-",
          status: header.status || "OPEN",
          qty_ordered: lineAgg.qty_ordered,
          qty_shipped: lineAgg.qty_shipped,
          balance: lineAgg.balance,
          created_at: header.created_at || null,
          packed_box_count: packedBoxCount,
          assigned_box_count: assignedBoxCount,
          remaining_box_count: remainingBoxCount,
        };
      })
      .filter((row) => row.packed_box_count > 0 && row.remaining_box_count > 0)
      .sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      });

    const summary = {
      total_dn: items.length,
      open_dn: items.length,
      closed_dn: 0,
      total_ordered: items.reduce((sum, row) => sum + safeNum(row.qty_ordered), 0),
      total_shipped: items.reduce((sum, row) => sum + safeNum(row.qty_shipped), 0),
      total_balance: items.reduce((sum, row) => sum + safeNum(row.balance), 0),
    };

    return NextResponse.json({
      ok: true,
      summary,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}