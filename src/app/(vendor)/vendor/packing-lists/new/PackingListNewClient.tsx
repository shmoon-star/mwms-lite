"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type PoOption = {
  id: string;
  po_no: string;
  eta?: string | null;
  status?: string | null;
  total_qty?: number | null;
  sku_count?: number | null;
  created_at?: string | null;
};

type PreviewRow = {
  row_no?: number;
  po_no?: string | null;
  sku?: string | null;
  qty?: number | null;
  asn_no?: string | null;
  [key: string]: any;
};

type PoOptionsResponse = {
  ok?: boolean;
  items?: PoOption[];
  error?: string;
};

type PreviewResponse = {
  ok?: boolean;
  items?: PreviewRow[];
  rows?: PreviewRow[];
  preview?: PreviewRow[];
  total?: number;
  error?: string;
};

type UploadResponse = {
  ok?: boolean;
  id?: string;
  packing_list_id?: string;
  packing_list_no?: string | null;
  item?: { id?: string };
  data?: { id?: string };
  header?: { id?: string };
  error?: string;
};

function pickPreviewRows(json: PreviewResponse): PreviewRow[] {
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.rows)) return json.rows;
  if (Array.isArray(json.preview)) return json.preview;
  return [];
}

export default function PackingListNewClient({ initialPoNo = "" }: { initialPoNo?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [poOptions, setPoOptions] = useState<PoOption[]>([]);
  const [selectedPoNo, setSelectedPoNo] = useState(initialPoNo);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const [loadingPo, setLoadingPo] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedPo = useMemo(() => {
    return poOptions.find((row) => row.po_no === selectedPoNo) ?? null;
  }, [poOptions, selectedPoNo]);

  const totalQty = useMemo(() => {
    return previewRows.reduce((acc, row) => acc + Number(row.qty || 0), 0);
  }, [previewRows]);

  const detectedColumns = useMemo(() => {
    const keys = new Set<string>();

    for (const row of previewRows) {
      Object.keys(row || {}).forEach((k) => keys.add(k));
    }

    const preferred = ["row_no", "po_no", "sku", "qty", "asn_no"];
    const rest = Array.from(keys)
      .filter((k) => !preferred.includes(k))
      .sort();

    return [...preferred.filter((k) => keys.has(k)), ...rest];
  }, [previewRows]);

  async function loadPoOptions() {
    try {
      setLoadingPo(true);
      setError("");

      const res = await fetch("/api/vendor/po-options", {
        cache: "no-store",
      });

      const text = await res.text();

      let json: PoOptionsResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load PO options");
      }

      const items = json.items ?? [];
      setPoOptions(items);

      // initialPoNo가 목록에 있으면 그걸 우선 선택, 없으면 첫 번째 항목
      if (!selectedPoNo && items.length > 0) {
        const found = initialPoNo ? items.find((p) => p.po_no === initialPoNo) : null;
        setSelectedPoNo(found ? found.po_no : items[0].po_no);
      }
    } catch (e: any) {
      setPoOptions([]);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoadingPo(false);
    }
  }

  useEffect(() => {
    loadPoOptions();
  }, []);

  async function handlePreview() {
    try {
      setLoadingPreview(true);
      setError("");
      setMessage("");
      setPreviewRows([]);
      setPreviewLoaded(false);

      if (!selectedPoNo) {
        throw new Error("PO selection is required");
      }

      if (!file) {
        throw new Error("업로드할 파일을 선택해 주세요.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("po_no", selectedPoNo);

      const res = await fetch("/api/vendor/packing-lists/preview-csv", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let json: PreviewResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Preview failed");
      }

      const rows = pickPreviewRows(json);
      setPreviewRows(rows);
      setPreviewLoaded(true);
      setMessage(`Preview loaded: ${rows.length} rows`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleUpload() {
    try {
      setUploading(true);
      setError("");
      setMessage("");

      if (!selectedPoNo) {
        throw new Error("PO selection is required");
      }

      if (!file) {
        throw new Error("업로드할 파일을 선택해 주세요.");
      }

      if (!previewLoaded) {
        throw new Error("먼저 Preview를 확인해 주세요.");
      }

      if (previewRows.length === 0) {
        throw new Error("업로드할 유효한 행이 없습니다.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("po_no", selectedPoNo);

      const res = await fetch("/api/vendor/packing-lists/upload-csv", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let json: UploadResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Upload failed");
      }

      const packingListId =
        json?.id ||
        json?.packing_list_id ||
        json?.item?.id ||
        json?.data?.id ||
        json?.header?.id ||
        null;

      if (!packingListId) {
        console.error("upload-csv response:", json);
        throw new Error("Packing List ID not returned");
      }

      setMessage("Draft created successfully");
      window.location.href = `/vendor/packing-lists/${packingListId}`;
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 8, fontSize: 14, color: "#666" }}>
        <Link href="/vendor/packing-lists">Vendor / Packing Lists</Link>
        <span> / </span>
        <span>New</span>
      </div>

      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Create Packing List
      </div>
      <div style={{ color: "#666", marginBottom: 16 }}>
        WMS에서 생성된 PO를 선택한 뒤 CSV 업로드 → Preview → Draft 생성
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
          }}
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "#ecfeff",
            color: "#155e75",
            border: "1px solid #a5f3fc",
          }}
        >
          {message}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Step 1. Select PO</div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <select
            value={selectedPoNo}
            onChange={(e) => {
              setSelectedPoNo(e.target.value);
              setPreviewRows([]);
              setPreviewLoaded(false);
              setError("");
              setMessage("");
            }}
            disabled={loadingPo}
            style={{
              minWidth: 360,
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          >
            <option value="">
              {loadingPo ? "Loading PO..." : "Select PO"}
            </option>
            {poOptions.map((po) => (
              <option key={po.id} value={po.po_no}>
                {po.po_no} [{po.status ?? "-"}]
              </option>
            ))}
          </select>

          <button onClick={loadPoOptions} disabled={loadingPo}>
            {loadingPo ? "Loading..." : "Reload PO"}
          </button>
        </div>

        {selectedPo ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <SummaryCard title="PO No" value={selectedPo.po_no} />
            <SummaryCard title="Status" value={selectedPo.status ?? "-"} />
            <SummaryCard title="ETA" value={selectedPo.eta ?? "-"} />
            <SummaryCard title="Ordered Qty" value={selectedPo.total_qty ?? 0} />
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#666" }}>
            {loadingPo
              ? "PO 목록을 불러오는 중입니다."
              : "선택 가능한 PO가 없습니다. vendor_id / status / po-options API를 확인해 주세요."}
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Step 2. Upload File</div>

        {/* 숨겨진 파일 input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = e.target.files?.[0] || null;
            setFile(picked);
            setPreviewRows([]);
            setPreviewLoaded(false);
            setError("");
            setMessage("");
          }}
        />

        {/* 파일 선택 행 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={fileSelectBtn}
          >
            📎 파일 선택
          </button>
          <span style={{
            fontSize: 13,
            color: file ? "#111827" : "#9ca3af",
            fontStyle: file ? "normal" : "italic",
          }}>
            {file ? file.name : "선택된 파일 없음"}
          </span>
        </div>

        {/* 액션 버튼 행 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handlePreview}
            disabled={loadingPreview || !file || !selectedPoNo}
            style={{
              ...actionBtn,
              background: "#fff",
              color: "#374151",
              border: "1px solid #d1d5db",
              opacity: loadingPreview || !file || !selectedPoNo ? 0.4 : 1,
              cursor: loadingPreview || !file || !selectedPoNo ? "not-allowed" : "pointer",
            }}
          >
            {loadingPreview ? "⏳ 미리보기 중..." : "🔍 Preview CSV"}
          </button>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file || !selectedPoNo || !previewLoaded || previewRows.length === 0}
            style={{
              ...actionBtn,
              background: "#111",
              color: "#fff",
              border: "none",
              opacity: uploading || !file || !selectedPoNo || !previewLoaded || previewRows.length === 0 ? 0.4 : 1,
              cursor: uploading || !file || !selectedPoNo || !previewLoaded || previewRows.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "⏳ 생성 중..." : "✅ Create Draft"}
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: "#999" }}>
          선택한 PO 기준으로 CSV를 검증하고 Draft를 생성한다.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <SummaryCard title="Preview Rows" value={previewRows.length} />
        <SummaryCard title="Total Qty" value={totalQty} />
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #ddd",
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700 }}>Preview</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            선택한 PO 기준으로 preview-csv 결과를 보여준다.
          </div>
        </div>

        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {detectedColumns.length === 0 ? (
                <th style={th}>No Columns</th>
              ) : (
                detectedColumns.map((col) => (
                  <th key={col} style={th}>
                    {col}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {previewRows.length === 0 ? (
              <tr>
                <td style={td} colSpan={Math.max(detectedColumns.length, 1)}>
                  No preview data
                </td>
              </tr>
            ) : (
              previewRows.map((row, idx) => (
                <tr key={idx}>
                  {detectedColumns.map((col) => (
                    <td key={col} style={td}>
                      {row[col] == null ? "-" : String(row[col])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const fileSelectBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 16px",
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

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 18px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
};

const th: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  textAlign: "left",
  background: "#f9fafb",
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 12,
};