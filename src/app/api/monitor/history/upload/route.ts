import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseHistoryExcel } from "@/lib/history-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/monitor/history/upload
 *
 * Excel 한 파일 업로드 → 기존 history_document / history_settlement
 * 전체 삭제 후 재삽입 (오버라이드 방식)
 */
export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseHistoryExcel(buffer);

    if (parsed.documents.length === 0 && parsed.settlements.length === 0) {
      return NextResponse.json(
        { ok: false, error: "파싱된 데이터가 없습니다. 시트 이름(PO/DN/Shipment/GR/Settlement)과 컬럼을 확인하세요." },
        { status: 400 }
      );
    }

    // 1. 기존 데이터 전체 삭제 (오버라이드)
    const { error: delDocErr } = await sb.from("history_document").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delDocErr) throw new Error(`history_document 삭제 실패: ${delDocErr.message}`);

    const { error: delStErr } = await sb.from("history_settlement").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delStErr) throw new Error(`history_settlement 삭제 실패: ${delStErr.message}`);

    // 2. 신규 데이터 삽입 (청크 단위)
    const CHUNK = 500;

    if (parsed.documents.length > 0) {
      for (let i = 0; i < parsed.documents.length; i += CHUNK) {
        const chunk = parsed.documents.slice(i, i + CHUNK);
        const { error } = await sb.from("history_document").insert(chunk);
        if (error) throw new Error(`history_document insert 실패 (${i}~): ${error.message}`);
      }
    }

    if (parsed.settlements.length > 0) {
      const { error } = await sb.from("history_settlement").insert(parsed.settlements);
      if (error) throw new Error(`history_settlement insert 실패: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      summary: parsed.summary,
      total_documents: parsed.documents.length,
      total_settlements: parsed.settlements.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
