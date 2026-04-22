import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/customs/import-progress?mblNo=...&hblNo=...&blYy=YYYY
 *
 * 관세청 UNI-PASS OpenAPI: 화물통관 진행정보 (API001)
 *   서비스명: retrieveCargCsclPrgsInfo
 *   수입화물의 통관/반출입 진행상태 조회
 *
 * MBL 번호 또는 HBL 번호 중 하나 이상 + 입항년도 필수.
 * 실시간 프록시 호출만 수행 (DB 저장 없음).
 */

const UNIPASS_BASE_URL =
  "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/**
 * flat XML element 파싱: <tag>value</tag> 및 <tag/>
 * 중첩 컨테이너를 먼저 제거한 뒤 호출해야 함.
 */
function parseFlat(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<(\w+)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[1];
    const val = (m[2] ?? "").trim();
    out[tag] = val;
  }
  return out;
}

/** 다중 occurrence를 array로 수집 */
function parseFlatMulti(xml: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const re = /<(\w+)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[1];
    const val = (m[2] ?? "").trim();
    const prev = out[tag];
    if (prev === undefined) {
      out[tag] = val;
    } else if (Array.isArray(prev)) {
      prev.push(val);
    } else {
      out[tag] = [prev, val];
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.UNIPASS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "UNIPASS_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const sp = req.nextUrl.searchParams;
    const mblNo = sp.get("mblNo")?.trim() || "";
    const hblNo = sp.get("hblNo")?.trim() || "";
    const blYy = sp.get("blYy")?.trim() || "";
    const cargMtNo = sp.get("cargMtNo")?.trim() || "";

    if (!mblNo && !hblNo && !cargMtNo) {
      return NextResponse.json(
        { ok: false, error: "MBL 번호, HBL 번호, 화물관리번호 중 하나는 입력해야 합니다." },
        { status: 400 },
      );
    }
    if ((mblNo || hblNo) && !blYy) {
      return NextResponse.json(
        { ok: false, error: "MBL/HBL 조회 시 BL 년도(blYy, 4자리)는 필수입니다." },
        { status: 400 },
      );
    }
    if (blYy && !/^\d{4}$/.test(blYy)) {
      return NextResponse.json(
        { ok: false, error: "BL 년도는 4자리 숫자여야 합니다 (예: 2026)." },
        { status: 400 },
      );
    }

    const qs = new URLSearchParams({ crkyCn: apiKey });
    if (cargMtNo) qs.set("cargMtNo", cargMtNo);
    if (mblNo) qs.set("mblNo", mblNo);
    if (hblNo) qs.set("hblNo", hblNo);
    if (blYy) qs.set("blYy", blYy);

    const url = `${UNIPASS_BASE_URL}?${qs.toString()}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/xml, text/xml, */*" },
      cache: "no-store",
    });

    const xml = await resp.text();

    if (!resp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `UNI-PASS API 호출 실패 (status ${resp.status})`,
          raw: xml.slice(0, 1000),
        },
        { status: 502 },
      );
    }

    // 최상위 래핑: <cargCsclPrgsInfoQryRtnVo>...</cargCsclPrgsInfoQryRtnVo>
    const rootBlocks = extractBlocks(xml, "cargCsclPrgsInfoQryRtnVo");
    const root = rootBlocks[0] ?? xml;

    // ntceInfo (오류/안내 메시지). [N00]으로 시작하면 다건 리스트 응답
    const ntceInfoBlocks = extractBlocks(root, "ntceInfo");
    const ntceInfo = ntceInfoBlocks[0]?.trim() ?? "";
    const isError =
      ntceInfo &&
      !ntceInfo.startsWith("[N00]") &&
      /\[(E|W|N)\d{2}\]/.test(ntceInfo);

    // 단건 상세: <cargCsclPrgsInfoQryVo>
    const headerBlocks = extractBlocks(root, "cargCsclPrgsInfoQryVo");
    const header = headerBlocks[0] ? parseFlat(headerBlocks[0]) : null;

    // 반출입 이력: <cargCsclPrgsInfoDtlQryVo> (0..n)
    const detailBlocks = extractBlocks(root, "cargCsclPrgsInfoDtlQryVo");
    const details = detailBlocks.map(parseFlat);

    // 다건 목록: <cargCsclPrgsInfoLstQryVo> (0..n) — 다건 응답 시
    const listBlocks = extractBlocks(root, "cargCsclPrgsInfoLstQryVo");
    const list = listBlocks.map(parseFlat);

    // 최상위 단일 필드 (tCnt 등) — 컨테이너 태그 제거 후 flat parse
    const stripped = root
      .replace(/<cargCsclPrgsInfoQryVo>[\s\S]*?<\/cargCsclPrgsInfoQryVo>/g, "")
      .replace(/<cargCsclPrgsInfoDtlQryVo>[\s\S]*?<\/cargCsclPrgsInfoDtlQryVo>/g, "")
      .replace(/<cargCsclPrgsInfoLstQryVo>[\s\S]*?<\/cargCsclPrgsInfoLstQryVo>/g, "");
    const meta = parseFlat(stripped);

    if (isError) {
      return NextResponse.json(
        {
          ok: false,
          error: `UNI-PASS 응답 오류: ${ntceInfo}`,
          data: { ntceInfo, meta, header, details, list },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        ntceInfo,
        tCnt: meta.tCnt ? Number(meta.tCnt) : null,
        header,
        details,
        list,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
