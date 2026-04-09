"use client";

import { useRef, useState } from "react";

type UploadCardProps = {
  title: string;
  hint: string;
  templateHref: string;
  templateLabel: string;
  uploadAction: string;
  uploadLabel: string;
  step: number;
};

function UploadCard({
  title,
  hint,
  templateHref,
  templateLabel,
  uploadAction,
  uploadLabel,
  step,
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? "");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(uploadAction, { method: "POST", body: formData });
      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        alert(`업로드 실패: ${json?.error ?? res.statusText}`);
      } else {
        alert("업로드가 완료되었습니다.");
        setFileName("");
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (err: unknown) {
      alert(`오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

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

      {/* 구분선 */}
      <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 12 }} />

      {/* 템플릿 다운로드 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          템플릿
        </div>
        <a href={templateHref} download style={downloadBtn}>
          <span style={{ fontSize: 15 }}>⬇</span>
          {templateLabel}
        </a>
      </div>

      {/* 파일 업로드 */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          업로드
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            required
            onChange={handleFileChange}
            style={{ display: "none" }}
            id={`file-input-${step}`}
          />

          {/* 파일 선택 영역 */}
          <div style={fileRow}>
            <label htmlFor={`file-input-${step}`} style={fileSelectBtn}>
              <span style={{ fontSize: 14 }}>📎</span>
              파일 선택
            </label>
            <span style={fileNameText}>
              {fileName || "선택된 파일 없음"}
            </span>
          </div>

          {/* 업로드 버튼 */}
          <button
            type="submit"
            disabled={!fileName || uploading}
            style={{
              ...uploadBtn,
              opacity: !fileName || uploading ? 0.45 : 1,
              cursor: !fileName || uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "업로드 중..." : uploadLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function POUploadPanel() {
  return (
    <div style={panelWrap}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#111" }}>
        PO 업로드
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
        순서 &nbsp;①&nbsp; Header CSV 업로드&nbsp; →&nbsp; ②&nbsp; Line CSV 업로드&nbsp; →&nbsp; PO 상세 확인
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
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#f9fafb",
  color: "#374151",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const fileNameText: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 200,
};

const uploadBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 18px",
  border: "none",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
  justifyContent: "center",
};

const flowHint: React.CSSProperties = {
  fontSize: 12,
  color: "#9ca3af",
  background: "#f3f4f6",
  borderRadius: 6,
  padding: "8px 12px",
};
