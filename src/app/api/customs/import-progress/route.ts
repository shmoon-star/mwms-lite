import { NextRequest, NextResponse } from "next/server";
import { fetchCargProgress, validateCargProgressParams } from "@/lib/unipass";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/customs/import-progress?mblNo=...&hblNo=...&blYy=YYYY&cargMtNo=...
 *
 * 관세청 UNI-PASS OpenAPI: 화물통관 진행정보 (API001) 실시간 프록시.
 * 내부 유틸 lib/unipass.ts 사용. DB 저장 없음.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params = {
    mblNo: sp.get("mblNo")?.trim() || undefined,
    hblNo: sp.get("hblNo")?.trim() || undefined,
    blYy: sp.get("blYy")?.trim() || undefined,
    cargMtNo: sp.get("cargMtNo")?.trim() || undefined,
  };

  const validationErr = validateCargProgressParams(params);
  if (validationErr) {
    return NextResponse.json({ ok: false, error: validationErr }, { status: 400 });
  }

  const result = await fetchCargProgress(params);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, data: result.data },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ ok: true, data: result.data });
}
