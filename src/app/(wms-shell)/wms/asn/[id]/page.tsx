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
};

type WmsAsnDetail = {
  id: string;
  asn_no: string | null;
  po_no: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  gr_id: string | null;
  gr_no: string | null;
  gr_status: string | null;
  lines: WmsAsnLine[];
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
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
  const [boxFilter, setBoxFilter] = useState("");

  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    params.then((p) => setAsnId(p.id));
  }, [params]);

  async function loadDetail(id: string) {
    try {
      setLoading(true);
      setError("");
      setSaveMessage("");

      const res = await fetch(`/api/wms/asn/${id}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load WMS ASN detail");
      }

      const asn = json.asn as WmsAsnDetail;
      setDetail(asn);

      const nextValues: Record<string, number> = {};
      for (const line of asn.lines || []) {
        nextValues[line.asn_line_id] = safeNum(line.received_qty);
      }
      setValues(nextValues);
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
      const haystack = [
        line.carton_no,
        line.sku,
        String(line.line_no ?? ""),
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [detail, boxFilter]);

  async function handleSave() {
    try {
      if (!asnId || !detail) return;

      setSaving(true);
      setSaveMessage("");

      const payload = {
        lines: detail.lines.map((line) => ({
          asn_line_id: line.asn_line_id,
          received_qty: safeNum(values[line.asn_line_id]),
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

      setSaveMessage(`Saved. ${json.gr_no || ""}`.trim());
      await loadDetail(asnId);
    } catch (e: any) {
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

        <div className="flex gap-2 flex-wrap">
          <Link
            href="/wms/asn"
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            Back
          </Link>

          {detail?.gr_id ? (
            <Link
              href={`/inbound/gr/${detail.gr_id}`}
              className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
            >
              Open GR
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => asnId && looksLikeUuid(asnId) && loadDetail(asnId)}
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !detail}
            className="px-3 py-2 rounded border bg-black text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Received Qty"}
          </button>
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

          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">ASN Qty</div>
              <div className="text-2xl font-semibold mt-1">{totals.asn_qty}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">Received Qty</div>
              <div className="text-2xl font-semibold mt-1">{totals.received_qty}</div>
            </div>
            <div className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500">Balance Qty</div>
              <div className="text-2xl font-semibold mt-1">{totals.balance_qty}</div>
            </div>
          </div>

          {saveMessage ? (
            <div className="text-sm text-gray-700">{saveMessage}</div>
          ) : null}

          <div className="border rounded bg-white overflow-hidden">
            <div className="px-4 py-3 border-b font-medium">ASN Lines</div>

            <div className="px-4 py-3 border-b bg-white">
              <label className="block text-xs text-gray-500 mb-2">
                Search Box / SKU / Line
              </label>
              <input
                value={boxFilter}
                onChange={(e) => setBoxFilter(e.target.value)}
                placeholder="e.g. BOX-003 / SKU001 / 3"
                className="w-full md:w-72 border rounded px-3 py-2"
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
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        No lines found.
                      </td>
                    </tr>
                  ) : (
                    filteredLines.map((line) => {
                      const current = safeNum(values[line.asn_line_id]);
                      const balance = safeNum(line.asn_qty) - current;

                      return (
                        <tr key={line.asn_line_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 border-b">{line.line_no ?? "-"}</td>
                          <td className="px-4 py-3 border-b">{line.carton_no || "-"}</td>
                          <td className="px-4 py-3 border-b">{line.sku || "-"}</td>
                          <td className="px-4 py-3 border-b text-right">{line.asn_qty}</td>
                          <td className="px-4 py-3 border-b text-right">{current}</td>
                          <td className="px-4 py-3 border-b text-right">{balance}</td>
                          <td className="px-4 py-3 border-b">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={current}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [line.asn_line_id]: safeNum(e.target.value),
                                }))
                              }
                              className="w-28 border rounded px-3 py-2"
                            />
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