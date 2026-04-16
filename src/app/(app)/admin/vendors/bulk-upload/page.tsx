"use client";

import { useState } from "react";
import Link from "next/link";

type RowStatus = "valid" | "conflict" | "invalid" | "duplicate";

type PreviewRow = {
  row_no: number;
  vendor_code: string | null;
  vendor_name: string | null;
  status: RowStatus;
  reason?: string;
};

type PreviewSummary = {
  total: number;
  valid: number;
  conflict: number;
  invalid: number;
  duplicate: number;
};

type ApplyResult = {
  inserted: number;
  skipped: number;
  errors: { vendor_code: string | null; reason: string }[];
};

function statusStyle(s: RowStatus): { bg: string; color: string; label: string } {
  switch (s) {
    case "valid":
      return { bg: "#dcfce7", color: "#166534", label: "Valid" };
    case "conflict":
      return { bg: "#fef3c7", color: "#92400e", label: "Conflict" };
    case "invalid":
      return { bg: "#fee2e2", color: "#991b1b", label: "Invalid" };
    case "duplicate":
      return { bg: "#fef3c7", color: "#92400e", label: "Duplicate" };
  }
}

export default function BulkVendorUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!file) {
      setError("파일을 선택하세요.");
      return;
    }
    setError(null);
    setRows(null);
    setSummary(null);
    setApplyResult(null);
    setPreviewing(true);

    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/vendors/bulk/preview", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setRows(json.rows || []);
      setSummary(json.summary || null);
    } catch (e: any) {
      setError(e?.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!rows || !summary) return;
    const validRows = rows
      .filter((r) => r.status === "valid")
      .map((r) => ({ vendor_code: r.vendor_code, vendor_name: r.vendor_name }));

    if (validRows.length === 0) {
      setError("등록 가능한 행이 없습니다.");
      return;
    }
    if (!confirm(`${validRows.length}개 벤더를 등록할까요?`)) return;

    setError(null);
    setApplying(true);
    try {
      const res = await fetch("/api/admin/vendors/bulk/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setApplyResult({
        inserted: json.inserted ?? 0,
        skipped: json.skipped ?? 0,
        errors: json.errors ?? [],
      });
    } catch (e: any) {
      setError(e?.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  function reset() {
    setFile(null);
    setRows(null);
    setSummary(null);
    setApplyResult(null);
    setError(null);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">벤더 일괄 등록</h1>
          <p className="text-sm text-gray-500 mt-1">
            Excel(.xlsx) 파일에서 여러 벤더 마스터를 한 번에 등록합니다. 유저 계정 생성은 포함되지
            않습니다.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            파일 형식: Row 1 헤더(<code>vendor_code</code>, <code>vendor_name</code>), Row 2부터
            데이터
          </p>
        </div>
        <Link
          href="/admin/users"
          className="text-sm rounded border px-3 py-1.5 hover:bg-gray-50"
        >
          ← User Management
        </Link>
      </div>

      {/* 파일 선택 */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={!file || previewing}
            className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {previewing ? "Previewing..." : "Preview"}
          </button>
          {(file || rows) && (
            <button
              type="button"
              onClick={reset}
              className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          )}
        </div>

        {error && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-500">총</div>
            <div className="text-xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-lg border p-3 bg-green-50">
            <div className="text-xs text-gray-600">등록 가능 (Valid)</div>
            <div className="text-xl font-semibold text-green-700">{summary.valid}</div>
          </div>
          <div className="rounded-lg border p-3 bg-amber-50">
            <div className="text-xs text-gray-600">이미 존재 (Conflict)</div>
            <div className="text-xl font-semibold text-amber-700">{summary.conflict}</div>
          </div>
          <div className="rounded-lg border p-3 bg-amber-50">
            <div className="text-xs text-gray-600">파일 내 중복 (Duplicate)</div>
            <div className="text-xl font-semibold text-amber-700">{summary.duplicate}</div>
          </div>
          <div className="rounded-lg border p-3 bg-red-50">
            <div className="text-xs text-gray-600">유효하지 않음 (Invalid)</div>
            <div className="text-xl font-semibold text-red-700">{summary.invalid}</div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {rows && rows.length > 0 && !applyResult && (
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="text-sm font-semibold">Preview ({rows.length}건)</div>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !summary || summary.valid === 0}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-40"
            >
              {applying ? "Applying..." : `Apply (${summary?.valid ?? 0} 등록)`}
            </button>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-16">Row</th>
                  <th className="px-3 py-2 text-left">Vendor Code</th>
                  <th className="px-3 py-2 text-left">Vendor Name</th>
                  <th className="px-3 py-2 text-left w-28">Status</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = statusStyle(r.status);
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-gray-500 font-mono">{r.row_no}</td>
                      <td className="px-3 py-1.5 font-mono">{r.vendor_code ?? "-"}</td>
                      <td className="px-3 py-1.5">{r.vendor_name ?? "-"}</td>
                      <td className="px-3 py-1.5">
                        <span
                          style={{
                            background: st.bg,
                            color: st.color,
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-500">{r.reason ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apply Result */}
      {applyResult && (
        <div className="rounded-xl border-2 border-green-400 bg-green-50 p-5 space-y-3">
          <div className="text-lg font-bold text-green-700">
            ✅ 등록 완료
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">등록된 벤더: </span>
              <span className="font-semibold text-green-700">{applyResult.inserted}</span>
            </div>
            {applyResult.skipped > 0 && (
              <div>
                <span className="text-gray-600">Skip (이미 존재): </span>
                <span className="font-semibold text-amber-700">{applyResult.skipped}</span>
              </div>
            )}
          </div>
          {applyResult.errors.length > 0 && (
            <div className="text-xs text-gray-600">
              <div className="font-semibold mb-1">세부 사유:</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {applyResult.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.vendor_code ?? "-"}</span>: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Link
              href="/admin/users"
              className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              User Management으로 이동
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
            >
              다른 파일 업로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
