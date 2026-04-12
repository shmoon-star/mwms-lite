"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type AsnSummary = {
  asn_no: string | null;
  asn_qty: number;
  received_qty: number;
  computed_status: string;
  gr_status: string | null;
};

type PoItem = {
  id: string;
  po_no: string;
  vendor_code: string;
  vendor_name: string;
  buyer_id: string | null;
  status: string;
  eta: string | null;
  created_at: string | null;
  po_qty: number;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  gr_status: string | null;
  gr_confirmed_at: string | null;
  asn_count: number;
  asn_list: AsnSummary[];
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusChipClass(status: string | null | undefined) {
  const s = String(status || "").toUpperCase();
  if (s === "GR_CONFIRMED" || s === "CONFIRMED" || s === "FULL_RECEIVED" || s === "RECEIVED")
    return "bg-green-100 text-green-800 border-green-200";
  if (s === "GR_PENDING" || s === "PARTIAL_RECEIVED" || s === "PENDING")
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "ASN_CREATED" || s === "CREATED" || s === "OPEN")
    return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "CANCELLED" || s === "CLOSED")
    return "bg-gray-100 text-gray-500 border-gray-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

/** GR 상태 + received qty를 기반으로 실제 진행 상황을 반영한 PO 표시 상태 계산 */
function computePoDisplayStatus(row: PoItem): string {
  // GR이 확정된 경우
  if (row.gr_status === "CONFIRMED") {
    return "GR_CONFIRMED";
  }
  // GR이 존재하지만 미확정 (PENDING)
  if (row.gr_status === "PENDING") {
    if (row.received_qty > 0 && row.received_qty < row.asn_qty) return "PARTIAL_RECEIVED";
    return "GR_PENDING";
  }
  // GR 없음 — ASN 상태로 판단
  if (row.asn_count > 0) {
    const allFull = row.asn_list.length > 0 && row.asn_list.every(a => a.computed_status === "FULL_RECEIVED");
    const anyPartial = row.asn_list.some(a => a.computed_status === "PARTIAL_RECEIVED");
    if (allFull) return "FULL_RECEIVED";
    if (anyPartial) return "PARTIAL_RECEIVED";
    return "ASN_CREATED";
  }
  // ASN도 없음
  return row.status || "CREATED";
}

function downloadCsv(filename: string, rows: PoItem[]) {
  const headers = [
    "PO No", "Vendor Code", "Vendor Name", "PO Status", "ETA",
    "PO Qty", "ASN Qty", "Received Qty", "Balance Qty",
    "ASN No", "ASN Computed Status", "ASN Received Qty",
    "GR Status", "GR Confirmed At", "Created At",
  ];

  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // ASN 하나당 한 행으로 펼치기
  const dataRows: (string | number | null)[][] = [];
  for (const r of rows) {
    if (r.asn_list.length === 0) {
      // ASN 없는 PO도 한 행으로 표시
      dataRows.push([
        r.po_no, r.vendor_code, r.vendor_name, r.status, r.eta ?? "",
        r.po_qty, r.asn_qty, r.received_qty, r.balance_qty,
        "", "", "",
        r.gr_status ?? "", r.gr_confirmed_at ? r.gr_confirmed_at.slice(0, 10) : "", r.created_at ?? "",
      ]);
    } else {
      for (const asn of r.asn_list) {
        dataRows.push([
          r.po_no, r.vendor_code, r.vendor_name, r.status, r.eta ?? "",
          r.po_qty, r.asn_qty, r.received_qty, r.balance_qty,
          asn.asn_no ?? "", asn.computed_status, asn.received_qty,
          r.gr_status ?? "", r.gr_confirmed_at ? r.gr_confirmed_at.slice(0, 10) : "", r.created_at ?? "",
        ]);
      }
    }
  }

  const csv = [
    headers.map(escape).join(","),
    ...dataRows.map((row) => row.map(escape).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BuyerPoPage() {
  const [items, setItems] = useState<PoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [buyerCode, setBuyerCode] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/buyer/po${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 401 || res.status === 403) { window.location.href = "/buyer-login"; return; }
        throw new Error(json.error || "Failed to load");
      }
      setItems(json.data ?? []);
      setBuyerCode(json.buyer_code ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.po_no, r.vendor_code, r.vendor_name, r.status, r.eta ?? "", r.gr_status ?? ""]
        .join(" ").toLowerCase().includes(q)
    );
  }, [items, query]);

  const totals = useMemo(() => filtered.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      po_qty: acc.po_qty + safeNum(r.po_qty),
      asn_qty: acc.asn_qty + safeNum(r.asn_qty),
      received_qty: acc.received_qty + safeNum(r.received_qty),
      balance_qty: acc.balance_qty + safeNum(r.balance_qty),
    }),
    { count: 0, po_qty: 0, asn_qty: 0, received_qty: 0, balance_qty: 0 }
  ), [filtered]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Purchase Orders</h1>
          {buyerCode && (
            <p className="text-sm text-gray-500 mt-1">Buyer: <strong>{buyerCode}</strong></p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={load}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          >
            Refresh
          </button>
          <button
            onClick={() => downloadCsv("purchase_orders.csv", filtered)}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "PO Count", value: totals.count, formula: "# of purchase orders" },
          { label: "PO Qty", value: totals.po_qty, formula: "Σ po_line.qty_ordered" },
          { label: "ASN Qty", value: totals.asn_qty, formula: "Σ asn_line.qty (per PO)" },
          { label: "Received Qty", value: totals.received_qty, formula: "Σ gr_line.qty_received" },
          { label: "Balance Qty", value: totals.balance_qty, formula: "PO Qty − ASN Qty" },
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
      <div className="border rounded bg-white p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-500 mb-1">Keyword</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="PO No / Vendor / Status / ETA..."
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PO Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="CREATED">CREATED</option>
              <option value="ASN_CREATED">ASN_CREATED</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
          <button
            onClick={() => { setQuery(""); setStatusFilter(""); }}
            className="border rounded px-3 py-2 bg-white hover:bg-gray-50 text-sm"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium flex items-center justify-between">
          <span>Purchase Order List</span>
          <span className="text-xs text-gray-500">{filtered.length} rows</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 border-b">PO No / ASN(s)</th>
                  <th className="text-left px-4 py-3 border-b">Vendor</th>
                  <th className="text-left px-4 py-3 border-b">PO Status</th>
                  <th className="text-left px-4 py-3 border-b">ETA</th>
                  <th className="text-right px-4 py-3 border-b">PO Qty</th>
                  <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                  <th className="text-right px-4 py-3 border-b">Received</th>
                  <th className="text-right px-4 py-3 border-b">Balance</th>
                  <th className="text-left px-4 py-3 border-b">GR Status</th>
                  <th className="text-left px-4 py-3 border-b">Created</th>
                  <th className="text-left px-4 py-3 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                      No purchase orders found
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 border-t">
                      {/* PO No + ASN 서브라인 */}
                      <td className="px-4 py-3 border-b">
                        <div className="font-semibold">{row.po_no}</div>
                        {row.asn_list.length === 0 ? (
                          <div className="mt-1 text-xs text-gray-300">ASN 없음</div>
                        ) : (
                          <div className="mt-1 space-y-0.5">
                            {row.asn_list.map((asn, i) => (
                              <div key={i} className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-gray-500 font-mono">{asn.asn_no ?? "-"}</span>
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${statusChipClass(asn.computed_status)}`}>
                                  {asn.computed_status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 border-b">
                        <div className="font-medium">{row.vendor_code}</div>
                        <div className="text-xs text-gray-500">{row.vendor_name}</div>
                      </td>
                      <td className="px-4 py-3 border-b">
                        {(() => {
                          const displayStatus = computePoDisplayStatus(row);
                          return (
                            <div>
                              <span className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(displayStatus)}`}>
                                {displayStatus}
                              </span>
                              {displayStatus !== row.status && (
                                <div className="text-xs text-gray-400 mt-0.5 font-mono">{row.status}</div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 border-b">{row.eta ?? "-"}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.po_qty)}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.asn_qty)}</td>
                      <td className="px-4 py-3 border-b text-right">{safeNum(row.received_qty)}</td>
                      <td className="px-4 py-3 border-b text-right">
                        <span className={safeNum(row.balance_qty) > 0 ? "font-semibold text-amber-600" : "font-semibold text-green-600"}>
                          {safeNum(row.balance_qty)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b">
                        {row.gr_status ? (
                          <span className={`inline-flex px-2 py-1 text-xs rounded border ${statusChipClass(row.gr_status)}`}>
                            {row.gr_status}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                        {row.gr_confirmed_at && (
                          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(row.gr_confirmed_at)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 border-b text-gray-500 text-sm">
                        {fmtDate(row.created_at) || "-"}
                      </td>
                      <td className="px-4 py-3 border-b">
                        <Link
                          href={`/buyer/po/${row.id}`}
                          className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
