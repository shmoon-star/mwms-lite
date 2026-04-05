import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type GrHeaderRow = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  status: string | null;
};

type GrLineRow = {
  id: string;
  line_no: number | null;
  sku: string | null;
  qty_expected: number | null;
  qty_received: number | null;
  asn_line_id?: string | null;
};

type InventoryRow = {
  sku: string | null;
  qty_onhand: number | null;
  qty_reserved?: number | null;
  allocated?: number | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string | null;
  qty: number | null;
  qty_expected?: number | null;
  qty_received?: number | null;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sb = await createClient();
    const now = new Date().toISOString();

    // 0) GR header 조회
    const { data: grHeader, error: grHeaderError } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status")
      .eq("id", id)
      .single();

    if (grHeaderError || !grHeader) {
      return NextResponse.json(
        { ok: false, error: "GR not found" },
        { status: 404 }
      );
    }

    const header = grHeader as GrHeaderRow;

    // 0-1) 이미 CONFIRMED면 차단
    if (String(header.status || "").toUpperCase() === "CONFIRMED") {
      return NextResponse.json(
        { ok: false, error: "GR already confirmed" },
        { status: 400 }
      );
    }

    if (!header.asn_id) {
      return NextResponse.json(
        { ok: false, error: "GR has no ASN reference" },
        { status: 400 }
      );
    }

    // 0-2) 이미 inventory_tx가 있으면 중복 처리 차단
    const { data: existingTxRows, error: existingTxError } = await sb
      .from("inventory_tx")
      .select("id")
      .eq("ref_type", "GR")
      .eq("ref_id", header.id)
      .limit(1);

    if (existingTxError) {
      return NextResponse.json(
        { ok: false, error: existingTxError.message },
        { status: 500 }
      );
    }

    if ((existingTxRows ?? []).length > 0) {
      return NextResponse.json(
        { ok: false, error: "Inventory transaction already exists for this GR" },
        { status: 400 }
      );
    }

    // 1) GR line 조회
    const { data: grLines, error: grLinesError } = await sb
      .from("gr_line")
      .select("id, line_no, sku, qty_expected, qty_received, asn_line_id")
      .eq("gr_id", id)
      .order("line_no", { ascending: true });

    if (grLinesError) {
      return NextResponse.json(
        { ok: false, error: grLinesError.message },
        { status: 500 }
      );
    }

    const lines = (grLines || []) as GrLineRow[];

    if (lines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "GR has no lines to confirm" },
        { status: 400 }
      );
    }

    const hasAnyReceived = lines.some((line) => safeNum(line.qty_received) > 0);

    if (!hasAnyReceived) {
      return NextResponse.json(
        { ok: false, error: "Confirm 전에 qty_received 값이 있는지 먼저 확인해줘." },
        { status: 400 }
      );
    }

    // 2) SKU별 수령 수량 합산
    const receivedBySku = new Map<string, number>();

    for (const line of lines) {
      const sku = String(line.sku ?? "").trim();
      const received = safeNum(line.qty_received);

      if (!sku || received <= 0) continue;

      receivedBySku.set(sku, (receivedBySku.get(sku) ?? 0) + received);
    }

    if (receivedBySku.size === 0) {
      return NextResponse.json(
        { ok: false, error: "No received quantity to confirm" },
        { status: 400 }
      );
    }

    // 3) Inventory 반영 + inventory_tx 기록 (SKU별 1건)
    for (const [sku, totalReceived] of receivedBySku.entries()) {
      const { data: invRow, error: invReadError } = await sb
        .from("inventory")
        .select("sku, qty_onhand, qty_reserved, allocated")
        .eq("sku", sku)
        .maybeSingle();

      if (invReadError) {
        return NextResponse.json(
          { ok: false, error: invReadError.message },
          { status: 500 }
        );
      }

      const inventory = (invRow as InventoryRow | null) || null;

      if (inventory?.sku) {
        const qtyOnhand = safeNum(inventory.qty_onhand) + totalReceived;

        const { error: invUpdateError } = await sb
          .from("inventory")
          .update({
            qty_onhand: qtyOnhand,
          })
          .eq("sku", sku);

        if (invUpdateError) {
          return NextResponse.json(
            { ok: false, error: invUpdateError.message },
            { status: 500 }
          );
        }
      } else {
        const { error: invInsertError } = await sb.from("inventory").insert({
          sku,
          qty_onhand: totalReceived,
          qty_reserved: 0,
          allocated: 0,
        });

        if (invInsertError) {
          return NextResponse.json(
            { ok: false, error: invInsertError.message },
            { status: 500 }
          );
        }
      }

      const { error: txInsertError } = await sb.from("inventory_tx").insert({
        sku,
        qty: totalReceived,
        qty_delta: totalReceived,
        tx_type: "GR",
        ref_type: "GR",
        ref_id: header.id,
        note: header.gr_no
          ? `GR confirm: ${header.gr_no} / SKU ${sku} / qty ${totalReceived}`
          : `GR confirm / SKU ${sku} / qty ${totalReceived}`,
        created_at: now,
      });

      if (txInsertError) {
        return NextResponse.json(
          { ok: false, error: txInsertError.message },
          { status: 500 }
        );
      }
    }

    // 4) GR 상태 CONFIRMED
    const { error: confirmError } = await sb
      .from("gr_header")
      .update({
        status: "CONFIRMED",
        confirmed_at: now,
      })
      .eq("id", header.id);

    if (confirmError) {
      return NextResponse.json(
        { ok: false, error: confirmError.message },
        { status: 500 }
      );
    }

    // 5) 같은 ASN의 CONFIRMED된 GR line 기준으로 asn_line.qty_received 재계산
    const { data: confirmedGrHeaders, error: confirmedGrHeadersError } = await sb
      .from("gr_header")
      .select("id")
      .eq("asn_id", header.asn_id)
      .eq("status", "CONFIRMED");

    if (confirmedGrHeadersError) {
      return NextResponse.json(
        { ok: false, error: confirmedGrHeadersError.message },
        { status: 500 }
      );
    }

    const confirmedGrIds = (confirmedGrHeaders ?? [])
      .map((r: any) => r.id)
      .filter((v: string | null | undefined): v is string => !!v);

    if (confirmedGrIds.length > 0) {
      const { data: confirmedGrLines, error: confirmedGrLinesError } = await sb
        .from("gr_line")
        .select("asn_line_id, qty_received")
        .in("gr_id", confirmedGrIds);

      if (confirmedGrLinesError) {
        return NextResponse.json(
          { ok: false, error: confirmedGrLinesError.message },
          { status: 500 }
        );
      }

      const receivedByAsnLineId = new Map<string, number>();

      for (const row of confirmedGrLines ?? []) {
        const asnLineId = String((row as any).asn_line_id ?? "").trim();
        if (!asnLineId) continue;

        const current = receivedByAsnLineId.get(asnLineId) ?? 0;
        receivedByAsnLineId.set(
          asnLineId,
          current + safeNum((row as any).qty_received)
        );
      }

      // 같은 ASN의 모든 line을 0으로 초기화한 뒤 confirmed 합계 반영
      const { data: asnLineIdsForReset, error: asnLineIdsForResetError } = await sb
        .from("asn_line")
        .select("id")
        .eq("asn_id", header.asn_id);

      if (asnLineIdsForResetError) {
        return NextResponse.json(
          { ok: false, error: asnLineIdsForResetError.message },
          { status: 500 }
        );
      }

      const resetIds = (asnLineIdsForReset ?? []).map((r: any) => r.id);

      if (resetIds.length > 0) {
        const { error: resetErr } = await sb
          .from("asn_line")
          .update({ qty_received: 0 })
          .in("id", resetIds);

        if (resetErr) {
          return NextResponse.json(
            { ok: false, error: resetErr.message },
            { status: 500 }
          );
        }
      }

      const asnLineIds = Array.from(receivedByAsnLineId.keys());

      for (const asnLineId of asnLineIds) {
        const totalReceived = receivedByAsnLineId.get(asnLineId) ?? 0;

        const { error: asnLineUpdateError } = await sb
          .from("asn_line")
          .update({
            qty_received: totalReceived,
          })
          .eq("id", asnLineId);

        if (asnLineUpdateError) {
          return NextResponse.json(
            { ok: false, error: asnLineUpdateError.message },
            { status: 500 }
          );
        }
      }
    }

    // 6) ASN 상태 재계산
    const { data: asnLines, error: asnLinesError } = await sb
      .from("asn_line")
      .select("id, asn_id, qty, qty_expected, qty_received")
      .eq("asn_id", header.asn_id);

    if (asnLinesError) {
      return NextResponse.json(
        { ok: false, error: asnLinesError.message },
        { status: 500 }
      );
    }

    const asnLineRows = (asnLines ?? []) as AsnLineRow[];

    const totalExpected = asnLineRows.reduce(
      (acc, row) => acc + safeNum(row.qty ?? row.qty_expected),
      0
    );

    const totalReceived = asnLineRows.reduce(
      (acc, row) => acc + safeNum(row.qty_received),
      0
    );

    let asnStatus = "CREATED";
    if (totalReceived <= 0) {
      asnStatus = "CREATED";
    } else if (totalReceived < totalExpected) {
      asnStatus = "PARTIAL_RECEIVED";
    } else {
      asnStatus = "FULL_RECEIVED";
    }

    const { error: asnUpdateError } = await sb
      .from("asn_header")
      .update({
        status: asnStatus,
      })
      .eq("id", header.asn_id);

    if (asnUpdateError) {
      return NextResponse.json(
        { ok: false, error: asnUpdateError.message },
        { status: 500 }
      );
    }

    // 7) ASN 완료 시 Packing List 상태 자동 전환
    if (asnStatus === "FULL_RECEIVED") {
      const { error: plUpdateError } = await sb
        .from("packing_list_header")
        .update({
          status: "INBOUND_COMPLETED",
        })
        .eq("asn_id", header.asn_id);

      if (plUpdateError) {
        return NextResponse.json(
          { ok: false, error: plUpdateError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "GR confirmed successfully",
      gr_id: header.id,
      gr_no: header.gr_no,
      asn_id: header.asn_id,
      asn_status: asnStatus,
      total_expected: totalExpected,
      total_received: totalReceived,
      packing_list_status:
        asnStatus === "FULL_RECEIVED" ? "INBOUND_COMPLETED" : null,
      inventory_updates: Array.from(receivedBySku.entries()).map(([sku, qty]) => ({
        sku,
        qty,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}