"use client";

import { useEffect, useState } from "react";

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

type WatchRow = {
  id: string;
  mbl_no: string | null;
  hbl_no: string | null;
  bl_yy: string | null;
  carg_mt_no: string | null;
  memo: string | null;
  last_checked_at: string | null;
  last_prgs_stts: string | null;
  last_cscl_prgs_stts: string | null;
  last_etpr_dt: string | null;
  last_detail_count: number | null;
  last_error: string | null;
  cargo_info: Record<string, string> | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
};

type SnapshotRow = {
  id: string;
  checked_at: string;
  prgs_stts: string | null;
  cscl_prgs_stts: string | null;
  etpr_dt: string | null;
  detail_count: number | null;
  change_summary: string | null;
};

// 응답 필드 한글 매핑
const HEADER_LABELS: Record<string, string> = {
  cargMtNo: "화물관리번호",
  prgsStts: "진행상태",
  csclPrgsStts: "통관진행상태",
  mblNo: "MBL 번호",
  hblNo: "HBL 번호",
  blPtNm: "B/L 유형",
  shipNm: "선박명",
  shipNatNm: "선박국적",
  shcoFlco: "선사항공사",
  cargTp: "화물구분",
  ldprNm: "적재항",
  dsprNm: "양륙항",
  etprCstm: "입항세관",
  etprDt: "입항일자",
  ttwg: "총중량",
  wghtUt: "중량단위",
  pckGcnt: "포장개수",
  pckUt: "포장단위",
  prnm: "품명",
  cntrNo: "컨테이너번호",
  frwrEntsConm: "포워더",
  entsKoreNm: "업체명",
};

function fmtDt(s?: string | null) {
  if (!s) return "-";
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{14}$/.test(s))
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  return s;
}

function fmtTs(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { hour12: false });
}

export default function CustomsTrackingPage() {
  // ─── 즉시 조회 섹션 ───
  const [mblNo, setMblNo] = useState("");
  const [hblNo, setHblNo] = useState("");
  const [blYy, setBlYy] = useState(String(new Date().getFullYear()));
  const [cargMtNo, setCargMtNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  // ─── Watchlist 섹션 ───
  const [watchList, setWatchList] = useState<WatchRow[]>([]);
  const [wLoading, setWLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<SnapshotRow[]>([]);
  const [infoRow, setInfoRow] = useState<WatchRow | null>(null);

  // 벌크 업로드
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // 등록 폼
  const [nMbl, setNMbl] = useState("");
  const [nHbl, setNHbl] = useState("");
  const [nYy, setNYy] = useState(String(new Date().getFullYear()));
  const [nCargMt, setNCargMt] = useState("");
  const [nMemo, setNMemo] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);

  async function loadWatchList() {
    setWLoading(true);
    try {
      const r = await fetch("/api/customs/watch");
      const j = await r.json();
      if (j.ok) setWatchList(j.data);
    } finally {
      setWLoading(false);
    }
  }
  useEffect(() => {
    loadWatchList();
  }, []);

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
      setResult((await resp.json()) as ApiResponse);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message || "네트워크 오류" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddWatch(e?: React.FormEvent) {
    e?.preventDefault();
    setAddErr(null);
    try {
      const body = {
        mblNo: nMbl.trim() || undefined,
        hblNo: nHbl.trim() || undefined,
        blYy: nYy.trim() || undefined,
        cargMtNo: nCargMt.trim() || undefined,
        memo: nMemo.trim() || undefined,
      };
      const r = await fetch("/api/customs/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) {
        setAddErr(j.error || "등록 실패");
        return;
      }
      setNMbl("");
      setNHbl("");
      setNCargMt("");
      setNMemo("");
      await loadWatchList();
    } catch (err: any) {
      setAddErr(err?.message || "네트워크 오류");
    }
  }

  async function handleRefreshOne(id: string) {
    setRefreshingId(id);
    try {
      const r = await fetch(`/api/customs/watch/${id}/refresh`, { method: "POST" });
      await r.json();
      await loadWatchList();
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRefreshAll() {
    setBulkRefreshing(true);
    setBulkMsg(null);
    try {
      const r = await fetch("/api/customs/watch/refresh-all", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setBulkMsg(
          `전체 갱신 완료 · 총 ${j.data.total}건 (변화 ${j.data.updated} / 동일 ${j.data.unchanged} / 에러 ${j.data.errors.length})`,
        );
      } else {
        setBulkMsg(`실패: ${j.error}`);
      }
      await loadWatchList();
    } finally {
      setBulkRefreshing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 BL을 watchlist에서 삭제하시겠습니까? (스냅샷 이력도 함께 삭제)")) return;
    await fetch(`/api/customs/watch/${id}`, { method: "DELETE" });
    await loadWatchList();
  }

  async function handleToggleClose(row: WatchRow) {
    await fetch(`/api/customs/watch/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_closed: !row.is_closed }),
    });
    await loadWatchList();
  }

  async function openHistory(id: string) {
    setHistoryId(id);
    setHistoryRows([]);
    const r = await fetch(`/api/customs/watch/${id}/history`);
    const j = await r.json();
    if (j.ok) setHistoryRows(j.data);
  }

  async function handleBulkUpload() {
    if (!bulkFile) {
      setBulkResult("파일을 선택하세요.");
      return;
    }
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFile);
      const r = await fetch("/api/customs/watch/bulk", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok) {
        const d = j.data;
        setBulkResult(
          `업로드 완료 · 읽음 ${d.read} / 등록 ${d.inserted} / 중복 ${d.duplicates} / 스킵 ${d.skipped} / 에러 ${d.errors}`,
        );
        setBulkFile(null);
        const fileInput = document.getElementById("bulk-file-input") as HTMLInputElement | null;
        if (fileInput) fileInput.value = "";
        await loadWatchList();
      } else {
        setBulkResult(`실패: ${j.error}`);
      }
    } catch (err: any) {
      setBulkResult(err?.message || "업로드 오류");
    } finally {
      setBulkUploading(false);
    }
  }

  // 클라이언트에서 양식 CSV 생성 & 다운로드
  function downloadTemplate() {
    const csv =
      "\uFEFF" +
      "HBL,MBL,BL 년도,화물관리번호,메모\r\n" +
      "CAMSE2603015,,2026,,FW26 샘플 업로드\r\n" +
      "ELCKTAO26030077,WDFCPES26132212,2026,,티셔츠 컨테이너\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customs_watchlist_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllCsv() {
    window.location.href = "/api/customs/watch/export?includeClosed=true";
  }

  const header = result?.data?.header;
  const details = result?.data?.details || [];
  const list = result?.data?.list || [];

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>수입 통관 진행정보</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
        관세청 UNI-PASS OpenAPI (화물통관 진행정보 · API001). 회사명 기반 자동 수집은 OpenAPI에서
        지원되지 않으므로, 감시할 BL을 직접 등록 후 주기적으로 재조회합니다.
      </p>

      {/* ─────────────────────────────── 섹션 1: 즉시 조회 ─────────────────────────────── */}
      <h2 style={sectionTitle}>① 즉시 조회 (DB 저장 없음)</h2>
      <form onSubmit={handleSearch} style={formBox}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>MBL 번호 (Master BL)</label>
            <input value={mblNo} onChange={(e) => setMblNo(e.target.value)} placeholder="예: DIM050145865" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>HBL 번호 (House BL)</label>
            <input value={hblNo} onChange={(e) => setHblNo(e.target.value)} placeholder="예: 605118340404" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>BL 년도 *</label>
            <input value={blYy} onChange={(e) => setBlYy(e.target.value)} maxLength={4} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={labelStyle}>화물관리번호 (선택, 다건 클릭 시 자동 채움)</label>
            <input value={cargMtNo} onChange={(e) => setCargMtNo(e.target.value)} placeholder="cargMtNo (15~19자리)" style={inputStyle} />
          </div>
          <button type="submit" disabled={loading} style={primaryBtn(loading)}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
      </form>

      {result && !result.ok && (
        <div style={errorBox}>
          <strong>조회 실패:</strong> {result.error}
        </div>
      )}

      {result?.ok && list.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={subTitle}>다건 결과 ({list.length}건)</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>화물관리번호</th>
                <th style={thStyle}>MBL</th>
                <th style={thStyle}>HBL</th>
                <th style={thStyle}>입항일</th>
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
        <div style={{ marginBottom: 16 }}>
          <h3 style={subTitle}>화물 상세</h3>
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
        <div style={{ marginBottom: 24 }}>
          <h3 style={subTitle}>반출입 이력 ({details.length}건)</h3>
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
                  <td style={tdStyle}>{d.wght ? `${d.wght} ${d.wghtUt || ""}`.trim() : "-"}</td>
                  <td style={tdStyle}>{d.pckGcnt ? `${d.pckGcnt} ${d.pckUt || ""}`.trim() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─────────────────────────────── 섹션 2: Watchlist ─────────────────────────────── */}
      <div style={{ marginTop: 36 }}>
        <h2 style={sectionTitle}>② Watchlist (등록된 BL 주기적 감시 + 상태 변화 이력)</h2>

        {/* 등록 폼 */}
        <form onSubmit={handleAddWatch} style={formBox}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>MBL</label>
              <input value={nMbl} onChange={(e) => setNMbl(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>HBL</label>
              <input value={nHbl} onChange={(e) => setNHbl(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>BL 년도</label>
              <input value={nYy} onChange={(e) => setNYy(e.target.value)} maxLength={4} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>화물관리번호 (선택)</label>
              <input value={nCargMt} onChange={(e) => setNCargMt(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={labelStyle}>메모 (선택)</label>
              <input value={nMemo} onChange={(e) => setNMemo(e.target.value)} placeholder="예: FW26 KF001" style={inputStyle} />
            </div>
            <button type="submit" style={primaryBtn(false)}>등록</button>
            <button
              type="button"
              disabled={bulkRefreshing || watchList.length === 0}
              onClick={handleRefreshAll}
              style={secondaryBtn(bulkRefreshing || watchList.length === 0)}
            >
              {bulkRefreshing ? "전체 갱신 중..." : "전체 갱신"}
            </button>
          </div>
          {addErr && <div style={{ ...errorBox, marginTop: 10 }}>{addErr}</div>}
          {bulkMsg && <div style={infoBox}>{bulkMsg}</div>}
        </form>

        {/* 벌크 업로드 + 다운로드 */}
        <div style={{ ...formBox, background: "#fafafa" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
            벌크 작업
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label htmlFor="bulk-file-input" style={fileChooseBtn}>
              📁 파일 선택
              <input
                id="bulk-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setBulkFile(e.target.files?.[0] || null);
                  setBulkResult(null);
                }}
                style={{ display: "none" }}
              />
            </label>
            <span
              style={{
                fontSize: 12.5,
                color: bulkFile ? "#111827" : "#9ca3af",
                minWidth: 180,
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={bulkFile?.name}
            >
              {bulkFile ? bulkFile.name : "선택된 파일 없음"}
            </span>
            <button
              type="button"
              onClick={handleBulkUpload}
              disabled={bulkUploading}
              style={secondaryBtn(bulkUploading)}
            >
              {bulkUploading ? "업로드 중..." : "벌크 등록"}
            </button>
            <button type="button" onClick={downloadTemplate} style={{ ...miniBtn, height: 38, padding: "0 14px" }}>
              양식 다운로드
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={downloadAllCsv}
              disabled={watchList.length === 0}
              style={secondaryBtn(watchList.length === 0)}
            >
              전체 CSV 다운로드
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
            xlsx/csv 모두 가능. 컬럼: <strong>HBL</strong> / MBL / BL 년도 / 화물관리번호 / 메모 — 년도 미입력 시 {new Date().getFullYear()}년으로 자동 설정. HBL/MBL/화물관리번호 중 하나는 필수.
          </p>
          {bulkResult && <div style={{ ...infoBox, marginTop: 8 }}>{bulkResult}</div>}
        </div>

        {wLoading ? (
          <div style={{ padding: 20, color: "#6b7280", fontSize: 13 }}>목록 불러오는 중...</div>
        ) : watchList.length === 0 ? (
          <div style={{ padding: 20, color: "#6b7280", fontSize: 13 }}>등록된 BL이 없습니다.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>MBL / HBL / 년도</th>
                <th style={thStyle}>메모</th>
                <th style={thStyle}>진행상태</th>
                <th style={thStyle}>통관상태</th>
                <th style={thStyle}>입항일</th>
                <th style={thStyle}>이력수</th>
                <th style={thStyle}>마지막 조회</th>
                <th style={thStyle}>동작</th>
              </tr>
            </thead>
            <tbody>
              {watchList.map((w) => (
                <tr key={w.id} style={w.is_closed ? { opacity: 0.55 } : undefined}>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 12 }}>
                      {w.mbl_no && <div>MBL: <strong>{w.mbl_no}</strong></div>}
                      {w.hbl_no && <div>HBL: <strong>{w.hbl_no}</strong></div>}
                      {w.carg_mt_no && <div>CargMt: {w.carg_mt_no}</div>}
                      <div style={{ color: "#6b7280" }}>{w.bl_yy}</div>
                    </div>
                  </td>
                  <td style={tdStyle}>{w.memo || "-"}</td>
                  <td style={tdStyle}>
                    {w.last_error ? (
                      <span style={{ color: "#b91c1c", fontSize: 12 }}>ERR: {w.last_error.slice(0, 40)}</span>
                    ) : (
                      w.last_prgs_stts || "-"
                    )}
                  </td>
                  <td style={tdStyle}>{w.last_cscl_prgs_stts || "-"}</td>
                  <td style={tdStyle}>{fmtDt(w.last_etpr_dt)}</td>
                  <td style={tdStyle}>{w.last_detail_count ?? 0}</td>
                  <td style={tdStyle}>{fmtTs(w.last_checked_at)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleRefreshOne(w.id)}
                        disabled={refreshingId === w.id}
                        style={miniBtn}
                      >
                        {refreshingId === w.id ? "..." : "갱신"}
                      </button>
                      <button onClick={() => openHistory(w.id)} style={miniBtn}>이력</button>
                      <button
                        onClick={() => setInfoRow(w)}
                        style={miniBtn}
                        disabled={!w.cargo_info}
                        title={w.cargo_info ? "화물 상세 정보" : "아직 조회되지 않음"}
                      >
                        정보
                      </button>
                      <button onClick={() => handleToggleClose(w)} style={miniBtn}>
                        {w.is_closed ? "재개" : "종료"}
                      </button>
                      <button onClick={() => handleDelete(w.id)} style={{ ...miniBtn, color: "#b91c1c" }}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 화물 상세 정보 모달 (cargo_info) */}
      {infoRow && (
        <div style={modalBackdrop} onClick={() => setInfoRow(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                화물 상세 정보
                {infoRow.mbl_no && <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>MBL: {infoRow.mbl_no}</span>}
                {infoRow.hbl_no && <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>HBL: {infoRow.hbl_no}</span>}
              </h3>
              <button onClick={() => setInfoRow(null)} style={{ ...miniBtn, fontSize: 14 }}>닫기</button>
            </div>
            {!infoRow.cargo_info ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>아직 조회된 상세 정보가 없습니다. "갱신"을 먼저 실행하세요.</div>
            ) : (
              <div style={headerGrid}>
                {Object.entries(HEADER_LABELS).map(([key, label]) => {
                  const val = infoRow.cargo_info?.[key];
                  if (!val) return null;
                  const displayVal =
                    key.endsWith("Dt") || key.endsWith("Dttm") ? fmtDt(val) : val;
                  return (
                    <div key={key} style={headerRow}>
                      <div style={headerKey}>{label}</div>
                      <div style={headerVal}>{displayVal}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 히스토리 모달 */}
      {historyId && (
        <div style={modalBackdrop} onClick={() => setHistoryId(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>상태 변화 이력</h3>
              <button onClick={() => setHistoryId(null)} style={{ ...miniBtn, fontSize: 14 }}>닫기</button>
            </div>
            {historyRows.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>아직 기록된 스냅샷이 없습니다.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>시점</th>
                    <th style={thStyle}>진행상태</th>
                    <th style={thStyle}>통관상태</th>
                    <th style={thStyle}>입항일</th>
                    <th style={thStyle}>이력수</th>
                    <th style={thStyle}>변화</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.id}>
                      <td style={tdStyle}>{fmtTs(h.checked_at)}</td>
                      <td style={tdStyle}>{h.prgs_stts || "-"}</td>
                      <td style={tdStyle}>{h.cscl_prgs_stts || "-"}</td>
                      <td style={tdStyle}>{fmtDt(h.etpr_dt)}</td>
                      <td style={tdStyle}>{h.detail_count ?? 0}</td>
                      <td style={tdStyle}>{h.change_summary || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── styles ────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  marginTop: 4,
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151" };
const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: "2px solid #111827",
};
const subTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#111827", margin: "6px 0 6px" };
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
  marginBottom: 8,
};
const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  fontSize: 11.5,
  fontWeight: 700,
  color: "#374151",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f3f4f6",
  color: "#111827",
  verticalAlign: "top",
};
const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #fca5a5",
  borderRadius: 6,
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 13,
  marginBottom: 12,
};
const infoBox: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  background: "#eff6ff",
  color: "#1e40af",
  fontSize: 12.5,
  marginTop: 10,
};
const formBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  background: "#fff",
  marginBottom: 14,
};
const headerGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  overflow: "hidden",
};
const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr",
  borderBottom: "1px solid #f3f4f6",
};
const headerKey: React.CSSProperties = {
  padding: "7px 10px",
  background: "#f9fafb",
  fontSize: 11.5,
  fontWeight: 600,
  color: "#6b7280",
  borderRight: "1px solid #f3f4f6",
};
const headerVal: React.CSSProperties = { padding: "7px 10px", fontSize: 12.5, color: "#111827" };
const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#2563eb",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 12.5,
  padding: 0,
};
const miniBtn: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 11.5,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "8px 20px",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  height: 38,
});
const fileChooseBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 14px",
  height: 38,
  background: "#fff",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  userSelect: "none",
};
const secondaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  background: disabled ? "#e5e7eb" : "#fff",
  color: "#111827",
  border: "1px solid #111827",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  height: 38,
});
const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};
const modalBox: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 8,
  maxWidth: 900,
  width: "90%",
  maxHeight: "80vh",
  overflow: "auto",
};
