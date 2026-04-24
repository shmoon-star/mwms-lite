import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/customs/watch/export?includeClosed=true
 *   전체 watchlist + cargo_info를 flatten하여 CSV 다운로드.
 *   UTF-8 BOM 포함 (Excel 한글 호환).
 */

// 주요 cargo_info 필드 순서 및 한글 라벨. 이 리스트에 없는 키는 뒤에 영문명 그대로 이어붙임.
const CARGO_LABELS: Record<string, string> = {
  cargMtNo: "화물관리번호(응답)",
  prgsStts: "진행상태",
  prgsStCd: "진행상태코드",
  csclPrgsStts: "통관진행상태",
  mblNo: "MBL번호(응답)",
  hblNo: "HBL번호(응답)",
  blPt: "BL유형코드",
  blPtNm: "BL유형",
  shipNm: "선박명",
  shipNat: "선박국적코드",
  shipNatNm: "선박국적",
  shcoFlcoSgn: "선사항공사부호",
  shcoFlco: "선사항공사",
  cargTp: "화물구분",
  ldprCd: "적재항코드",
  ldprNm: "적재항",
  lodCntyCd: "적출국가코드",
  dsprCd: "양륙항코드",
  dsprNm: "양륙항",
  etprCstm: "입항세관",
  etprDt: "입항일자",
  prcsDttm: "처리일시",
  msrm: "용적",
  ttwg: "총중량",
  wghtUt: "중량단위",
  pckGcnt: "포장개수",
  pckUt: "포장단위",
  prnm: "품명",
  cntrGcnt: "컨테이너개수",
  cntrNo: "컨테이너번호",
  agnc: "대리점",
  frwrSgn: "포워더부호",
  frwrEntsConm: "포워더",
  entsKoreNm: "업체명",
  vydf: "항차",
  spcnCargCd: "특수화물코드",
  mtTrgtCargYnNm: "관리대상화물여부",
  rlseDtyPridPassTpcd: "반출의무과태료여부",
  dclrDelyAdtxYn: "신고지연가산세여부",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const sb = createAdminClient();
    const includeClosed = req.nextUrl.searchParams.get("includeClosed") !== "false";

    let q = sb.from("customs_watch").select("*").order("created_at", { ascending: true });
    if (!includeClosed) q = q.eq("is_closed", false);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data ?? [];

    // cargo_info의 모든 키 합집합 수집 (CARGO_LABELS에 없는 신규 필드도 포함)
    const cargoKeysInData = new Set<string>();
    for (const r of rows) {
      if (r.cargo_info && typeof r.cargo_info === "object") {
        for (const k of Object.keys(r.cargo_info)) cargoKeysInData.add(k);
      }
    }
    // 정렬: CARGO_LABELS 순서 우선, 나머지는 알파벳
    const orderedCargoKeys = [
      ...Object.keys(CARGO_LABELS).filter((k) => cargoKeysInData.has(k)),
      ...[...cargoKeysInData]
        .filter((k) => !(k in CARGO_LABELS))
        .sort(),
    ];

    // 기본 watch 컬럼
    const baseCols: Array<{ key: keyof typeof rows[number] | string; label: string }> = [
      { key: "id", label: "id" },
      { key: "mbl_no", label: "MBL" },
      { key: "hbl_no", label: "HBL" },
      { key: "bl_yy", label: "BL년도" },
      { key: "carg_mt_no", label: "화물관리번호(등록)" },
      { key: "memo", label: "메모" },
      { key: "last_prgs_stts", label: "캐시_진행상태" },
      { key: "last_cscl_prgs_stts", label: "캐시_통관상태" },
      { key: "last_etpr_dt", label: "캐시_입항일자" },
      { key: "last_detail_count", label: "캐시_이력수" },
      { key: "last_checked_at", label: "마지막조회" },
      { key: "last_error", label: "마지막오류" },
      { key: "is_closed", label: "종료여부" },
      { key: "closed_at", label: "종료일시" },
      { key: "created_at", label: "등록일시" },
      { key: "updated_at", label: "수정일시" },
    ];

    const headers = [
      ...baseCols.map((c) => c.label),
      ...orderedCargoKeys.map((k) => CARGO_LABELS[k] || k),
    ];

    const lines: string[] = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of rows) {
      const base = baseCols.map((c) => csvEscape((r as any)[c.key]));
      const cargo = orderedCargoKeys.map((k) => csvEscape(r.cargo_info?.[k]));
      lines.push([...base, ...cargo].join(","));
    }

    const csv = "\uFEFF" + lines.join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="customs_watchlist_${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "CSV export failed" },
      { status: 500 },
    );
  }
}
