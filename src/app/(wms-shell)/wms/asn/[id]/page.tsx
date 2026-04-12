"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WmsAsnLine = {
  asn_line_id: string;
  line_no: number | null;
  carton_no: string | null;
  sku: string | null;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  variance_reason?: string | null;
};

type WmsAsnDetail = {
  id: string;
  asn_no: string | null;
  po_no: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  status: string | null;
  gr_id: string | null;
  gr_no: string | null;
  gr_status: string | null;
  lines: WmsAsnLine[];
};

const VARIANCE_REASONS = [
  { value: "SHORTAGE", label: "Shortage" },
  { value: "OVERAGE", label: "Overage" },
  { value: "DEFECT_RETURN", label: "Quality Defect - Return Pending" },
] as const;

type VarianceReason = (typeof VARIANCE_REASONS)[number]["value"];

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function reasonBadge(reason: string) {
  const map: Record<string, { label: string; cls: string }> = {
    SHORTAGE: { label: "Shortage", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    OVERAGE: { label: "Overage", cls: "bg-red-100 text-red-800 border-red-200" },
    DEFECT_RETURN: { label: "Quality Defect - Return Pending", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  };
  return map[reason] ?? { label: reason, cls: "bg-gray-100 text-gray-700 border-gray-200" };
}

export default function WmsAsnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [asnId, setAsnId] = useState("");
  const [detail, setDetail] = useState<WmsAsnDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [boxFilter, setBoxFilter] = useState("");

  // Key-in quantities per asn_line_id
  const [values, setValues] = useState<Record<string, number>>({});
  // Variance reasons per asn_line_id
  const [reasons, setReasons] = useState<Record<string, VarianceReason>>({});

  useEffect(() => {
    params.then((p) => setAsnId(p.id));
  }, [params]);

  async function loadDetail(id: string) {
    try {
      setLoading(true);
      setError("");
      setSaveMessage("");
      setSaveOk(false);

      const res = await fetch(`/api/wms/asn/${id}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load WMS ASN detail");
      }

      const asn = json.asn as WmsAsnDetail;
      setDetail(asn);

      const nextValues: Record<string, number> = {};
      const nextReasons: Record<string, VarianceReason> = {};

      for (const line of asn.lines || []) {
        const savedReceived = safeNum(line.received_qty);
        // Default to ASN qty so workers only need to fix discrepancies.
        // If a received qty has already been saved (> 0), keep that value.
        nextValues[line.asn_line_id] = savedReceived > 0 ? savedReceived : safeNum(line.asn_qty);
        if (line.variance_reason) {
          nextReasons[line.asn_line_id] = line.variance_reason as VarianceReason;
        }
      }

      setValues(nextValues);
      setReasons(nextReasons);
    } catch (e: any) {
      setDetail(null);
      setError(e?.message || "Failed to load WMS ASN detail");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!asnId) return;
    if (!looksLikeUuid(asnId)) {
      setDetail(null);
      setError("Invalid ASN id. Please open from the ASN list.");
      return;
    }
    loadDetail(asnId);
  }, [asnId]);

  const totals = useMemo(() => {
    const lines = detail?.lines || [];
    let asnQty = 0;
    let receivedQty = 0;

    for (const line of lines) {
      asnQty += safeNum(line.asn_qty);
      receivedQty += safeNum(values[line.asn_line_id]);
    }

    return {
      asn_qty: asnQty,
      received_qty: receivedQty,
      balance_qty: asnQty - receivedQty,
    };
  }, [detail, values]);

  const filteredLines = useMemo(() => {
    const q = boxFilter.trim().toLowerCase();
    if (!detail) return [];
    if (!q) return detail.lines;

    return detail.lines.filter((line) => {
      const haystack = [line.carton_no, line.sku, String(line.line_no ?? "")]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [detail, boxFilter]);

  // Lines where keyin qty ≠ asn_qty → need a reason
  const mismatchedLineIds = useMemo(() => {
    if (!detail) return new Set<string>();
    return new Set(
      detail.lines
        .filter((l) => safeNum(values[l.asn_line_id]) !== safeNum(l.asn_qty))
        .map((l) => l.asn_line_id)
    );
  }, [detail, values]);

  const unresolvedCount = [...mismatchedLineIds].filter((id) => !reasons[id]).length;

  async function handleSave() {
    try {
      if (!asnId || !detail) return;

      setSaving(true);
      setSaveMessage("");
      setSaveOk(false);

      const payload = {
        lines: detail.lines.map((line) => ({
          asn_line_id: line.asn_line_id,
          received_qty: safeNum(values[line.asn_line_id]),
          variance_reason: reasons[line.asn_line_id] ?? null,
        })),
      };

      const res = await fetch(`/api/wms/asn/${asnId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save received qty");
      }

      setSaveOk(true);
      setSaveMessage(`Saved. ${json.gr_no || ""}`.trim());
      await loadDetail(asnId);
    } catch (e: any) {
      setSaveOk(false);
      setSaveMessage(e?.message || "Failed to save received qty");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">WMS / ASN Key-in</h1>
          <p className="text-sm text-gray-500 mt-1">
            box / line 단위 received qty 입력 후 GR draft 저장
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap">
            <Link href="/wms/asn" className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm">
              Back
            </Link>

            {detail?.gr_id ? (
              <Link
                href={`/inbound/gr/${detail.gr_id}`}
                className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
              >
                Open GR
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => asnId && looksLikeUuid(asnId) && loadDetail(asnId)}
              className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !detail || String(detail?.status ?? "").toUpperCase() === "CANCELLED"}
              className="px-3 py-2 rounded border bg-black text-white disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : "Save Received Qty"}
            </button>
          </div>

          {unresolvedCount > 0 && (
            <div className="text-xs text-amber-600">
              ⚠ {unresolvedCount} mismatched line{unresolvedCount > 1 ? "s" : ""} without a variance reason
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !detail ? (
        <div className="text-sm text-gray-500">No ASN found.</div>
      ) : (
        <>
          {/* CANCELLED 경고 배너 */}
          {String(detail.status ?? "").toUpperCase() === "CANCELLED" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm font-medium flex items-center gap-2">
              ⛔ 이 ASN은 취소(CANCELLED) 상태입니다. GR 입력이 불가합니다.
            </div>
          )}

          {/* Header Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">ASN No</div>
              <div className="text-xl font-semibold mt-1">{detail.asn_no || "-"}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">PO No</div>
              <div className="text-xl font-semibold mt-1">{detail.po_no || "-"}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">Vendor</div>
              <div className="text-xl font-semibold mt-1">{detail.vendor_name || "-"}</div>
              <div className="text-xs text-gray-500 mt-1">{detail.vendor_code || "-"}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">GR Draft</div>
              <div className="text-xl font-semibold mt-1">{detail.gr_no || "-"}</div>
              <div className="text-xs text-gray-500 mt-1">{detail.gr_status || "-"}</div>
            </div>
          </div>

          {/* Qty Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">ASN Qty</div>
              <div className="text-2xl font-semibold mt-1">{totals.asn_qty}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">Received Qty</div>
              <div className={`text-2xl font-semibold mt-1 ${totals.balance_qty !== 0 ? "text-amber-600" : "text-green-600"}`}>
                {totals.received_qty}
              </div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">Balance Qty</div>
              <div className={`text-2xl font-semibold mt-1 ${totals.balance_qty !== 0 ? "text-red-600" : "text-green-600"}`}>
                {totals.balance_qty}
              </div>
            </div>
          </div>

          {saveMessage ? (
            <div
              className={`text-sm px-4 py-2 rounded border ${
                saveOk
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {saveOk ? "✅ " : "❌ "}{saveMessage}
            </div>
          ) : null}

          {/* Lines Table */}
          <div className="border rounded bg-white overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-medium">ASN Lines</div>
              {mismatchedLineIds.size > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  {[...mismatchedLineIds].filter((id) => !!reasons[id]).length} / {mismatchedLineIds.size} reasons set
                </span>
              )}
            </div>

            <div className="px-4 py-3 border-b bg-white">
              <label className="block text-xs text-gray-500 mb-2">Search Box / SKU / Line</label>
              <input
                value={boxFilter}
                onChange={(e) => setBoxFilter(e.target.value)}
                placeholder="e.g. BOX-003 / SKU001 / 3"
                className="w-full md:w-72 border rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 border-b">Line No</th>
                    <th className="text-left px-4 py-3 border-b">Carton No</th>
                    <th className="text-left px-4 py-3 border-b">SKU</th>
                    <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                    <th className="text-right px-4 py-3 border-b">Received Qty</th>
                    <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                    <th className="text-left px-4 py-3 border-b">Key-in</th>
                    <th className="text-left px-4 py-3 border-b">Variance Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                        No lines found.
                      </td>
                    </tr>
                  ) : (
                    filteredLines.map((line) => {
                      const current = safeNum(values[line.asn_line_id]);
                      const balance = safeNum(line.asn_qty) - current;
                      const hasMismatch = current !== safeNum(line.asn_qty);
                      const currentReason = reasons[line.asn_line_id];

                      return (
                        <tr
                          key={line.asn_line_id}
                          className={`hover:bg-gray-50 ${hasMismatch ? "bg-amber-50/40" : ""}`}
                        >
                          <td className="px-4 py-3 border-b">{line.line_no ?? "-"}</td>
                          <td className="px-4 py-3 border-b">{line.carton_no || "-"}</td>
                          <td className="px-4 py-3 border-b font-mono">{line.sku || "-"}</td>
                          <td className="px-4 py-3 border-b text-right">{line.asn_qty}</td>
                          <td className="px-4 py-3 border-b text-right">{current}</td>
                          <td
                            className={`px-4 py-3 border-b text-right font-medium ${
                              balance > 0 ? "text-amber-600" : balance < 0 ? "text-red-600" : "text-gray-400"
                            }`}
                          >
                            {balance}
                          </td>
                          <td className="px-4 py-3 border-b">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={current}
                              onChange={(e) => {
                                const newVal = safeNum(e.target.value);
                                setValues((prev) => ({ ...prev, [line.asn_line_id]: newVal }));
                                // Clear reason if now matches
                                if (newVal === safeNum(line.asn_qty)) {
                                  setReasons((prev) => {
                                    const next = { ...prev };
                                    delete next[line.asn_line_id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-28 border rounded px-3 py-2 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 border-b min-w-[220px]">
                            {hasMismatch ? (
                              <select
                                value={currentReason || ""}
                                onChange={(e) =>
                                  setReasons((prev) => ({
                                    ...prev,
                                    [line.asn_line_id]: e.target.value as VarianceReason,
                                  }))
                                }
                                className={`w-full rounded border px-2 py-1.5 text-xs ${
                                  !currentReason
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                <option value="">— select reason —</option>
                                {VARIANCE_REASONS.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            ) : currentReason ? (
                              // Previously saved reason, now matches
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
                                  reasonBadge(currentReason).cls
                                }`}
                              >
                                {reasonBadge(currentReason).label}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
