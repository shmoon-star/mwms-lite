import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/analytics/wms-history — 저장된 일별 WMS 데이터 목록
 *  GET /api/analytics/wms-history?date=2026-04-14 — 특정 날짜 데이터
 */
export async function GET(req: NextRequest) {
  try {
    const sb = await createClient();
    const date = req.nextUrl.searchParams.get("date");

    if (date) {
      // 특정 날짜 데이터 반환
      const { data, error } = await sb
        .from("wms_daily_upload")
        .select("*")
        .eq("upload_date", date)
        .single();

      if (error || !data) {
        return NextResponse.json({ ok: false, error: "No data for this date" }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        upload: data,
        // raw_data에 차트 데이터가 들어있음
        ...(data.raw_data || {}),
      });
    }

    // 목록 (최근 60일)
    const { data, error } = await sb
      .from("wms_daily_upload")
      .select("id, upload_date, file_name, source, total_rows, total_in, total_out, created_at")
      .order("upload_date", { ascending: false })
      .limit(60);

    if (error) throw error;

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
