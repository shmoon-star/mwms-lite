import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNotify, notifyPoCancelled } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PL_CANCELLABLE = ["DRAFT", "SUBMITTED", "REVIEWED", "FINALIZED", "CONFIRMED"];

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const poId = String(id ?? "").trim();
    if (!poId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const sb = await createClient();

    // ── 1. PO 헤더 조회 ───────────────────────────────────────
    const { data: header, error: hErr } = await sb
      .from("po_header")
      .select("id, po_no, status, vendor_id, eta")
      .eq("id", poId)
      .single();

    if (hErr) throw hErr;
    if (!header) return NextResponse.json({ ok: false, error: "PO not found" }, { status: 404 });

    const s = String(header.status ?? "").toUpperCase();
    if (s === "CANCELLED") return NextResponse.json({ ok: true, alreadyCancelled: true });
    if (["RECEIVED", "CLOSED"].includes(s)) {
      return NextResponse.json(
        { ok: false, error: `이미 ${s} 상태인 PO는 취소할 수 없습니다.` },
        { status: 400 }
      );
    }

    const poNo = header.po_no ?? "";

    // ── 2. 연결된 ASN 조회 ────────────────────────────────────
    const { data: asnRows } = await sb
      .from("asn_header")
      .select("id, asn_no, status")
      .eq("po_id", poId);

    const asns = asnRows ?? [];

    // ── 3. GR 이력 확인 → 입고된 ASN이 있으면 전면 차단 ──────
    // asn_line을 통해 gr_line 존재 여부 확인
    const asnIds = asns.map((a) => a.id);
    let receivedAsnInfos: { asn_no: string | null; status: string | null }[] = [];

    if (asnIds.length > 0) {
      const { data: asnLineRows } = await sb
        .from("asn_line")
        .select("id, asn_id, qty_received")
        .in("asn_id", asnIds);

      // qty_received > 0 인 라인이 있는 ASN = 입고 이력 있음
      const receivedAsnIdSet = new Set<string>();
      for (const line of asnLineRows ?? []) {
        if (Number(line.qty_received ?? 0) > 0) {
          receivedAsnIdSet.add(line.asn_id);
        }
      }

      // RECEIVED 상태 ASN도 포함
      for (const a of asns) {
        if (["RECEIVED", "FULL_RECEIVED", "PARTIAL_RECEIVED"].includes(
          String(a.status ?? "").toUpperCase()
        )) {
          receivedAsnIdSet.add(a.id);
        }
      }

      receivedAsnInfos = asns
        .filter((a) => receivedAsnIdSet.has(a.id))
        .map((a) => ({ asn_no: a.asn_no, status: a.status }));
    }

    if (receivedAsnInfos.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `입고(GR) 이력이 있는 ASN이 ${receivedAsnInfos.length}건 있어 PO를 취소할 수 없습니다.\n` +
            `재고 조정이 필요하면 WMS Adjustment를 사용하세요.`,
          blocking_asns: receivedAsnInfos.map((a) => `${a.asn_no ?? "-"} (${a.status})`),
        },
        { status: 400 }
      );
    }

    // ── 4. 연결된 PL 조회 (po_no 기준) ───────────────────────
    const { data: plRows } = await sb
      .from("packing_list_header")
      .select("id, pl_no, status")
      .eq("po_no", poNo);

    const pls = plRows ?? [];

    // INBOUND_COMPLETED PL이 있으면 차단
    const completedPls = pls.filter(
      (pl) => String(pl.status ?? "").toUpperCase() === "INBOUND_COMPLETED"
    );
    if (completedPls.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `입고 완료(INBOUND_COMPLETED)된 패킹리스트가 ${completedPls.length}건 있어 PO를 취소할 수 없습니다.`,
          blocking_pls: completedPls.map((pl) => pl.pl_no),
        },
        { status: 400 }
      );
    }

    // ── 5. PL 상태 → CANCELED (레코드 보존, 입고 없는 것만) ──
    const cancellablePlIds = pls
      .filter((pl) => PL_CANCELLABLE.includes(String(pl.status ?? "").toUpperCase()))
      .map((pl) => pl.id);

    if (cancellablePlIds.length > 0) {
      await sb
        .from("packing_list_header")
        .update({ status: "CANCELED" })
        .in("id", cancellablePlIds);
    }

    // ── 6. ASN 상태 → CANCELLED (GR 없는 것만) ───────────────
    const cancelableAsnIds = asns
      .filter((a) => !["RECEIVED", "FULL_RECEIVED", "PARTIAL_RECEIVED", "CANCELLED", "CLOSED"]
        .includes(String(a.status ?? "").toUpperCase()))
      .map((a) => a.id);

    if (cancelableAsnIds.length > 0) {
      await sb
        .from("asn_header")
        .update({ status: "CANCELLED" })
        .in("id", cancelableAsnIds);
    }

    // ── 7. PO 헤더 상태 → CANCELLED ──────────────────────────
    const now = new Date().toISOString();
    const { error: hdrUpdErr } = await sb
      .from("po_header")
      .update({ status: "CANCELLED", cancelled_at: now })
      .eq("id", poId);

    if (hdrUpdErr) {
      const { error: fallbackErr } = await sb
        .from("po_header")
        .update({ status: "CANCELLED" })
        .eq("id", poId);
      if (fallbackErr) throw fallbackErr;
    }

    // ── 8. 벤더 이메일 알림 ──────────────────────────────────
    if (header.vendor_id) {
      await safeNotify(`PO_CANCELLED:${poNo}`, () =>
        notifyPoCancelled({
          poNo: poNo || poId,
          vendorId: header.vendor_id!,
          eta: header.eta ?? null,
          cancelledAsnCount: cancelableAsnIds.length,
          cancelledPlCount: cancellablePlIds.length,
        })
      );
    }

    return NextResponse.json({
      ok: true,
      status: "CANCELLED",
      cancelled_asn_count: cancelableAsnIds.length,
      cancelled_pl_count: cancellablePlIds.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

/** 취소 전 영향 범위 사전 조회 (GET) */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const poId = String(id ?? "").trim();
    if (!poId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const sb = await createClient();

    const { data: header } = await sb
      .from("po_header")
      .select("id, po_no, status, vendor_id")
      .eq("id", poId)
      .single();

    if (!header) return NextResponse.json({ ok: false, error: "PO not found" }, { status: 404 });

    const poNo = header.po_no ?? "";

    const [{ data: plRows }, { data: asnRows }] = await Promise.all([
      sb.from("packing_list_header").select("id, pl_no, status").eq("po_no", poNo),
      sb.from("asn_header").select("id, asn_no, status").eq("po_id", poId),
    ]);

    const asns = asnRows ?? [];
    const asnIds = asns.map((a) => a.id);

    // GR 이력 확인
    let receivedAsnIds = new Set<string>();
    if (asnIds.length > 0) {
      const { data: lineRows } = await sb
        .from("asn_line")
        .select("asn_id, qty_received")
        .in("asn_id", asnIds);

      for (const line of lineRows ?? []) {
        if (Number(line.qty_received ?? 0) > 0) receivedAsnIds.add(line.asn_id);
      }
      for (const a of asns) {
        if (["RECEIVED", "FULL_RECEIVED", "PARTIAL_RECEIVED"].includes(
          String(a.status ?? "").toUpperCase()
        )) receivedAsnIds.add(a.id);
      }
    }

    const pls = (plRows ?? []).map((pl) => ({ pl_no: pl.pl_no, status: pl.status }));
    const asnList = asns.map((a) => ({
      asn_no: a.asn_no,
      status: a.status,
      has_gr: receivedAsnIds.has(a.id),
    }));

    const blockingAsns = asnList.filter((a) => a.has_gr);
    const blockingPls = pls.filter(
      (pl) => String(pl.status ?? "").toUpperCase() === "INBOUND_COMPLETED"
    );

    const can_cancel = blockingAsns.length === 0 && blockingPls.length === 0;

    return NextResponse.json({
      ok: true,
      po_status: header.status,
      pls,
      asns: asnList,
      blocking_asns: blockingAsns,
      blocking_pls: blockingPls,
      can_cancel,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
