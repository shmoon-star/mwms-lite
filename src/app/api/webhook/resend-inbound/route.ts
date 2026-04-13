import { NextRequest, NextResponse } from "next/server";
import { parseWmsExcel } from "@/lib/wms-parser";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Resend Inbound Webhook
 *
 * Resend가 이메일 수신 시 이 엔드포인트를 POST로 호출합니다.
 * 첨부파일(Excel)을 파싱하여 wms_daily_upload 테이블에 저장합니다.
 *
 * Resend Inbound payload:
 * {
 *   from: "sender@example.com",
 *   to: "inbound@yourdomain.com",
 *   subject: "...",
 *   attachments: [{ filename: "...", content: "base64...", content_type: "..." }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resend Inbound 페이로드에서 첨부파일 추출
    const attachments = body.attachments ?? body.data?.attachments ?? [];

    if (!attachments || attachments.length === 0) {
      return NextResponse.json({ ok: false, error: "No attachments" }, { status: 200 });
    }

    // Excel 파일 찾기
    const excelAttachment = attachments.find((a: any) => {
      const name = String(a.filename || a.name || "").toLowerCase();
      return name.endsWith(".xlsx") || name.endsWith(".xls");
    });

    if (!excelAttachment) {
      return NextResponse.json({ ok: false, error: "No Excel attachment found" }, { status: 200 });
    }

    // Base64 디코딩
    const content = excelAttachment.content || excelAttachment.data || "";
    const buffer = Buffer.from(content, "base64");

    if (buffer.length === 0) {
      return NextResponse.json({ ok: false, error: "Empty attachment" }, { status: 200 });
    }

    // 파싱
    const result = parseWmsExcel(buffer);

    // DB 저장 (admin client — webhook은 인증 없이 호출되므로)
    const sb = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await sb.from("wms_daily_upload").upsert({
      upload_date: today,
      file_name: excelAttachment.filename || excelAttachment.name || "email_attachment.xlsx",
      source: "email",
      total_rows: result.totalRows,
      total_in: result.summary.totalIN,
      total_out: result.summary.totalOUT,
      raw_data: result,
    }, { onConflict: "upload_date" });

    if (error) {
      console.error("[WEBHOOK] DB save error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    console.log(`[WEBHOOK] WMS data saved: ${today}, ${result.totalRows} rows, IN=${result.summary.totalIN}, OUT=${result.summary.totalOUT}`);

    return NextResponse.json({
      ok: true,
      date: today,
      totalRows: result.totalRows,
      summary: result.summary,
    });
  } catch (e: any) {
    console.error("[WEBHOOK] Error:", e?.message);
    // Webhook은 항상 200 반환 (재시도 방지)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 });
  }
}
