"use client";

import { useEffect, useMemo, useState } from "react";

type AsnSummaryItem = {
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

type AsnDetailLine = {
  id: string;
  line_no: number | null;
  carton_no: string | null;
  sku: string | null;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  created_at: string | null;
};

type AsnDetail = {
  id: string;
  asn_no: string | null;
  po_id: string | null;
  po_no: string | null;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  source_type: string | null;
  source_id: string | null;
  source_ref_no: string | null;
  header_status: string | null;
  computed_status: string | null;
  po_qty: number;
  total_cartons: number;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  created_at: string | null;
  lines: AsnDetailLine[];
};

type AsnAllDetailRow = {
  asn_id: string;
  asn_no: string | null;
  po_id: string | null;
  po_no: string | null;
  po_qty: number;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  source_type: string | null;
  source_id: string | null;
  source_ref_no: string | null;
  header_status: string | null;
  computed_status: string | null;
  line_id: string;
  line_no: number | null;
  carton_no: string | null;
  sku: string | null;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  asn_created_at: string | null;
  line_created_at: string | null;
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusChipClass(status: string | null | undefined) {
  const s = String(status || "").toUpperCase();

  if (s === "FULL_RECEIVED" || s === "CONFIRMED" || s === "RECEIVED") {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (s === "PARTIAL_RECEIVED" || s === "PENDING") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  if (s === "OPEN" || s === "CREATED" || s === "DRAFT") {
    return "bg-slate-100 text-slate-800 border-slate-200";
  }
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escapeCell = (value: string | number | null) => {
    const s = value == null ? "" : String(value);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function InboundAsnV2Page() {
  const [items, setItems] = useState<AsnSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<AsnDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>("");

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [computedStatusFilter, setComputedStatusFilter] = useState<string>("");

  const [allDetails, setAllDetails] = useState<AsnAllDetailRow[]>([]);
  const [allDetailsLoading, setAllDetailsLoading] = useState(false);
  const [allDetailsError, setAllDetailsError] = useState<string>("");

  async function loadList() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (statusFilter.trim()) params.set("status", statusFilter.trim());
      if (sourceTypeFilter.trim()) params.set("source_type", sourceTypeFilter.trim());
      if (computedStatusFilter.trim()) {
        params.set("computed_status", computedStatusFilter.trim());
      }

      const res = await fetch(`/api/asn-v2?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await parseJsonResponse(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load ASN v2 list");
      }

      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems(nextItems);

      if (selectedId) {
        const exists = nextItems.some((x: AsnSummaryItem) => x.id === selectedId);
        if (!exists) {
          setSelectedId("");
          setDetail(null);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load ASN v2 list");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    try {
      if (!id) {
        setDetail(null);
        return;
      }

      setDetailLoading(true);
      setDetailError("");

      const res = await fetch(`/api/asn-v2/${id}`, {
        cache: "no-store",
      });

      const json = await parseJsonResponse(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load ASN detail");
      }

      setDetail(json.asn || null);
    } catch (e: any) {
      setDetail(null);
      setDetailError(e?.message || "Failed to load ASN detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadAllDetails() {
    try {
      setAllDetailsLoading(true);
      setAllDetailsError("");

      const params = new URLSearchParams();
      if (sourceTypeFilter.trim()) params.set("source_type", sourceTypeFilter.trim());
      if (computedStatusFilter.trim()) {
        params.set("computed_status", computedStatusFilter.trim());
      }
      if (keyword.trim()) {
        params.set("keyword", keyword.trim());
      }

      const res = await fetch(`/api/asn-v2/details?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await parseJsonResponse(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load all ASN details");
      }

      setAllDetails(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setAllDetails([]);
      setAllDetailsError(e?.message || "Failed to load all ASN details");
    } finally {
      setAllDetailsLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sourceTypeFilter, computedStatusFilter]);

  useEffect(() => {
    loadAllDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTypeFilter, computedStatusFilter, keyword]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
      setDetailError("");
    }
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;

    return items.filter((row) => {
      const haystack = [
        row.asn_no,
        row.po_no,
        row.vendor_code,
        row.vendor_name,
        row.source_type,
        row.source_ref_no,
        row.header_status,
        row.computed_status,
        row.gr_no,
        row.gr_status,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [items, keyword]);

  const summaryTotals = useMemo(() => {
    return filteredItems.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.total_cartons += safeNum(row.total_cartons);
        acc.po_qty += safeNum(row.po_qty);
        acc.asn_qty += safeNum(row.asn_qty);
        acc.received_qty += safeNum(row.received_qty);
        acc.balance_qty += safeNum(row.balance_qty);
        return acc;
      },
      {
        count: 0,
        total_cartons: 0,
        po_qty: 0,
        asn_qty: 0,
        received_qty: 0,
        balance_qty: 0,
      }
    );
  }, [filteredItems]);

  function handleDownloadSummaryCsv() {
    const headers = [
      "ASN No",
      "Vendor Code",
      "Vendor Name",
      "PO No",
      "PO Qty",
      "Source Type",
      "Source Ref No",
      "Header Status",
      "Computed Status",
      "Total Cartons",
      "ASN Qty",
      "Received Qty",
      "Balance Qty",
      "GR No",
      "GR Status",
      "GR Confirmed At",
      "Created At",
    ];

    const rows = filteredItems.map((row) => [
      row.asn_no,
      row.vendor_code,
      row.vendor_name,
      row.po_no,
      row.po_qty,
      row.source_type,
      row.source_ref_no,
      row.header_status,
      row.computed_status,
      row.total_cartons,
      row.asn_qty,
      row.received_qty,
      row.balance_qty,
      row.gr_no,
      row.gr_status,
      row.gr_confirmed_at,
      row.created_at,
    ]);

    downloadCsv("asn_v2_summary.csv", headers, rows);
  }

  function handleDownloadDetailCsv() {
    if (!detail) return;

    const headers = [
      "ASN No",
      "PO No",
      "PO Qty",
      "Vendor Code",
      "Vendor Name",
      "Source Type",
      "Source Ref No",
      "Line No",
      "Carton No",
      "SKU",
      "ASN Qty",
      "Received Qty",
      "Balance Qty",
      "Created At",
    ];

    const rows = detail.lines.map((line) => [
      detail.asn_no,
      detail.po_no,
      detail.po_qty,
      detail.vendor_code,
      detail.vendor_name,
      detail.source_type,
      detail.source_ref_no,
      line.line_no,
      line.carton_no,
      line.sku,
      line.asn_qty,
      line.received_qty,
      line.balance_qty,
      line.created_at,
    ]);

    const fileAsnNo = String(detail.asn_no || "asn-detail").replace(/[^\w.-]+/g, "_");
    downloadCsv(`${fileAsnNo}_detail.csv`, headers, rows);
  }

  function handleDownloadAllDetailCsv() {
    const headers = [
      "ASN No",
      "PO No",
      "PO Qty",
      "Vendor Code",
      "Vendor Name",
      "Source Type",
      "Source Ref No",
      "Header Status",
      "Computed Status",
      "Line No",
      "Carton No",
      "SKU",
      "ASN Qty",
      "Received Qty",
      "Balance Qty",
      "ASN Created At",
      "Line Created At",
    ];

    const rows = allDetails.map((row) => [
      row.asn_no,
      row.po_no,
      row.po_qty,
      row.vendor_code,
      row.vendor_name,
      row.source_type,
      row.source_ref_no,
      row.header_status,
      row.computed_status,
      row.line_no,
      row.carton_no,
      row.sku,
      row.asn_qty,
      row.received_qty,
      row.balance_qty,
      row.asn_created_at,
      row.line_created_at,
    ]);

    downloadCsv("asn_v2_all_detail.csv", headers, rows);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Inbound / ASN v2</h1>
          <p className="text-sm text-gray-500 mt-1">
            기존 ASN 업로드 화면과 분리된 조회/관리 전용 페이지
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              loadList();
              loadAllDetails();
              if (selectedId) loadDetail(selectedId);
            }}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={handleDownloadSummaryCsv}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            Download Summary CSV
          </button>

          <button
            type="button"
            onClick={handleDownloadDetailCsv}
            disabled={!detail}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download Selected Detail CSV
          </button>

          <button
            type="button"
            onClick={handleDownloadAllDetailCsv}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            Download All Detail CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">ASN Count</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.count}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">Total Cartons</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.total_cartons}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">PO Qty</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.po_qty}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">ASN Qty</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.asn_qty}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">Received Qty</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.received_qty}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">Balance Qty</div>
          <div className="text-2xl font-semibold mt-1">{summaryTotals.balance_qty}</div>
        </div>
      </div>

      <div className="border rounded bg-white p-4 space-y-3">
        <div className="text-sm font-medium">Filters</div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Keyword</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ASN / PO / Vendor / Status"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Header Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">All</option>
              <option value="OPEN">OPEN</option>
              <option value="CREATED">CREATED</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PARTIAL_RECEIVED">PARTIAL_RECEIVED</option>
              <option value="FULL_RECEIVED">FULL_RECEIVED</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Source Type</label>
            <select
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">All</option>
              <option value="PACKING_LIST">PACKING_LIST</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Computed Status</label>
            <select
              value={computedStatusFilter}
              onChange={(e) => setComputedStatusFilter(e.target.value)}
              className="w-full border rounded px-3 py-2"
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
              onClick={() => {
                setKeyword("");
                setStatusFilter("");
                setSourceTypeFilter("");
                setComputedStatusFilter("");
              }}
              className="w-full border rounded px-3 py-2 bg-white hover:bg-gray-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">ASN Summary List</div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No ASN records found.</div>
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
                  <th className="text-left px-4 py-3 border-b">Header Status</th>
                  <th className="text-left px-4 py-3 border-b">Computed Status</th>
                  <th className="text-right px-4 py-3 border-b">Cartons</th>
                  <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                  <th className="text-right px-4 py-3 border-b">Received Qty</th>
                  <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                  <th className="text-left px-4 py-3 border-b">GR No</th>
                  <th className="text-left px-4 py-3 border-b">GR Status</th>
                  <th className="text-left px-4 py-3 border-b">GR Confirmed At</th>
                  <th className="text-left px-4 py-3 border-b">Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const selected = row.id === selectedId;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`cursor-pointer hover:bg-gray-50 ${selected ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3 border-b font-medium">{row.asn_no || "-"}</td>
                      <td className="px-4 py-3 border-b">
                        <div>{row.vendor_name || "-"}</div>
                        <div className="text-xs text-gray-500">{row.vendor_code || "-"}</div>
                      </td>
                      <td className="px-4 py-3 border-b">{row.po_no || "-"}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.po_qty)}</td>
                      <td className="px-4 py-3 border-b">
                        <div>{row.source_type || "-"}</div>
                        <div className="text-xs text-gray-500">{row.source_ref_no || "-"}</div>
                      </td>
                      <td className="px-4 py-3 border-b">
                        <span
                          className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                            row.header_status
                          )}`}
                        >
                          {row.header_status || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b">
                        <span
                          className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                            row.computed_status
                          )}`}
                        >
                          {row.computed_status || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.total_cartons)}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.asn_qty)}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.received_qty)}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.balance_qty)}</td>
                      <td className="px-4 py-3 border-b">{row.gr_no || "-"}</td>
                      <td className="px-4 py-3 border-b">
                        <span
                          className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                            row.gr_status
                          )}`}
                        >
                          {row.gr_status || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b">{fmtDate(row.gr_confirmed_at)}</td>
                      <td className="px-4 py-3 border-b">{fmtDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">ASN Detail</div>

        {!selectedId ? (
          <div className="p-6 text-sm text-gray-500">Select an ASN row to view detail.</div>
        ) : detailLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading detail...</div>
        ) : detailError ? (
          <div className="p-6 text-sm text-red-600">{detailError}</div>
        ) : !detail ? (
          <div className="p-6 text-sm text-gray-500">No detail found.</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">ASN No</div>
                <div className="font-medium mt-1">{detail.asn_no || "-"}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">PO No</div>
                <div className="font-medium mt-1">{detail.po_no || "-"}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Vendor</div>
                <div className="font-medium mt-1">{detail.vendor_name || "-"}</div>
                <div className="text-xs text-gray-500 mt-1">{detail.vendor_code || "-"}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Source</div>
                <div className="font-medium mt-1">{detail.source_type || "-"}</div>
                <div className="text-xs text-gray-500 mt-1">{detail.source_ref_no || "-"}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Header Status</div>
                <div className="mt-1">
                  <span
                    className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                      detail.header_status
                    )}`}
                  >
                    {detail.header_status || "-"}
                  </span>
                </div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Computed Status</div>
                <div className="mt-1">
                  <span
                    className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                      detail.computed_status
                    )}`}
                  >
                    {detail.computed_status || "-"}
                  </span>
                </div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">PO Qty</div>
                <div className="font-medium mt-1">{safeNum(detail.po_qty)}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Cartons</div>
                <div className="font-medium mt-1">{safeNum(detail.total_cartons)}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">ASN Qty</div>
                <div className="font-medium mt-1">{safeNum(detail.asn_qty)}</div>
              </div>

              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Received Qty</div>
                <div className="font-medium mt-1">{safeNum(detail.received_qty)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Balance Qty</div>
                <div className="font-medium mt-1">{safeNum(detail.balance_qty)}</div>
              </div>
            </div>

            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 border-b">Line No</th>
                    <th className="text-left px-4 py-3 border-b">Carton No</th>
                    <th className="text-left px-4 py-3 border-b">SKU</th>
                    <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                    <th className="text-right px-4 py-3 border-b">Received Qty</th>
                    <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                    <th className="text-left px-4 py-3 border-b">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        No detail lines found.
                      </td>
                    </tr>
                  ) : (
                    detail.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 border-b">{line.line_no ?? "-"}</td>
                        <td className="px-4 py-3 border-b">{line.carton_no || "-"}</td>
                        <td className="px-4 py-3 border-b">{line.sku || "-"}</td>
                        <td className="px-4 py-3 border-b text-right">{safeNum(line.asn_qty)}</td>
                        <td className="px-4 py-3 border-b text-right">{safeNum(line.received_qty)}</td>
                        <td className="px-4 py-3 border-b text-right">{safeNum(line.balance_qty)}</td>
                        <td className="px-4 py-3 border-b">{fmtDate(line.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">ASN All Detail</div>

        {allDetailsLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading all details...</div>
        ) : allDetailsError ? (
          <div className="p-6 text-sm text-red-600">{allDetailsError}</div>
        ) : allDetails.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No detail rows found.</div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 border-b">ASN No</th>
                  <th className="text-left px-4 py-3 border-b">PO No</th>
                  <th className="text-right px-4 py-3 border-b">PO Qty</th>
                  <th className="text-left px-4 py-3 border-b">Vendor</th>
                  <th className="text-left px-4 py-3 border-b">Source</th>
                  <th className="text-left px-4 py-3 border-b">Line No</th>
                  <th className="text-left px-4 py-3 border-b">Carton No</th>
                  <th className="text-left px-4 py-3 border-b">SKU</th>
                  <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                  <th className="text-right px-4 py-3 border-b">Received Qty</th>
                  <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                  <th className="text-left px-4 py-3 border-b">Computed Status</th>
                  <th className="text-left px-4 py-3 border-b">ASN Created At</th>
                </tr>
              </thead>
              <tbody>
                {allDetails.map((row) => (
                  <tr
                    key={row.line_id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedId(row.asn_id)}
                  >
                    <td className="px-4 py-3 border-b">{row.asn_no || "-"}</td>
                    <td className="px-4 py-3 border-b">{row.po_no || "-"}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(row.po_qty)}</td>
                    <td className="px-4 py-3 border-b">
                      <div>{row.vendor_name || "-"}</div>
                      <div className="text-xs text-gray-500">{row.vendor_code || "-"}</div>
                    </td>
                    <td className="px-4 py-3 border-b">
                      <div>{row.source_type || "-"}</div>
                      <div className="text-xs text-gray-500">{row.source_ref_no || "-"}</div>
                    </td>
                    <td className="px-4 py-3 border-b">{row.line_no ?? "-"}</td>
                    <td className="px-4 py-3 border-b">{row.carton_no || "-"}</td>
                    <td className="px-4 py-3 border-b">{row.sku || "-"}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(row.asn_qty)}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(row.received_qty)}</td>
                    <td className="px-4 py-3 border-b text-right">{safeNum(row.balance_qty)}</td>
                    <td className="px-4 py-3 border-b">
                      <span
                        className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(
                          row.computed_status
                        )}`}
                      >
                        {row.computed_status || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b">{fmtDate(row.asn_created_at)}</td>
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