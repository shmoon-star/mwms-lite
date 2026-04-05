import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteCtx = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "packing list id is required" },
        { status: 400 }
      );
    }

    // 1) packing list header 조회
    const { data: header, error: headerError } = await supabase
      .from("packing_list_header")
      .select("id, pl_no, po_no")
      .eq("id", id)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: "Packing list not found" },
        { status: 404 }
      );
    }

    // 2) packing list lines 조회
    const { data: packingLines, error: packingLinesError } = await supabase
      .from("packing_list_lines")
      .select("sku, qty")
      .eq("packing_list_id", id);

    if (packingLinesError) {
      throw new Error(packingLinesError.message);
    }

    // packed qty 집계
    const packedMap = new Map<string, number>();

    for (const row of packingLines ?? []) {
      const sku = String(row.sku ?? "").trim();
      if (!sku) continue;

      const current = packedMap.get(sku) ?? 0;
      packedMap.set(sku, current + Number(row.qty ?? 0));
    }

    // 3) GR received qty 집계
    // po_no 기준으로 gr_line -> gr_header -> asn_header -> po_header 연결
    const { data: grRows, error: grRowsError } = await supabase
      .from("gr_line")
      .select(`
        sku,
        qty_received,
        gr_header!inner(
          asn_header!inner(
            po_header!inner(
              po_no
            )
          )
        )
      `);

    if (grRowsError) {
      throw new Error(grRowsError.message);
    }

    const grMap = new Map<string, number>();

    for (const row of grRows ?? []) {
      const sku = String(row.sku ?? "").trim();
      if (!sku) continue;

      const poNo =
        (row as any)?.gr_header?.asn_header?.po_header?.po_no ?? null;

      if (!poNo || poNo !== header.po_no) continue;

      const current = grMap.get(sku) ?? 0;
      grMap.set(sku, current + Number(row.qty_received ?? 0));
    }

    // 4) merge
    const lines = Array.from(packedMap.entries()).map(([sku, packedQty]) => {
      const grReceivedQty = grMap.get(sku) ?? 0;
      const balanceQty = packedQty - grReceivedQty;

      return {
        sku,
        packedQty,
        grReceivedQty,
        balanceQty,
      };
    });

    // 5) summary
    const summary = lines.reduce(
      (acc, row) => {
        acc.packedQty += row.packedQty;
        acc.grReceivedQty += row.grReceivedQty;
        acc.balanceQty += row.balanceQty;
        return acc;
      },
      {
        packedQty: 0,
        grReceivedQty: 0,
        balanceQty: 0,
      }
    );

    return NextResponse.json({
      ok: true,
      packingListId: header.id,
      plNo: header.pl_no,
      poNo: header.po_no,
      summary,
      lines,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load packing list progress",
      },
      { status: 500 }
    );
  }
}