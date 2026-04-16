"use client";

import { useState } from "react";
import Link from "next/link";

type RowStatus = "valid" | "valid_new_vendor" | "conflict" | "invalid" | "duplicate";

type PreviewRow = {
  row_no: number;
  email: string | null;
  display_name: string | null;
  vendor_code: string | null;
  vendor_name: string | null; // from CSV
  vendor_name_resolved: string | null; // from DB (if exists)
  vendor_id: string | null;
  has_password: boolean;
  will_create_vendor: boolean;
  status: RowStatus;
  reason?: string;
};

type PreviewSummary = {
  total: number;
  valid: number;
  valid_new_vendor: number;
  conflict: number;
  invalid: number;
  duplicate: number;
};

type ApplyResult = {
  inserted: number;
  total_requested: number;
  created_vendors: number;
  errors: { email: string | null; reason: string }[];
  items: { email: string; vendor_code: string; user_id: string; vendor_created: boolean }[];
};

function statusStyle(s: RowStatus): { bg: string; color: string; label: string } {
  switch (s) {
    case "valid":
      return { bg: "#dcfce7", color: "#166534", label: "Valid" };
    case "valid_new_vendor":
      return { bg: "#dbeafe", color: "#1e40af", label: "Valid (+ Vendor)" };
    case "conflict":
      return { bg: "#fef3c7", color: "#92400e", label: "Conflict" };
    case "invalid":
      return { bg: "#fee2e2", color: "#991b1b", label: "Invalid" };
    case "duplicate":
      return { bg: "#fef3c7", color: "#92400e", label: "Duplicate" };
  }
}

const SAMPLE_CSV = `email,display_name,vendor_code,vendor_name,password
vnd011@example.com,홍길동,VND-011,1993 STUDIO,TempPass1!
vnd012@example.com,김철수,VND-012,AAKAM,TempPass2!
intern@example.com,이인턴,VND-011,,TempPass3!`;

function downloadTemplate() {
  const blob = new Blob(["\ufeff" + SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "user_bulk_upload_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkUserUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [rawPasswords, setRawPasswords] = useState<Record<number, string>>({});

  async function handlePreview() {
    if (!file) {
      setError("CSV 파일을 선택하세요.");
      return;
    }
    setError(null);
    setRows(null);
    setSummary(null);
    setApplyResult(null);
    setPreviewing(true);

    try {
      // Preview 시에 password를 클라이언트에도 row_no별로 저장
      // (서버 응답에는 password가 빠지기 때문에 Apply 때 다시 보내야 함)
      const text = await file.text();
      const lines = text
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((l) => l.trim() !== "");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
      const pwIdx = headers.indexOf("password");
      const passwords: Record<number, string> = {};
      if (pwIdx >= 0) {
        for (let i = 1; i < lines.length; i += 1) {
          const cells = lines[i].split(",");
          passwords[i + 1] = (cells[pwIdx] || "").trim();
        }
      }
      setRawPasswords(passwords);

      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/users/bulk/preview", {
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
    const applicable = rows.filter(
      (r) => r.status === "valid" || r.status === "valid_new_vendor"
    );
    const validRows = applicable.map((r) => ({
      email: r.email,
      display_name: r.display_name,
      vendor_code: r.vendor_code,
      vendor_name: r.vendor_name, // 신규 벤더 생성용
      vendor_id: r.vendor_id,
      password: rawPasswords[r.row_no] || "",
    }));

    if (validRows.length === 0) {
      setError("등록 가능한 유저가 없습니다.");
      return;
    }
    const newVendorCount = applicable.filter((r) => r.status === "valid_new_vendor").length;
    const msg =
      newVendorCount > 0
        ? `${validRows.length}명의 Vendor User 계정을 생성합니다.\n그 중 ${newVendorCount}개 행은 신규 벤더도 함께 생성됩니다.\n계속할까요?`
        : `${validRows.length}명의 Vendor User 계정을 생성합니다.\n계속할까요?`;
    if (!confirm(msg)) return;

    setError(null);
    setApplying(true);
    try {
      const res = await fetch("/api/admin/users/bulk/apply", {
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
        total_requested: json.total_requested ?? validRows.length,
        created_vendors: json.created_vendors ?? 0,
        errors: json.errors ?? [],
        items: json.items ?? [],
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
    setRawPasswords({});
  }

  const totalApplicable = summary ? summary.valid + summary.valid_new_vendor : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">벤더 + 유저 일괄 등록</h1>
          <p className="text-sm text-gray-500 mt-1">
            CSV 파일로 Vendor와 Vendor User를 한 번에 등록합니다. vendor_code가 DB에 없는 경우
            자동으로 벤더도 생성됩니다 (vendor_name 필수).
          </p>
          <p className="text-xs text-gray-400 mt-1">
            CSV 헤더: <code>email, display_name, vendor_code, vendor_name, password</code> · UTF-8
            권장 · 비밀번호 8자 이상
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm rounded border px-3 py-1.5 hover:bg-gray-50"
          >
            📥 템플릿 다운로드
          </button>
          <Link
            href="/admin/users"
            className="text-sm rounded border px-3 py-1.5 hover:bg-gray-50"
          >
            ← User Management
          </Link>
        </div>
      </div>

      {/* 안내 */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 space-y-1">
        <div>
          ℹ️ <strong>동작 방식:</strong>
        </div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <code>vendor_code</code>가 DB에 존재하면 해당 벤더에 유저를 추가 (<code>vendor_name</code>{" "}
            무시)
          </li>
          <li>
            <code>vendor_code</code>가 DB에 없으면 <code>vendor_name</code>으로 벤더 신규 생성 후
            유저 추가
          </li>
          <li>동일 <code>vendor_code</code>에 여러 이메일이 연결될 수 있음 (행 여러 개)</li>
        </ul>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        ⚠️ <strong>보안 주의:</strong> CSV에 비밀번호가 평문으로 들어갑니다. 업로드 완료 후 파일은
        반드시 삭제하세요. 각 사용자에게는 <strong>임시 비밀번호</strong>를 부여하고 첫 로그인 후
        변경하도록 안내해주세요.
      </div>

      {/* 파일 선택 */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv"
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
        <div className="grid grid-cols-6 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-500">총</div>
            <div className="text-xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-lg border p-3 bg-green-50">
            <div className="text-xs text-gray-600">Valid (기존 벤더)</div>
            <div className="text-xl font-semibold text-green-700">{summary.valid}</div>
          </div>
          <div className="rounded-lg border p-3 bg-blue-50">
            <div className="text-xs text-gray-600">Valid + 신규 벤더</div>
            <div className="text-xl font-semibold text-blue-700">{summary.valid_new_vendor}</div>
          </div>
          <div className="rounded-lg border p-3 bg-amber-50">
            <div className="text-xs text-gray-600">Conflict (email 중복)</div>
            <div className="text-xl font-semibold text-amber-700">{summary.conflict}</div>
          </div>
          <div className="rounded-lg border p-3 bg-amber-50">
            <div className="text-xs text-gray-600">Duplicate (파일 내)</div>
            <div className="text-xl font-semibold text-amber-700">{summary.duplicate}</div>
          </div>
          <div className="rounded-lg border p-3 bg-red-50">
            <div className="text-xs text-gray-600">Invalid</div>
            <div className="text-xl font-semibold text-red-700">{summary.invalid}</div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {rows && rows.length > 0 && !applyResult && (
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold">Preview ({rows.length}건)</div>
              <label className="text-xs text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                />
                비밀번호 표시
              </label>
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || totalApplicable === 0}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-40"
            >
              {applying ? "Creating..." : `Apply (${totalApplicable}개 처리)`}
            </button>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-12">Row</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Vendor Code</th>
                  <th className="px-3 py-2 text-left">Vendor Name</th>
                  <th className="px-3 py-2 text-left">Password</th>
                  <th className="px-3 py-2 text-left w-32">Status</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = statusStyle(r.status);
                  const pw = rawPasswords[r.row_no] || "";
                  const displayVendorName =
                    r.vendor_name_resolved ||
                    (r.will_create_vendor ? `🆕 ${r.vendor_name ?? "-"}` : r.vendor_name ?? "-");
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-gray-500 font-mono">{r.row_no}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.email ?? "-"}</td>
                      <td className="px-3 py-1.5">{r.display_name ?? "-"}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.vendor_code ?? "-"}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-700">{displayVendorName}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {showPasswords
                          ? pw || "-"
                          : pw
                          ? "•".repeat(Math.min(pw.length, 10))
                          : "-"}
                      </td>
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
          <div className="text-lg font-bold text-green-700">✅ 등록 완료</div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-600">생성된 유저: </span>
              <span className="font-semibold text-green-700">{applyResult.inserted}</span>
            </div>
            <div>
              <span className="text-gray-600">신규 벤더 생성: </span>
              <span className="font-semibold text-blue-700">{applyResult.created_vendors}</span>
            </div>
            <div>
              <span className="text-gray-600">요청: </span>
              <span className="font-semibold">{applyResult.total_requested}</span>
            </div>
            <div>
              <span className="text-gray-600">실패: </span>
              <span className="font-semibold text-red-700">{applyResult.errors.length}</span>
            </div>
          </div>
          {applyResult.errors.length > 0 && (
            <div className="text-xs text-gray-700 bg-white rounded p-3 border">
              <div className="font-semibold mb-1">실패 상세:</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {applyResult.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.email ?? "-"}</span>: {e.reason}
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
