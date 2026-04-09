"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PackingListLine = {
  id: string;
  line_no: number;
  sku: string | null;
  description: string | null;
  qty: number;
  packed_qty: number;
  gr_received_qty: number;
  balance_qty: number;
  progress_status: string;
  carton_no: string | null;
  po_no: string | null;
  style_code: string | null;
  color: string | null;
  size: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PackingListDetailResponse = {
  ok: boolean;
  header: {
    id: string;
    pl_no: string | null;
    po_no: string | null;
    eta: string | null;
    total_qty: number | null;
    status: string | null;
    remarks: string | null;
    created_at: string | null;
    updated_at: string | null;
    vendor_id: string | null;
    asn_id?: string | null;
  };
  vendor: {
    id: string;
    vendor_code: string;
    vendor_name: string;
    vendor_name_en: string | null;
  } | null;
  summary: {
    total_cartons: number;
    total_qty: number;
    gr_received_qty: number;
    balance_qty: number;
  };
  asn: {
    id: string;
    asn_no: string;
    status: string;
    created_at: string | null;
    source_type?: string | null;
    source_id?: string | null;
    vendor_id?: string | null;
  } | null;
  lines: PackingListLine[];
  error?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR");
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toUpperCase();

  let className =
    "inline-flex rounded-full px-3 py-1 text-xs font-semibold border ";

  if (normalized === "DRAFT") {
    className += "bg-yellow-100 text-yellow-800 border-yellow-200";
  } else if (normalized === "SUBMITTED") {
    className += "bg-blue-100 text-blue-800 border-blue-200";
  } else if (normalized === "FINALIZED") {
    className += "bg-green-100 text-green-800 border-green-200";
  } else if (normalized === "INBOUND_COMPLETED") {
    className += "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (normalized === "DONE") {
    className += "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (normalized === "PARTIAL") {
    className += "bg-orange-100 text-orange-800 border-orange-200";
  } else {
    className += "bg-gray-100 text-gray-800 border-gray-200";
  }

  return <span className={className}>{status || "-"}</span>;
}

export default function PackingListDetailClient({ id }: { id: string }) {
  type SkuRow = { sku: string; po_qty: number; pl_qty: number };

  type ReasonDetail = {
    reason: string;
    label: string;
    expected_qty: number;
    received_qty: number;
    delta: number;
  };

  type GrRemark = {
    sku: string;
    asn_qty: number;
    received_qty: number;
    delta: number;
    result: string;
    reason_details: ReasonDetail[];
    gr_nos: string[];
  };

  const [data, setData] = useState<PackingListDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mismatchSkuRows, setMismatchSkuRows] = useState<SkuRow[] | null>(null);
  const [actionLoading, setActionLoading] = useState<"" | "submit" | "finalize">("");
  const [grRemarks, setGrRemarks] = useState<GrRemark[] | null>(null);
  const [grHasDiscrepancy, setGrHasDiscrepancy] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/vendor/packing-lists/${id}`, {
        cache: "no-store",
      });

      const json: PackingListDetailResponse = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load packing list");
      }

      setData(json);

      // GR remarks — fetch only when ASN exists (status past SUBMITTED)
      const statusUpper = String(json?.header?.status || "").toUpperCase();
      if (
        statusUpper === "CONFIRMED" ||
        statusUpper === "INBOUND_COMPLETED" ||
        statusUpper === "FINALIZED"
      ) {
        const remarksRes = await fetch(`/api/vendor/packing-lists/${id}/gr-remarks`, {
          cache: "no-store",
        });
        const remarksJson = remarksRes.ok ? await remarksRes.json() : null;
        if (remarksJson?.ok && remarksJson.remarks?.length > 0) {
          setGrRemarks(remarksJson.remarks);
          setGrHasDiscrepancy(remarksJson.has_discrepancy ?? false);
        } else {
          setGrRemarks(null);
          setGrHasDiscrepancy(false);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load packing list");
    } finally {
      setLoading(false);
    }
  }

  async function submitPackingList() {
    try {
      setActionLoading("submit");
      setError("");
      setMismatchSkuRows(null);

      const res = await fetch(`/api/vendor/packing-lists/${id}/submit`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        // 수량 불일치(422) 시 SKU 비교 데이터 저장
        if (res.status === 422 && json?.skuRows) {
          setMismatchSkuRows(json.skuRows);
        }
        throw new Error(json?.error || "Failed to submit packing list");
      }

      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to submit packing list");
    } finally {
      setActionLoading("");
    }
  }

  async function finalizePackingList() {
    try {
      setActionLoading("finalize");
      setError("");

      const res = await fetch(`/api/vendor/packing-lists/${id}/finalize`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to finalize packing list");
      }

      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to finalize packing list");
    } finally {
      setActionLoading("");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return <div className="rounded-xl border p-6">Loading...</div>;
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || "Failed to load packing list"}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        Failed to load packing list
      </div>
    );
  }

  const { header, vendor, summary, lines, asn } = data;
  const normalizedStatus = String(header.status || "").toUpperCase();

  const canSubmit = normalizedStatus === "DRAFT";
  const canFinalize =
    normalizedStatus === "DRAFT" || normalizedStatus === "SUBMITTED";
  const canOpenAsn =
    (normalizedStatus === "FINALIZED" || normalizedStatus === "INBOUND_COMPLETED") &&
    !!asn?.id;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm text-gray-500">
            Vendor / Packing Lists / {header.pl_no || header.id}
          </div>
          <h1 className="text-4xl font-bold">{header.pl_no || header.id}</h1>

          <div className="mt-4">
            <StatusBadge status={header.status || "-"} />
          </div>

          <div className="mt-6 space-y-3 text-lg">
            <div>
              <span className="font-semibold">PO No:</span> {header.po_no || "-"}
            </div>
            <div>
              <span className="font-semibold">Vendor:</span>{" "}
              {vendor ? `${vendor.vendor_code} / ${vendor.vendor_name}` : "-"}
            </div>
            <div>
              <span className="font-semibold">ETA:</span> {header.eta || "-"}
            </div>
            <div>
              <span className="font-semibold">Total Qty:</span> {header.total_qty ?? "-"}
            </div>
            <div>
              <span className="font-semibold">Created At:</span>{" "}
              {formatDateTime(header.created_at)}
            </div>
            <div>
              <span className="font-semibold">Updated At:</span>{" "}
              {formatDateTime(header.updated_at)}
            </div>
            <div>
              <span className="font-semibold">ASN No:</span> {asn?.asn_no || "-"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="rounded-lg border px-4 py-2 hover:bg-gray-50"
          >
            Refresh
          </button>

          {canSubmit ? (
            <button
              onClick={submitPackingList}
              disabled={actionLoading !== ""}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              {actionLoading === "submit" ? "Submitting..." : "Submit"}
            </button>
          ) : null}

          {canFinalize ? (
            <button
              onClick={finalizePackingList}
              disabled={actionLoading !== ""}
              className="rounded-lg border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              {actionLoading === "finalize" ? "Finalizing..." : "Finalize"}
            </button>
          ) : null}

          {canOpenAsn ? (
            <Link
              href={`/inbound/asn/${asn!.id}`}
              className="rounded-lg border px-4 py-2 text-blue-700 hover:bg-gray-50 hover:underline"
            >
              Open ASN
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : null}

      {/* SKU 수량 불일치 테이블 */}
      {mismatchSkuRows && mismatchSkuRows.length > 0 && (
        <div className="rounded-xl border border-red-200 overflow-hidden">
          <div className="bg-red-50 px-4 py-3 font-semibold text-red-800 border-b border-red-200">
            발주수량 vs 포장수량 비교
          </div>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-red-50 text-red-800">
              <tr>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-right">발주 수량 (PO)</th>
                <th className="px-4 py-2 text-right">포장 수량 (PL)</th>
                <th className="px-4 py-2 text-right">차이</th>
              </tr>
            </thead>
            <tbody>
              {mismatchSkuRows.map((row) => {
                const diff = row.pl_qty - row.po_qty;
                const mismatch = diff !== 0;
                return (
                  <tr
                    key={row.sku}
                    className={`border-t border-red-100 ${mismatch ? "bg-red-50" : "bg-white"}`}
                  >
                    <td className="px-4 py-2">{row.sku}</td>
                    <td className="px-4 py-2 text-right">{row.po_qty}</td>
                    <td className={`px-4 py-2 text-right ${mismatch ? "text-red-700 font-bold" : ""}`}>
                      {row.pl_qty}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        diff > 0 ? "text-amber-700" : diff < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border p-6">
          <div className="text-sm text-gray-500">Total Cartons</div>
          <div className="mt-3 text-4xl font-bold">{summary.total_cartons}</div>
        </div>
        <div className="rounded-2xl border p-6">
          <div className="text-sm text-gray-500">Packed Qty</div>
          <div className="mt-3 text-4xl font-bold">{summary.total_qty}</div>
        </div>
        <div className="rounded-2xl border p-6">
          <div className="text-sm text-gray-500">GR Received Qty</div>
          <div className="mt-3 text-4xl font-bold">{summary.gr_received_qty}</div>
        </div>
        <div className="rounded-2xl border p-6">
          <div className="text-sm text-gray-500">Balance Qty</div>
          <div className="mt-3 text-4xl font-bold">{summary.balance_qty}</div>
        </div>
      </div>

      {/* GR Receipt Summary — shown to vendor after GR confirmed */}
      {grRemarks && grRemarks.length > 0 && (
        <div className={`overflow-hidden rounded-2xl border ${grHasDiscrepancy ? "border-amber-200" : "border-green-200"}`}>
          <div className={`px-6 py-4 flex items-center justify-between ${grHasDiscrepancy ? "bg-amber-50" : "bg-green-50"}`}>
            <div>
              <div className={`text-lg font-semibold ${grHasDiscrepancy ? "text-amber-800" : "text-green-800"}`}>
                GR Receipt Summary
              </div>
              <div className={`text-sm mt-0.5 ${grHasDiscrepancy ? "text-amber-600" : "text-green-600"}`}>
                {grHasDiscrepancy
                  ? "Some items have quantity discrepancies. Please review the remarks below."
                  : "All items received as expected."}
              </div>
            </div>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${
                grHasDiscrepancy
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-green-100 text-green-800 border-green-200"
              }`}
            >
              {grHasDiscrepancy ? "Discrepancy" : "Full Match"}
            </span>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead className={grHasDiscrepancy ? "bg-amber-50" : "bg-green-50"}>
              <tr className="border-t">
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-right font-medium">Packed Qty</th>
                <th className="px-4 py-3 text-right font-medium">Received Qty</th>
                <th className="px-4 py-3 text-right font-medium">Delta</th>
                <th className="px-4 py-3 text-left font-medium">Result</th>
                <th className="px-4 py-3 text-left font-medium">Variance Remark</th>
              </tr>
            </thead>
            <tbody>
              {grRemarks.map((row) => (
                <tr key={row.sku} className={`border-t ${row.delta !== 0 ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-3 font-mono">{row.sku}</td>
                  <td className="px-4 py-3 text-right">{row.asn_qty}</td>
                  <td className="px-4 py-3 text-right font-semibold">{row.received_qty}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      row.delta < 0 ? "text-red-600" : row.delta > 0 ? "text-amber-600" : "text-green-600"
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta === 0 ? "—" : row.delta}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        row.result === "MATCH"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : row.result === "SHORT"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-red-100 text-red-700 border-red-200"
                      }`}
                    >
                      {row.result}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.reason_details.length > 0 ? (
                      <div className="space-y-1.5">
                        {row.reason_details.map((rd, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {rd.label}
                            </span>
                            <span
                              className={`text-xs font-bold tabular-nums ${
                                rd.delta < 0 ? "text-red-600" : rd.delta > 0 ? "text-amber-600" : "text-green-600"
                              }`}
                            >
                              {rd.delta > 0 ? `+${rd.delta}` : rd.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <div className="border-b px-6 py-4 text-2xl font-semibold">
          Packing List Lines
        </div>

        <table className="w-full border-collapse">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-4">Line</th>
              <th className="px-4 py-4">Box No</th>
              <th className="px-4 py-4">SKU</th>
              <th className="px-4 py-4">Description</th>
              <th className="px-4 py-4">Qty</th>
              <th className="px-4 py-4">Packed</th>
              <th className="px-4 py-4">GR Received</th>
              <th className="px-4 py-4">Balance</th>
              <th className="px-4 py-4">Progress</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-4">{row.line_no}</td>
                <td className="px-4 py-4">{row.carton_no || "-"}</td>
                <td className="px-4 py-4">{row.sku || "-"}</td>
                <td className="px-4 py-4">{row.description || "-"}</td>
                <td className="px-4 py-4">{row.qty}</td>
                <td className="px-4 py-4">{row.packed_qty}</td>
                <td className="px-4 py-4">{row.gr_received_qty}</td>
                <td className="px-4 py-4">{row.balance_qty}</td>
                <td className="px-4 py-4">
                  <StatusBadge status={row.progress_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}