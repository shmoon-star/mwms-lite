import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyEtaChanged, safeNotify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, eta, status, created_at")
      .eq("id", id)
      .single();

    if (hErr) throw hErr;

    let vendor: any = null;

    if (header?.vendor_id) {
      const { data: vendorRow, error: vErr } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .eq("id", header.vendor_id)
        .maybeSingle();

      if (vErr) throw vErr;
      vendor = vendorRow ?? null;
    }

    const { data: lines, error: lErr } = await sb
      .from("po_line")
      .select("id, po_id, sku, qty, qty_ordered, created_at")
      .eq("po_id", id)
      .order("created_at", { ascending: true });

    if (lErr) throw lErr;

    return NextResponse.json({
      ok: true,
      po: {
        id: header.id,
        po_no: header.po_no,
        vendor_id: header.vendor_id,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        vendor:
          vendor?.vendor_code ??
          vendor?.vendor_name ??
          header.vendor_id ??
          null,
        eta: header.eta,
        status: header.status,
        created_at: header.created_at,
        lines: lines ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sb = await createClient();

    const body = await req.json().catch(() => ({}));
    const newEta = body?.eta ?? null;

    if (!newEta || typeof newEta !== "string") {
      return NextResponse.json(
        { ok: false, error: "eta is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // 날짜 형식 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newEta)) {
      return NextResponse.json(
        { ok: false, error: "eta must be YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // 기존 PO 조회 (vendor_id, 기존 eta 확인용)
    const { data: existing, error: fetchErr } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, eta")
      .eq("id", id)
      .single();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "PO not found" },
        { status: 404 }
      );
    }

    const oldEta = existing.eta ?? null;

    // ETA 업데이트
    const { data: updated, error: updateErr } = await sb
      .from("po_header")
      .update({ eta: newEta })
      .eq("id", id)
      .select("id, po_no, vendor_id, eta, status")
      .single();

    if (updateErr) throw updateErr;

    // 벤더에게 ETA 변경 이메일 발송 (실패해도 API 성공)
    if (updated.vendor_id) {
      await safeNotify(`ETA_CHANGED:${updated.po_no}`, () =>
        notifyEtaChanged({
          poNo: updated.po_no ?? id,
          vendorId: updated.vendor_id,
          oldEta,
          newEta,
        })
      );
    }

    return NextResponse.json({
      ok: true,
      po_id: id,
      po_no: updated.po_no,
      old_eta: oldEta,
      new_eta: updated.eta,
      vendor_id: updated.vendor_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}