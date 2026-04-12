"use client";

import { useEffect, useMemo, useState } from "react";
import PageToolbar from "@/components/PageToolbar";
import CsvUploadButton from "@/components/CsvUploadButton";
import { downloadCsv } from "@/lib/csv";
import UploadTemplateCard from "@/components/upload/UploadTemplateCard";
import { fmtDate } from "@/lib/fmt";

type ASNRow = {
  id: string;
  asn_no: string | null;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  po_id: string | null;
  po_no: string | null;
  source_type: string | null;
  source_id: string | null;
  source_ref_no: string | null;
  eta: string | null;
  header_status: string | null;
  computed_status: string | null;
  total_cartons: number;
  po_qty: number;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  gr_id: string | null;
  gr_no: string | null;
  gr_status: string | null;
  gr_confirmed_at: string | null;
  created_at: string | null;
};

function statusChipClass(status: string | null | undefined) {
  const s = String(status || "").toUpperCase();
  if (s === "FULL_RECEIVED" || s === "CONFIRMED" || s === "RECEIVED")
    return "bg-green-100 text-green-800 border-green-200";
  if (s === "PARTIAL_RECEIVED" || s === "PENDING")
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "OPEN" || s === "CREATED" || s === "DRAFT")
    return "bg-slate-100 text-slate-800 border-slate-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function ASNPage() {
  const [rows, setRows] = useState<ASNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [computedStatusFilter, setComputedStatusFilter] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source_type", sourceFilter);
    if (computedStatusFilter) params.set("computed_status", computedStatusFilter);
    return params.toString();
  }, [statusFilter, sourceFilter, computedStatusFilter]);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const url = `/api/asn/list${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${text}`); }
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load ASN");
      const items = Array.isArray(json) ? json : json.items ?? json.data ?? json.asns ?? [];
      setRows(items);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [queryString]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.asn_no, r.po_no, r.vendor_name, r.vendor_code, r.header_status, r.computed_status, r.source_type, r.source_ref_no, r.eta, r.gr_no]
        .some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [rows, keyword]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.po_qty += safeNum(r.po_qty);
      acc.asn_qty += safeNum(r.asn_qty);
      acc.received_qty += safeNum(r.received_qty);
      acc.balance_qty += safeNum(r.balance_qty);
      return acc;
    },
    { count: 0, po_qty: 0, asn_qty: 0, received_qty: 0, balance_qty: 0 }
  ), [filtered]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Inbound / ASN</h1>
          <p className="text-sm text-gray-500 mt-1">ASN 생성용 업로드 템플릿 / 조회</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                "asn.csv",
                filtered.map((r) => ({
                  asn_no: r.asn_no,
                  po_no: r.po_no,
                  vendor_code: r.vendor_code,
                  vendor_name: r.vendor_name,
                  source_type: r.source_type,
                  source_ref_no: r.source_ref_no,
                  eta: r.eta,
                  header_status: r.header_status,
                  computed_status: r.computed_status,
                  po_qty: r.po_qty,
                  asn_qty: r.asn_qty,
                  received_qty: r.received_qty,
                  balance_qty: r.balance_qty,
                  gr_no: r.gr_no,
                  gr_status: r.gr_status,
                  gr_confirmed_at: r.gr_confirmed_at,
                  created_at: r.created_at,
                }))
              )
            }
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="border rounded bg-white p-4">
        <UploadTemplateCard
          title="ASN Upload"
          description="ASN 생성용 업로드 템플릿"
          headers={["po_no", "asn_no", "sku", "qty_expected", "eta", "remark"]}
          sampleRows={[
            ["PO-20260314-0001", "ASN-20260314-0001", "SKU001", 100, "2026-03-20", "partial inbound"],
            ["PO-20260314-0001", "ASN-20260314-0001", "SKU002", 50, "2026-03-20", "partial inbound"],
          ]}
          onDownloadTemplate={() => window.open("/api/asn/template", "_blank")}
          uploadSlot={<CsvUploadButton uploadUrl="/api/asn/upload" onUploaded={load} />}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "ASN Count",    value: totals.count,        formula: "# of ASN headers" },
          { label: "PO Qty",       value: totals.po_qty,       formula: "Σ po_line.qty_ordered" },
          { label: "ASN Qty",      value: totals.asn_qty,      formula: "Σ asn_line.qty_expected" },
          { label: "Received Qty", value: totals.received_qty, formula: "Σ gr_line.qty_received (WMS)" },
          { label: "Balance Qty",  value: totals.balance_qty,  formula: "ASN Qty − Received Qty" },
        ].map(({ label, value, formula }) => (
          <div key={label} className="border rounded p-4 bg-white">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-2xl font-semibold mt-1 ${label === "Balance Qty" && value > 0 ? "text-amber-600" : ""}`}>
              {value}
            </div>
            <div className="text-xs text-gray-400 mt-1 font-mono">{formula}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="border rounded bg-white p-4 space-y-3">
        <div className="text-sm font-medium">Filters</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keyword</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ASN / PO / Vendor / Status"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Header Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="CREATED">CREATED</option>
              <option value="OPEN">OPEN</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CONFIRMED">CONFIRMED</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Source Type</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="PACKING_LIST">PACKING_LIST</option>
              <option value="MANUAL">MANUAL</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Computed Status</label>
            <select
              value={computedStatusFilter}
              onChange={(e) => setComputedStatusFilter(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="OPEN">OPEN</option>
              <option value="PARTIAL_RECEIVED">PARTIAL_RECEIVED</option>
              <option value="FULL_RECEIVED">FULL_RECEIVED</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setKeyword(""); setStatusFilter(""); setSourceFilter(""); setComputedStatusFilter(""); }}
              className="w-full border rounded px-3 py-2 bg-white hover:bg-gray-50 text-sm"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium flex items-center justify-between">
          <span>ASN List</span>
          <span className="text-xs text-gray-500">{filtered.length} rows</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No ASN found.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 border-b">ASN No</th>
                  <th className="text-left px-4 py-3 border-b">Vendor</th>
                  <th className="text-left px-4 py-3 border-b">PO No</th>
                  <th className="text-right px-4 py-3 border-b">PO Qty</th>
                  <th className="text-left px-4 py-3 border-b">Source</th>
                  <th className="text-left px-4 py-3 border-b">ETA</th>
                  <th className="text-left px-4 py-3 border-b">Header Status</th>
                  <th className="text-left px-4 py-3 border-b">Computed Status</th>
                  <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                  <th className="text-right px-4 py-3 border-b">Received Qty</th>
                  <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                  <th className="text-left px-4 py-3 border-b">GR No</th>
                  <th className="text-left px-4 py-3 border-b">GR Status</th>
                  <th className="text-left px-4 py-3 border-b">GR Confirmed At</th>
                  <th className="text-left px-4 py-3 border-b">Created At</th>
                  <th className="text-left px-4 py-3 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 border-t">
                    <td className="px-4 py-3 border-b font-medium">{r.asn_no || "-"}</td>
                    <td className="px-4 py-3 border-b">
                      <div>{r.vendor_name || "-"}</div>
                      <div className="text-xs text-gray-500">{r.vendor_code || "-"}</div>
                    </td>
                    <td className="px-4 py-3 border-b">{r.po_no || "-"}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(r.po_qty)}</td>
                    <td className="px-4 py-3 border-b">
                      <div>{r.source_type || "-"}</div>
                      <div className="text-xs text-gray-500">{r.source_ref_no || "-"}</div>
                    </td>
                    <td className="px-4 py-3 border-b">{r.eta || "-"}</td>
                    <td className="px-4 py-3 border-b">
                      <span className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(r.header_status)}`}>
                        {r.header_status || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b">
                      <span className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(r.computed_status)}`}>
                        {r.computed_status || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(r.asn_qty)}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(r.received_qty)}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(r.balance_qty)}</td>
                    <td className="px-4 py-3 border-b">{r.gr_no || "-"}</td>
                    <td className="px-4 py-3 border-b">
                      {r.gr_status ? (
                        <span className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(r.gr_status)}`}>
                          {r.gr_status}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 border-b">{fmtDate(r.gr_confirmed_at) || "-"}</td>
                    <td className="px-4 py-3 border-b">{fmtDate(r.created_at) || "-"}</td>
                    <td className="px-4 py-3 border-b">
                      <a
                        href={`/inbound/asn/${r.id}`}
                        className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
