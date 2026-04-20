"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type WmsAsnLine = {
  asn_line_id: string;
  line_no: number | null;
  carton_no: string | null;
  sku: string | null;
  sku_name?: string | null;
  brand?: string | null;
  barcode?: string | null;
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
  const [expandedCartons, setExpandedCartons] = useState<Record<string, boolean>>({});
  const [showOnlyMix, setShowOnlyMix] = useState(false);

  // Carton Finder (SKU scan) state
  const [scanInput, setScanInput] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [scanError, setScanError] = useState("");

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

  // Carton 분류: SINGLE (한 SKU만) vs MIX (2개 이상 SKU)
  const cartonBreakdown = useMemo(() => {
    if (!detail) {
      return {
        cartons: [] as {
          carton_no: string;
          sku_count: number;
          total_qty: number;
          skus: { sku: string; qty: number }[];
          type: "SINGLE" | "MIX";
        }[],
        summary: { total: 0, single: 0, mix: 0 },
      };
    }

    const map = new Map<
      string,
      { carton_no: string; skuMap: Map<string, number> }
    >();

    for (const line of detail.lines || []) {
      const carton = (line.carton_no || "").trim();
      if (!carton) continue;
      const sku = (line.sku || "").trim();
      if (!sku) continue;

      if (!map.has(carton)) {
        map.set(carton, { carton_no: carton, skuMap: new Map() });
      }
      const entry = map.get(carton)!;
      const prev = entry.skuMap.get(sku) || 0;
      entry.skuMap.set(sku, prev + safeNum(line.asn_qty));
    }

    const cartons = Array.from(map.values())
      .map((c) => {
        const skus = Array.from(c.skuMap.entries())
          .map(([sku, qty]) => ({ sku, qty }))
          .sort((a, b) => b.qty - a.qty);
        const total_qty = skus.reduce((s, x) => s + x.qty, 0);
        return {
          carton_no: c.carton_no,
          sku_count: skus.length,
          total_qty,
          skus,
          type: (skus.length > 1 ? "MIX" : "SINGLE") as "MIX" | "SINGLE",
        };
      })
      .sort((a, b) => {
        // MIX 먼저, 그 안에서는 SKU 수 많은 순
        if (a.type !== b.type) return a.type === "MIX" ? -1 : 1;
        return b.sku_count - a.sku_count;
      });

    const summary = {
      total: cartons.length,
      single: cartons.filter((c) => c.type === "SINGLE").length,
      mix: cartons.filter((c) => c.type === "MIX").length,
    };

    return { cartons, summary };
  }, [detail]);

  // SKU → Carton 역인덱스 (SKU 스캔하면 어느 박스에 몇 개 있는지 빠르게 조회)
  const skuDirectory = useMemo(() => {
    const dir = new Map<
      string,
      {
        sku: string;
        name: string | null;
        brand: string | null;
        barcode: string | null;
        total_qty: number;
        locations: { carton_no: string; qty: number; is_mix: boolean; sku_count: number }[];
      }
    >();

    if (!detail) return dir;

    const cartonMeta = new Map<string, { is_mix: boolean; sku_count: number }>();
    for (const c of cartonBreakdown.cartons) {
      cartonMeta.set(c.carton_no, { is_mix: c.type === "MIX", sku_count: c.sku_count });
    }

    for (const line of detail.lines || []) {
      const sku = (line.sku || "").trim();
      const carton = (line.carton_no || "").trim();
      if (!sku || !carton) continue;

      if (!dir.has(sku)) {
        dir.set(sku, {
          sku,
          name: line.sku_name || null,
          brand: line.brand || null,
          barcode: line.barcode || null,
          total_qty: 0,
          locations: [],
        });
      }
      const entry = dir.get(sku)!;
      const qty = safeNum(line.asn_qty);
      entry.total_qty += qty;

      const meta = cartonMeta.get(carton) || { is_mix: false, sku_count: 1 };
      const existing = entry.locations.find((loc) => loc.carton_no === carton);
      if (existing) {
        existing.qty += qty;
      } else {
        entry.locations.push({
          carton_no: carton,
          qty,
          is_mix: meta.is_mix,
          sku_count: meta.sku_count,
        });
      }
    }

    // sort locations by qty DESC
    for (const entry of dir.values()) {
      entry.locations.sort((a, b) => b.qty - a.qty);
    }

    return dir;
  }, [detail, cartonBreakdown]);

  const selectedSkuInfo = useMemo(() => {
    if (!selectedSku) return null;
    return skuDirectory.get(selectedSku) || null;
  }, [selectedSku, skuDirectory]);

  function handleScanSubmit() {
    const q = scanInput.trim();
    if (!q) return;
    setScanError("");

    // 1. SKU exact match
    if (skuDirectory.has(q)) {
      setSelectedSku(q);
      setScanInput("");
      return;
    }

    // 2. barcode match (products.barcode 필드로 들어온 경우)
    for (const [sku, info] of skuDirectory.entries()) {
      if (info.barcode && info.barcode === q) {
        setSelectedSku(sku);
        setScanInput("");
        return;
      }
    }

    setScanError(`"${q}" — 현재 ASN에서 찾을 수 없습니다.`);
    setSelectedSku(null);
  }

  function handleOpenLabels() {
    if (!selectedSku || !asnId) return;
    const url = `/wms/asn/${asnId}/picking-labels?sku=${encodeURIComponent(selectedSku)}`;
    window.open(url, "_blank");
  }

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

          {/* Carton Breakdown — SINGLE vs MIX 분류 */}
          {cartonBreakdown.cartons.length > 0 && (
            <div className="border rounded bg-white overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium">📦 Carton Breakdown</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    박스에 담긴 SKU 종류 수로 분류 — MIX 박스는 picking 시 분리 필요
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600 px-2 py-1 rounded bg-gray-100 border">
                    총 {cartonBreakdown.summary.total}박스
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-green-50 border border-green-200 text-green-700 font-medium">
                    🟢 SINGLE {cartonBreakdown.summary.single}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-orange-50 border border-orange-200 text-orange-700 font-medium">
                    🟠 MIX {cartonBreakdown.summary.mix}
                  </span>
                  <label className="text-xs text-gray-600 flex items-center gap-1 ml-2">
                    <input
                      type="checkbox"
                      checked={showOnlyMix}
                      onChange={(e) => setShowOnlyMix(e.target.checked)}
                    />
                    MIX만 보기
                  </label>
                </div>
              </div>

              <div className="overflow-auto max-h-[420px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 border-b w-32">Type</th>
                      <th className="text-left px-4 py-2 border-b">Carton No</th>
                      <th className="text-right px-4 py-2 border-b w-24">SKU 종류</th>
                      <th className="text-right px-4 py-2 border-b w-28">Total Qty</th>
                      <th className="text-center px-4 py-2 border-b w-24">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartonBreakdown.cartons
                      .filter((c) => !showOnlyMix || c.type === "MIX")
                      .map((c) => {
                        const isMix = c.type === "MIX";
                        const isExpanded = !!expandedCartons[c.carton_no];
                        return (
                          <Fragment key={c.carton_no}>
                            <tr className={`border-b ${isMix ? "bg-orange-50/40" : ""}`}>
                              <td className="px-4 py-2">
                                {isMix ? (
                                  <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 border border-orange-200 font-semibold">
                                    🟠 MIX
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 border border-green-200 font-semibold">
                                    🟢 SINGLE
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 font-mono text-xs">{c.carton_no}</td>
                              <td className="px-4 py-2 text-right font-semibold">
                                {c.sku_count}
                              </td>
                              <td className="px-4 py-2 text-right">{c.total_qty}</td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCartons((prev) => ({
                                      ...prev,
                                      [c.carton_no]: !prev[c.carton_no],
                                    }))
                                  }
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {isExpanded ? "접기" : `보기 (${c.sku_count})`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={c.carton_no + "-detail"} className="bg-gray-50">
                                <td colSpan={5} className="px-4 py-2">
                                  <div className="text-xs text-gray-600 mb-2">
                                    Carton <b className="font-mono">{c.carton_no}</b> 안의 SKU
                                    내역:
                                  </div>
                                  <table className="min-w-full text-xs bg-white border rounded">
                                    <thead className="bg-white">
                                      <tr>
                                        <th className="text-left px-3 py-1.5 border-b">SKU</th>
                                        <th className="text-right px-3 py-1.5 border-b w-24">
                                          Qty
                                        </th>
                                        <th className="text-right px-3 py-1.5 border-b w-20">
                                          비중
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.skus.map((s) => (
                                        <tr key={s.sku} className="border-b">
                                          <td className="px-3 py-1.5 font-mono">{s.sku}</td>
                                          <td className="px-3 py-1.5 text-right">{s.qty}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-500">
                                            {c.total_qty > 0
                                              ? ((s.qty / c.total_qty) * 100).toFixed(1)
                                              : "0"}
                                            %
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Carton Finder — SKU 스캔 → 어느 박스에 몇 개 있는지 조회 */}
          {skuDirectory.size > 0 && (
            <div className="border rounded bg-white overflow-hidden">
              <div className="px-4 py-3 border-b">
                <div className="font-medium">📍 Carton Finder (SKU 위치 조회)</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  SKU 바코드 스캔 또는 입력 후 Enter — 해당 SKU가 들어있는 박스 목록 (qty DESC)
                </div>
              </div>

              <div className="px-4 py-3 border-b bg-gray-50">
                <div className="flex gap-2 flex-wrap items-center">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScanSubmit();
                      }
                    }}
                    placeholder="바코드 스캔 또는 SKU 입력"
                    className="flex-1 min-w-[240px] border rounded px-3 py-2 text-sm font-mono"
                    autoFocus={false}
                  />
                  <button
                    type="button"
                    onClick={handleScanSubmit}
                    className="px-4 py-2 rounded border bg-white hover:bg-gray-100 text-sm"
                  >
                    조회
                  </button>
                  {selectedSku && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSku(null);
                        setScanInput("");
                        setScanError("");
                      }}
                      className="px-3 py-2 rounded border bg-white hover:bg-gray-100 text-sm text-gray-600"
                    >
                      초기화
                    </button>
                  )}
                </div>
                {scanError && (
                  <div className="mt-2 text-xs text-red-600">{scanError}</div>
                )}
              </div>

              {selectedSkuInfo && (
                <div>
                  {/* SKU 정보 헤더 */}
                  <div className="px-4 py-3 border-b bg-white flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="font-mono text-base font-semibold">{selectedSkuInfo.sku}</div>
                      {(selectedSkuInfo.name || selectedSkuInfo.brand) && (
                        <div className="text-sm text-gray-700 mt-0.5">
                          {selectedSkuInfo.name || ""}
                          {selectedSkuInfo.brand ? (
                            <span className="text-gray-500 ml-2">({selectedSkuInfo.brand})</span>
                          ) : null}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        총 <b className="text-gray-900">{selectedSkuInfo.total_qty}개</b> / {selectedSkuInfo.locations.length}개 박스에 분산
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenLabels}
                      className="px-4 py-2 rounded border bg-black text-white hover:bg-gray-800 text-sm"
                    >
                      🖨️ 피킹 라벨 출력 (1장)
                    </button>
                  </div>

                  {/* 박스별 분포 */}
                  <div className="overflow-auto max-h-[360px]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 border-b w-24">Type</th>
                          <th className="text-left px-4 py-2 border-b">Carton No</th>
                          <th className="text-right px-4 py-2 border-b w-28">이 박스 Qty</th>
                          <th className="text-right px-4 py-2 border-b w-32">박스 내 SKU 종류</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSkuInfo.locations.map((loc) => (
                          <tr key={loc.carton_no} className={`border-b ${loc.is_mix ? "bg-orange-50/40" : ""}`}>
                            <td className="px-4 py-2">
                              {loc.is_mix ? (
                                <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800 border border-orange-200 font-semibold">
                                  🟠 MIX
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 border border-green-200 font-semibold">
                                  🟢 SINGLE
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{loc.carton_no}</td>
                            <td className="px-4 py-2 text-right font-semibold">{loc.qty}</td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {loc.is_mix ? `${loc.sku_count}종` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-2" colSpan={2}>
                            총계
                          </td>
                          <td className="px-4 py-2 text-right">{selectedSkuInfo.total_qty}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

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
