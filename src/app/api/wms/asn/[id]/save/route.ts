import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function buildGrNo() {
  return `GR-${Date.now()}`;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: asnId } = await context.params;
    const sb = await createClient();
    const body = await req.json();

    const lines = Array.isArray(body?.lines) ? body.lines : [];

    if (!asnId) {
      return NextResponse.json(
        { ok: false, error: "asnId is required" },
        { status: 400 }
      );
    }

    const { data: asnHeader, error: asnErr } = await sb
      .from("asn_header")
      .select("id, asn_no, status")
      .eq("id", asnId)
      .maybeSingle();

    if (asnErr) throw asnErr;

    if (!asnHeader) {
      return NextResponse.json(
        { ok: false, error: "ASN not found" },
        { status: 404 }
      );
    }

    let { data: pendingGr } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status")
      .eq("asn_id", asnId)
      .eq("status", "PENDING")
      .maybeSingle();

    if (!pendingGr) {
      const { data: insertedGr, error: insertGrErr } = await sb
        .from("gr_header")
        .insert({
          gr_no: buildGrNo(),
          asn_id: asnId,
          status: "PENDING",
          created_at: new Date().toISOString(),
        })
        .select("id, gr_no, asn_id, status")
        .single();

      if (insertGrErr || !insertedGr) {
        throw insertGrErr || new Error("Failed to create GR header");
      }

      pendingGr = insertedGr;
    }

    const asnLineIds = lines
      .map((x: any) => String(x?.asn_line_id || "").trim())
      .filter(Boolean);

    if (asnLineIds.length === 0) {
      return NextResponse.json({
        ok: true,
        gr_id: pendingGr.id,
        gr_no: pendingGr.gr_no,
        saved_count: 0,
      });
    }

    const { data: asnLines, error: asnLineErr } = await sb
      .from("asn_line")
 .select("id, sku, qty_expected, qty, qty_received")
      .in("id", asnLineIds);

    if (asnLineErr) throw asnLineErr;

    const asnLineMap = new Map((asnLines || []).map((r: any) => [String(r.id), r]));

    const { data: existingGrLines, error: existingErr } = await sb
      .from("gr_line")
      .select("id, gr_id, asn_line_id")
      .eq("gr_id", pendingGr.id)
      .in("asn_line_id", asnLineIds);

    if (existingErr) throw existingErr;

    const existingMap = new Map(
      (existingGrLines || []).map((r: any) => [String(r.asn_line_id), r])
    );

    let savedCount = 0;

    for (const row of lines) {
      const asnLineId = String(row?.asn_line_id || "").trim();
      if (!asnLineId) continue;

      const receivedQty = safeNum(
        row?.received_qty ?? row?.qty_received ?? row?.qty
      );

      const asnLine = asnLineMap.get(asnLineId);
      if (!asnLine) continue;

      const expectedQty = safeNum(
        asnLine.qty ?? asnLine.qty_expected ?? 0
      );

      const existing = existingMap.get(asnLineId);

      if (existing) {
        const { error: updErr } = await sb
          .from("gr_line")
          .update({
            qty_expected: expectedQty,
            qty_received: receivedQty,
            qty: receivedQty,
          })
          .eq("id", existing.id);

        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await sb
          .from("gr_line")
          .insert({
            gr_id: pendingGr.id,
            asn_line_id: asnLineId,
            sku: asnLine.sku,
            qty_expected: expectedQty,
            qty_received: receivedQty,
            qty: receivedQty,
          });

        if (insErr) throw insErr;
      }

      const { error: asnUpdErr } = await sb
        .from("asn_line")
        .update({
          qty_received: receivedQty,
        })
        .eq("id", asnLineId);

      if (asnUpdErr) throw asnUpdErr;

      savedCount += 1;
    }

    const { data: refreshedLines, error: refreshedErr } = await sb
      .from("asn_line")
      .select("qty, qty_expected, qty_received, received_qty")
      .eq("asn_id", asnId);

    if (refreshedErr) throw refreshedErr;

    const totalExpected = (refreshedLines || []).reduce(
      (sum: number, row: any) => sum + safeNum(row.qty ?? row.qty_expected ?? 0),
      0
    );

    const totalReceived = (refreshedLines || []).reduce(
      (sum: number, row: any) =>
        sum + safeNum(row.qty_received ?? row.received_qty ?? 0),
      0
    );

    let nextStatus = "OPEN";
    if (totalReceived > 0 && totalReceived < totalExpected) {
      nextStatus = "PARTIAL_RECEIVED";
    }
    if (totalExpected > 0 && totalReceived >= totalExpected) {
      nextStatus = "FULL_RECEIVED";
    }

    const { error: asnHeaderUpdErr } = await sb
      .from("asn_header")
      .update({
        status: nextStatus,
      })
      .eq("id", asnId);

    if (asnHeaderUpdErr) throw asnHeaderUpdErr;

    return NextResponse.json({
      ok: true,
      gr_id: pendingGr.id,
      gr_no: pendingGr.gr_no,
      saved_count: savedCount,
      asn_status: nextStatus,
      total_expected: totalExpected,
      total_received: totalReceived,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save WMS ASN received qty" },
      { status: 500 }
    );
  }
}