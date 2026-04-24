import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/customs/watch/[id]
 *   watch 삭제 (snapshot은 FK cascade로 함께 삭제)
 *
 * PATCH /api/customs/watch/[id]
 *   body: { memo?, is_closed? }
 */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = createAdminClient();
    const { error } = await sb.from("customs_watch").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, any> = {};
    if (typeof body.memo === "string") patch.memo = body.memo;
    if (typeof body.is_closed === "boolean") {
      patch.is_closed = body.is_closed;
      patch.closed_at = body.is_closed ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "변경할 필드가 없습니다." }, { status: 400 });
    }
    const { data, error } = await sb
      .from("customs_watch")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
