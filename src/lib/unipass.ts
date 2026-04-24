/**
 * 관세청 UNI-PASS OpenAPI 공통 유틸
 *
 * API001 화물통관 진행정보 (retrieveCargCsclPrgsInfo) 호출을 담당.
 * Route handler 여러 곳에서 재사용하기 위해 lib으로 분리.
 */

const UNIPASS_CARG_URL =
  "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

export type CargProgressParams = {
  mblNo?: string;
  hblNo?: string;
  blYy?: string;
  cargMtNo?: string;
};

export type CargProgressData = {
  ntceInfo: string;
  tCnt: number | null;
  header: Record<string, string> | null;
  details: Record<string, string>[];
  list: Record<string, string>[];
};

export type CargProgressResult =
  | { ok: true; data: CargProgressData }
  | { ok: false; error: string; status?: number; data?: Partial<CargProgressData>; raw?: string };

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function parseFlat(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<(\w+)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out[m[1]] = (m[2] ?? "").trim();
  }
  return out;
}

export function validateCargProgressParams(p: CargProgressParams): string | null {
  const { mblNo, hblNo, blYy, cargMtNo } = p;
  if (!mblNo && !hblNo && !cargMtNo) {
    return "MBL 번호, HBL 번호, 화물관리번호 중 하나는 입력해야 합니다.";
  }
  if ((mblNo || hblNo) && !blYy) {
    return "MBL/HBL 조회 시 BL 년도(blYy, 4자리)는 필수입니다.";
  }
  if (blYy && !/^\d{4}$/.test(blYy)) {
    return "BL 년도는 4자리 숫자여야 합니다 (예: 2026).";
  }
  return null;
}

/**
 * API001 화물통관 진행정보 조회.
 * UNIPASS_API_KEY 환경변수 필수.
 */
export async function fetchCargProgress(
  p: CargProgressParams,
): Promise<CargProgressResult> {
  const apiKey = process.env.UNIPASS_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "UNIPASS_API_KEY 환경변수가 설정되지 않았습니다." };
  }

  const err = validateCargProgressParams(p);
  if (err) return { ok: false, error: err };

  const qs = new URLSearchParams({ crkyCn: apiKey });
  if (p.cargMtNo) qs.set("cargMtNo", p.cargMtNo.trim());
  if (p.mblNo) qs.set("mblNo", p.mblNo.trim());
  if (p.hblNo) qs.set("hblNo", p.hblNo.trim());
  if (p.blYy) qs.set("blYy", p.blYy.trim());

  let xml: string;
  try {
    const resp = await fetch(`${UNIPASS_CARG_URL}?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/xml, text/xml, */*" },
      cache: "no-store",
    });
    xml = await resp.text();
    if (!resp.ok) {
      return {
        ok: false,
        error: `UNI-PASS API 호출 실패 (status ${resp.status})`,
        status: resp.status,
        raw: xml.slice(0, 1000),
      };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "UNI-PASS 네트워크 오류" };
  }

  // 최상위 래핑: <cargCsclPrgsInfoQryRtnVo>
  const root = extractBlocks(xml, "cargCsclPrgsInfoQryRtnVo")[0] ?? xml;

  // 안내/오류 메시지
  const ntceInfo = extractBlocks(root, "ntceInfo")[0]?.trim() ?? "";
  const isError =
    !!ntceInfo && !ntceInfo.startsWith("[N00]") && /\[(E|W|N)\d{2}\]/.test(ntceInfo);

  const header = extractBlocks(root, "cargCsclPrgsInfoQryVo")[0]
    ? parseFlat(extractBlocks(root, "cargCsclPrgsInfoQryVo")[0])
    : null;
  const details = extractBlocks(root, "cargCsclPrgsInfoDtlQryVo").map(parseFlat);
  const list = extractBlocks(root, "cargCsclPrgsInfoLstQryVo").map(parseFlat);

  const stripped = root
    .replace(/<cargCsclPrgsInfoQryVo>[\s\S]*?<\/cargCsclPrgsInfoQryVo>/g, "")
    .replace(/<cargCsclPrgsInfoDtlQryVo>[\s\S]*?<\/cargCsclPrgsInfoDtlQryVo>/g, "")
    .replace(/<cargCsclPrgsInfoLstQryVo>[\s\S]*?<\/cargCsclPrgsInfoLstQryVo>/g, "");
  const meta = parseFlat(stripped);

  const data: CargProgressData = {
    ntceInfo,
    tCnt: meta.tCnt ? Number(meta.tCnt) : null,
    header,
    details,
    list,
  };

  if (isError) {
    return { ok: false, error: `UNI-PASS 응답 오류: ${ntceInfo}`, data };
  }
  return { ok: true, data };
}

/**
 * 상태 변화 감지용: watch row의 캐시 상태와 새 응답을 비교.
 * 반출입 이력 건수, 진행상태, 통관상태, 입항일자 중 하나라도 다르면 changed=true.
 */
export function diffProgress(
  prev: {
    last_prgs_stts?: string | null;
    last_cscl_prgs_stts?: string | null;
    last_etpr_dt?: string | null;
    last_detail_count?: number | null;
  },
  next: CargProgressData,
): { changed: boolean; summary: string; snapshot: {
    prgs_stts: string | null;
    cscl_prgs_stts: string | null;
    etpr_dt: string | null;
    detail_count: number;
  } } {
  const snapshot = {
    prgs_stts: next.header?.prgsStts ?? null,
    cscl_prgs_stts: next.header?.csclPrgsStts ?? null,
    etpr_dt: next.header?.etprDt ?? null,
    detail_count: next.details.length,
  };
  const changes: string[] = [];
  if ((prev.last_prgs_stts ?? null) !== snapshot.prgs_stts) {
    changes.push(`진행상태: ${prev.last_prgs_stts || "-"} → ${snapshot.prgs_stts || "-"}`);
  }
  if ((prev.last_cscl_prgs_stts ?? null) !== snapshot.cscl_prgs_stts) {
    changes.push(`통관상태: ${prev.last_cscl_prgs_stts || "-"} → ${snapshot.cscl_prgs_stts || "-"}`);
  }
  if ((prev.last_etpr_dt ?? null) !== snapshot.etpr_dt) {
    changes.push(`입항일자: ${prev.last_etpr_dt || "-"} → ${snapshot.etpr_dt || "-"}`);
  }
  if ((prev.last_detail_count ?? 0) !== snapshot.detail_count) {
    changes.push(`반출입이력: ${prev.last_detail_count ?? 0}건 → ${snapshot.detail_count}건`);
  }
  return {
    changed: changes.length > 0,
    summary: changes.join(", "),
    snapshot,
  };
}
