"use client";

import { useEffect, useRef, useState } from "react";

type Buyer = {
  id: string;
  buyer_code: string;
  buyer_name: string | null;
  buyer_name_en: string | null;
  country: string | null;
};

type UploadCardProps = {
  title: string;
  hint: string;
  templateHref: string;
  templateLabel: string;
  uploadAction: string;
  uploadLabel: string;
  step: number;
  /** extra formData fields to append */
  extraFields?: Record<string, string>;
};

type UploadResult = {
  type: "success" | "error";
  message: string;
};

function UploadCard({
  title,
  hint,
  templateHref,
  templateLabel,
  uploadAction,
  uploadLabel,
  step,
  extraFields,
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  function handleSelectClick() {
    inputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? "");
    setResult(null);
  }

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Append any extra fields (e.g. buyer_id)
      if (extraFields) {
        for (const [key, value] of Object.entries(extraFields)) {
          if (value) formData.append(key, value);
        }
      }

      const res = await fetch(uploadAction, {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setResult({
          type: "error",
          message: `실패: ${json?.error ?? res.statusText}`,
        });
      } else {
        const inserted = json?.inserted_count ?? 0;
        const updated = json?.updated_count ?? 0;
        const errors = json?.error_count ?? 0;
        setResult({
          type: "success",
          message: `완료 — 신규 ${inserted}건, 업데이트 ${updated}건${errors > 0 ? `, 오류 ${errors}건` : ""}`,
        });
        setFileName("");
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (err: unknown) {
      setResult({
        type: "error",
        message: `오류: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setUploading(false);
    }
  }

  const hasFile = fileName.length > 0;

  return (
    <div style={card}>
      {/* 스텝 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={stepBadge}>{step}</span>
        <div>
          <div style={cardTitle}>{title}</div>
          <div style={hintStyle}>{hint}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 14 }} />

      {/* 템플릿 다운로드 */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>템플릿</div>
        <a href={templateHref} download style={downloadBtn}>
          <span>⬇</span>
          {templateLabel}
        </a>
      </div>

      {/* 파일 업로드 */}
      <div>
        <div style={sectionLabel}>업로드</div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <div style={fileRow}>
          <button type="button" onClick={handleSelectClick} style={fileSelectBtn}>
            📎 파일 선택
          </button>
          <span style={{
            ...fileNameText,
            color: hasFile ? "#111827" : "#9ca3af",
            fontStyle: hasFile ? "normal" : "italic",
          }}>
            {hasFile ? fileName : "선택된 파일 없음"}
          </span>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!hasFile || uploading}
          style={{
            ...uploadBtn,
            opacity: !hasFile || uploading ? 0.4 : 1,
            cursor: !hasFile || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "업로드 중..." : uploadLabel}
        </button>

        {result && (
          <div style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            background: result.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: result.type === "success" ? "#166534" : "#991b1b",
            border: `1px solid ${result.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {result.type === "success" ? "✅ " : "❌ "}{result.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function POUploadPanel() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [buyerId, setBuyerId] = useState<string>("");
  const [buyersLoading, setBuyersLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buyers")
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setBuyers(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setBuyersLoading(false));
  }, []);

  return (
    <div style={panelWrap}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#111" }}>
        PO 업로드
      </div>

      {/* Buyer 선택 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Buyer (선택)
        </div>
        <select
          value={buyerId}
          onChange={(e) => setBuyerId(e.target.value)}
          disabled={buyersLoading}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 13,
            background: "#fff",
            color: "#111827",
            minWidth: 240,
          }}
        >
          <option value="">— Buyer 선택 (없으면 CSV의 buyer_code 컬럼 사용) —</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.buyer_code}{b.buyer_name ? ` · ${b.buyer_name}` : ""}{b.country ? ` (${b.country})` : ""}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          * CSV에 buyer_code 컬럼이 있으면 행별로 자동 매핑됩니다. 드롭다운 선택 시 전체 행에 적용됩니다.
        </div>
      </div>

      <div style={grid}>
        <UploadCard
          step={1}
          title="PO Header CSV"
          hint="Header를 먼저 업로드하세요"
          templateHref="/api/po/template-header"
          templateLabel="Header 템플릿 다운로드"
          uploadAction="/api/po/upload-header"
          uploadLabel="Header 업로드"
          extraFields={buyerId ? { buyer_id: buyerId } : undefined}
        />
        <UploadCard
          step={2}
          title="PO Line CSV"
          hint="Header 완료 후 Line을 업로드하세요"
          templateHref="/api/po/template-lines"
          templateLabel="Line 템플릿 다운로드"
          uploadAction="/api/po/lines/upload"
          uploadLabel="Line 업로드"
        />
      </div>

      <div style={flowHint}>
        순서 &nbsp;①&nbsp; Buyer 선택 (선택사항) &nbsp;→&nbsp; ②&nbsp; Header CSV 업로드 &nbsp;→&nbsp; ③&nbsp; Line CSV 업로드 &nbsp;→&nbsp; PO 상세 확인
      </div>
    </div>
  );
}

/* ── styles ── */

const panelWrap: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 20,
  marginBottom: 24,
  background: "#fafafa",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 14,
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};

const stepBadge: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111",
  lineHeight: 1.3,
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  marginTop: 2,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#888",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const downloadBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#374151",
  fontSize: 13,
  fontWeight: 500,
  textDecoration: "none",
  cursor: "pointer",
};

const fileRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const fileSelectBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  border: "1.5px solid #6b7280",
  borderRadius: 6,
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const fileNameText: React.CSSProperties = {
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 200,
};

const uploadBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 18px",
  border: "none",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  width: "100%",
};

const flowHint: React.CSSProperties = {
  fontSize: 12,
  color: "#9ca3af",
  background: "#f3f4f6",
  borderRadius: 6,
  padding: "8px 12px",
};
