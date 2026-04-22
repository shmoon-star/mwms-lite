"use client";

import { useState } from "react";

type HeaderInfo = Record<string, string>;
type Detail = Record<string, string>;

type ApiResponse = {
  ok: boolean;
  error?: string;
  data?: {
    ntceInfo?: string;
    tCnt?: number | null;
    header?: HeaderInfo | null;
    details?: Detail[];
    list?: Detail[];
  };
};

// 응답 필드 한글 매핑 (주요 항목)
const HEADER_LABELS: Record<string, string> = {
  cargMtNo: "화물관리번호",
  prgsStts: "진행상태",
  prgsStCd: "진행상태코드",
  csclPrgsStts: "통관진행상태",
  mblNo: "MBL 번호",
  hblNo: "HBL 번호",
  blPtNm: "B/L 유형",
  shipNm: "선박명",
  shipNat: "선박국적",
  shipNatNm: "선박국적명",
  shcoFlcoSgn: "선사항공사부호",
  shcoFlco: "선사항공사",
  cargTp: "화물구분",
  ldprCd: "적재항코드",
  ldprNm: "적재항명",
  lodCntyCd: "적출국가코드",
  dsprCd: "양륙항코드",
  dsprNm: "양륙항명",
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
  frwrEntsConm: "포워더명",
  entsKoreNm: "업체명",
  vydf: "항차",
  spcnCargCd: "특수화물코드",
  mtTrgtCargYnNm: "관리대상화물여부",
  rlseDtyPridPassTpcd: "반출의무과태료여부",
  dclrDelyAdtxYn: "신고지연가산세여부",
};

const DETAIL_LABELS: Record<string, string> = {
  rlbrDttm: "반출입일시",
  cargTrcnRelaBsopTpcd: "처리구분",
  rlbrCn: "반출입내용",
  shedSgn: "장치장부호",
  shedNm: "장치장명",
  prcsDttm: "처리일시",
  dclrNo: "신고번호",
  rlbrBssNo: "반출입근거번호",
  pckGcnt: "포장개수",
  pckUt: "포장단위",
  wght: "중량",
  wghtUt: "중량단위",
  bfhnGdncCn: "사전안내내용",
};

function fmtDt(s?: string) {
  if (!s) return "-";
  // YYYYMMDD or YYYYMMDDHHmmss
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{14}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
  }
  return s;
}

export default function CustomsTrackingPage() {
  const [mblNo, setMblNo] = useState("");
  const [hblNo, setHblNo] = useState("");
  const [blYy, setBlYy] = useState(String(new Date().getFullYear()));
  const [cargMtNo, setCargMtNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const qs = new URLSearchParams();
      if (mblNo.trim()) qs.set("mblNo", mblNo.trim());
      if (hblNo.trim()) qs.set("hblNo", hblNo.trim());
      if (blYy.trim()) qs.set("blYy", blYy.trim());
      if (cargMtNo.trim()) qs.set("cargMtNo", cargMtNo.trim());
      const resp = await fetch(`/api/customs/import-progress?${qs.toString()}`);
      const json = (await resp.json()) as ApiResponse;
      setResult(json);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }

  const header = result?.data?.header;
  const details = result?.data?.details || [];
  const list = result?.data?.list || [];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        수입 통관 진행정보 조회
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        관세청 UNI-PASS OpenAPI (화물통관 진행정보 · API001) — 수입 화물의 실시간
        통관/반출입 상태를 조회합니다.
      </p>

      {/* 입력 폼 */}
      <form
        onSubmit={handleSearch}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 16,
          background: "#fff",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              MBL 번호 (Master BL)
            </label>
            <input
              type="text"
              value={mblNo}
              onChange={(e) => setMblNo(e.target.value)}
              placeholder="예: DIM050145865"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              HBL 번호 (House BL)
            </label>
            <input
              type="text"
              value={hblNo}
              onChange={(e) => setHblNo(e.target.value)}
              placeholder="예: 605118340404"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              BL 년도 *
            </label>
            <input
              type="text"
              value={blYy}
              onChange={(e) => setBlYy(e.target.value)}
              placeholder="YYYY"
              maxLength={4}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              화물관리번호 (선택, 다건 결과 클릭 시 자동 채움)
            </label>
            <input
              type="text"
              value={cargMtNo}
              onChange={(e) => setCargMtNo(e.target.value)}
              placeholder="cargMtNo (15~19자리)"
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "8px 20px",
              background: loading ? "#9ca3af" : "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              height: 38,
            }}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 10 }}>
          * MBL · HBL · 화물관리번호 중 하나 이상 입력. MBL/HBL 조회 시 BL 년도 필수.
        </p>
      </form>

      {/* 결과 */}
      {result && !result.ok && (
        <div style={errorBox}>
          <strong>조회 실패:</strong> {result.error}
        </div>
      )}

      {result?.ok && list.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>
            다건 결과 ({list.length}건) — 화물관리번호 클릭 시 상세 조회
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>화물관리번호</th>
                <th style={thStyle}>MBL</th>
                <th style={thStyle}>HBL</th>
                <th style={thStyle}>입항일자</th>
                <th style={thStyle}>양륙항</th>
                <th style={thStyle}>선사/항공사</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <button
                      onClick={() => {
                        setCargMtNo(r.cargMtNo || "");
                        setMblNo("");
                        setHblNo("");
                        setTimeout(() => handleSearch(), 0);
                      }}
                      style={linkBtnStyle}
                    >
                      {r.cargMtNo}
                    </button>
                  </td>
                  <td style={tdStyle}>{r.mblNo || "-"}</td>
                  <td style={tdStyle}>{r.hblNo || "-"}</td>
                  <td style={tdStyle}>{fmtDt(r.etprDt)}</td>
                  <td style={tdStyle}>{r.dsprNm || "-"}</td>
                  <td style={tdStyle}>{r.shcoFlco || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.ok && header && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>화물 상세 정보</h2>
          <div style={headerGrid}>
            {Object.entries(HEADER_LABELS).map(([key, label]) => {
              const val = header[key];
              if (!val) return null;
              const displayVal = key.endsWith("Dt") || key.endsWith("Dttm") ? fmtDt(val) : val;
              return (
                <div key={key} style={headerRow}>
                  <div style={headerKey}>{label}</div>
                  <div style={headerVal}>{displayVal}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result?.ok && details.length > 0 && (
        <div>
          <h2 style={sectionTitle}>반출입 이력 ({details.length}건)</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>처리일시</th>
                <th style={thStyle}>처리구분</th>
                <th style={thStyle}>반출입내용</th>
                <th style={thStyle}>장치장</th>
                <th style={thStyle}>신고번호</th>
                <th style={thStyle}>중량</th>
                <th style={thStyle}>포장</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{fmtDt(d.rlbrDttm || d.prcsDttm)}</td>
                  <td style={tdStyle}>{d.cargTrcnRelaBsopTpcd || "-"}</td>
                  <td style={tdStyle}>{d.rlbrCn || "-"}</td>
                  <td style={tdStyle}>{d.shedNm || "-"}</td>
                  <td style={tdStyle}>{d.dclrNo || "-"}</td>
                  <td style={tdStyle}>
                    {d.wght ? `${d.wght} ${d.wghtUt || ""}`.trim() : "-"}
                  </td>
                  <td style={tdStyle}>
                    {d.pckGcnt ? `${d.pckGcnt} ${d.pckUt || ""}`.trim() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.ok && !header && list.length === 0 && (
        <div style={{ ...errorBox, background: "#f3f4f6", color: "#6b7280", borderColor: "#e5e7eb" }}>
          조회 결과가 없습니다.
          {result.data?.ntceInfo && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              안내: {result.data.ntceInfo}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  marginTop: 4,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
  marginBottom: 8,
  paddingBottom: 4,
  borderBottom: "2px solid #111827",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f3f4f6",
  color: "#111827",
};

const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #fca5a5",
  borderRadius: 6,
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 13,
};

const headerGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  overflow: "hidden",
};

const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  borderBottom: "1px solid #f3f4f6",
};

const headerKey: React.CSSProperties = {
  padding: "8px 12px",
  background: "#f9fafb",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  borderRight: "1px solid #f3f4f6",
};

const headerVal: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#111827",
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#2563eb",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
  padding: 0,
};
