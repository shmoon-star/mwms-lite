import { NextRequest, NextResponse } from "next/server";
import { parseWmsExcel } from "@/lib/wms-parser";
import { createClient } from "@/lib/supabase/server";
import { notifyInboundFromWmsData } from "@/lib/notify-inbound";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseWmsExcel(buffer);

    // DB에 저장 (오늘 날짜 기준, UPSERT)
    try {
      const sb = await createClient();
      const today = new Date().toISOString().slice(0, 10);

      await sb.from("wms_daily_upload").upsert({
        upload_date: today,
        file_name: file.name,
        source: "manual",
        total_rows: result.totalRows,
        total_in: result.summary.totalIN,
        total_out: result.summary.totalOUT,
        raw_data: result,
      }, { onConflict: "upload_date" });
    } catch {
      // DB 저장 실패해도 응답은 반환
    }

    // 입고 알림 발송 (최신 날짜의 IN 데이터가 있으면)
    let notifyResult = null;
    try {
      const latestDate = result.dates[result.dates.length - 1]; // 가장 최근 날짜
      notifyResult = await notifyInboundFromWmsData(result, latestDate);
    } catch {}

    return NextResponse.json({ ok: true, ...result, notifyResult });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
