import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseHistoryExcel } from "@/lib/history-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_BU = new Set(["CN", "JP", "TW"]);

/**
 * POST /api/monitor/history/upload?bu=CN
 *
 * Excel 한 파일 업로드 → 해당 BU의 기존 history_document / history_settlement
 * 만 삭제 후 재삽입 (BU 스코프 오버라이드)
 *
 * - `bu` 쿼리 파라미터 필수 (CN / JP / TW)
 * - 다른 BU의 데이터는 그대로 유지됨
 */
export async function POST(req: NextRequest) {
  try {
    const bu = (req.nextUrl.searchParams.get("bu") || "").trim().toUpperCase();
    if (!bu) {
      return NextResponse.json(
        { ok: false, error: "BU 파라미터가 필요합니다 (?bu=CN|JP|TW)." },
        { status: 400 }
      );
    }
    if (!ALLOWED_BU.has(bu)) {
      return NextResponse.json(
        { ok: false, error: `허용되지 않은 BU 값: ${bu}. (허용: CN, JP, TW)` },
        { status: 400 }
      );
    }

    const sb = await createClient();

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseHistoryExcel(buffer, bu);

    if (parsed.documents.length === 0 && parsed.settlements.length === 0) {
      return NextResponse.json(
        { ok: false, error: "파싱된 데이터가 없습니다. 시트 이름(PO/DN/Shipment/GR/Settlement)과 컬럼을 확인하세요." },
        { status: 400 }
      );
    }

    // 1. 해당 BU 데이터만 삭제 (다른 BU는 유지)
    const { error: delDocErr } = await sb
      .from("history_document")
      .delete()
      .eq("business_unit", bu);
    if (delDocErr) throw new Error(`history_document 삭제 실패: ${delDocErr.message}`);

    const { error: delStErr } = await sb
      .from("history_settlement")
      .delete()
      .eq("business_unit", bu);
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
      bu,
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
