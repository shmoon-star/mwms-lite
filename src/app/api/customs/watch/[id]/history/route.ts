import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/customs/watch/[id]/history
 *   해당 watch의 snapshot 목록 (최신순). raw_response는 용량 커서 제외,
 *   detail 보고 싶으면 별도 엔드포인트 필요하지만 MVP는 요약 필드만.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("customs_watch_snapshot")
      .select("id, checked_at, prgs_stts, cscl_prgs_stts, etpr_dt, detail_count, change_summary")
      .eq("watch_id", id)
      .order("checked_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
