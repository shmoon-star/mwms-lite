"use client";

import { useState } from "react";

type AdjustmentReason = "DEFECT_DISPOSAL" | "COUNT_ADJUSTMENT";

const REASONS: { value: AdjustmentReason; label: string; hint: string }[] = [
  {
    value: "DEFECT_DISPOSAL",
    label: "Quality Defect - Disposal Pending",
    hint: "Damaged or defective items to be discarded. Qty must be negative.",
  },
  {
    value: "COUNT_ADJUSTMENT",
    label: "Physical Count Adjustment",
    hint: "Correction based on physical stock count. Positive or negative.",
  },
];

type AdjRow = {
  id: number;
  sku: string;
  qty: string;
  reason: AdjustmentReason | "";
  note: string;
};

let nextId = 1;

function emptyRow(): AdjRow {
  return { id: nextId++, sku: "", qty: "", reason: "", note: "" };
}

type ResultRow = {
  sku: string;
  qty: number;
  reason: string;
  new_qty_onhand: number;
};

export default function InventoryAdjustmentPage() {
  const [rows, setRows] = useState<AdjRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; message: string; results: ResultRow[] }
    | { ok: false; error: string }
    | null
  >(null);

  function updateRow(id: number, patch: Partial<AdjRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function reset() {
    nextId = 1;
    setRows([emptyRow()]);
    setResult(null);
  }

  async function handleSubmit() {
    setResult(null);

    // Validate
    for (const row of rows) {
      if (!row.sku.trim()) {
        setResult({ ok: false, error: "SKU is required for all rows." });
        return;
      }
      const qty = Number(row.qty);
      if (!row.qty || !Number.isFinite(qty) || qty === 0) {
        setResult({ ok: false, error: `Qty must be a non-zero number (SKU: ${row.sku}).` });
        return;
      }
      if (!row.reason) {
        setResult({ ok: false, error: `Select a reason for SKU: ${row.sku}.` });
        return;
      }
      if (row.reason === "DEFECT_DISPOSAL" && qty > 0) {
        setResult({
          ok: false,
          error: `"Quality Defect - Disposal Pending" requires a negative qty (SKU: ${row.sku}).`,
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => ({
            sku: r.sku.trim(),
            qty: Number(r.qty),
            reason: r.reason,
            note: r.note.trim(),
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setResult({ ok: false, error: json.error ?? "Adjustment failed" });
        return;
      }

      setResult({ ok: true, message: json.message, results: json.results });
      setRows([emptyRow()]);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  const allValid = rows.every(
    (r) =>
      r.sku.trim() &&
      r.qty &&
      Number.isFinite(Number(r.qty)) &&
      Number(r.qty) !== 0 &&
      r.reason
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <div className="text-sm text-slate-500 mb-1">Inventory / Adjustment</div>
        <h1 className="text-2xl font-bold">Inventory Adjustment</h1>
        <p className="text-sm text-slate-500 mt-1">
          Apply stock corrections for quality defects or physical count discrepancies.
        </p>
      </div>

      {/* Reason Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REASONS.map((r) => (
          <div key={r.value} className="rounded-xl border p-4 bg-white">
            <div className="text-sm font-semibold text-slate-800">{r.label}</div>
            <div className="text-xs text-slate-500 mt-1">{r.hint}</div>
          </div>
        ))}
      </div>

      {/* Adjustment Table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <div className="font-medium">Adjustment Lines</div>
          <button
            type="button"
            onClick={addRow}
            className="text-sm px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            + Add Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-3 py-3 font-medium w-40">SKU</th>
                <th className="text-right px-3 py-3 font-medium w-28">Qty</th>
                <th className="text-left px-3 py-3 font-medium w-64">Reason</th>
                <th className="text-left px-3 py-3 font-medium">Note (optional)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const qtyNum = Number(row.qty);
                const qtyInvalid = row.qty !== "" && (!Number.isFinite(qtyNum) || qtyNum === 0);
                const disposalNegativeErr =
                  row.reason === "DEFECT_DISPOSAL" && row.qty !== "" && qtyNum > 0;

                return (
                  <tr key={row.id} className="border-b">
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={row.sku}
                        onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                        placeholder="e.g. SKU001"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={row.qty}
                        onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                        placeholder="±qty"
                        className={`w-full rounded border px-2 py-1.5 text-sm text-right ${
                          qtyInvalid || disposalNegativeErr
                            ? "border-red-300 bg-red-50"
                            : "border-slate-300"
                        }`}
                      />
                      {disposalNegativeErr && (
                        <div className="text-xs text-red-600 mt-0.5">Must be negative for disposal</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.reason}
                        onChange={(e) =>
                          updateRow(row.id, { reason: e.target.value as AdjustmentReason | "" })
                        }
                        className={`w-full rounded border px-2 py-1.5 text-sm ${
                          !row.reason ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300"
                        }`}
                      >
                        <option value="">— select reason —</option>
                        {REASONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => updateRow(row.id, { note: e.target.value })}
                        placeholder="Optional memo"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-lg leading-none"
                        title="Remove row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !allValid}
          className={`px-5 py-2 rounded-lg text-sm font-semibold ${
            submitting || !allValid
              ? "bg-slate-300 text-white cursor-not-allowed"
              : "bg-black text-white hover:bg-slate-800"
          }`}
        >
          {submitting ? "Applying..." : "Apply Adjustment"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50"
        >
          Reset
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl border p-4 ${
            result.ok
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          {result.ok ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-green-800">✅ {result.message}</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-green-200">
                    <th className="text-left py-2 pr-4 font-medium text-green-800">SKU</th>
                    <th className="text-right py-2 pr-4 font-medium text-green-800">Qty Applied</th>
                    <th className="text-left py-2 pr-4 font-medium text-green-800">Reason</th>
                    <th className="text-right py-2 font-medium text-green-800">New Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.sku} className="border-b border-green-100">
                      <td className="py-2 pr-4 font-mono">{r.sku}</td>
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${
                          r.qty < 0 ? "text-red-700" : "text-green-700"
                        }`}
                      >
                        {r.qty > 0 ? `+${r.qty}` : r.qty}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{r.reason}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">{r.new_qty_onhand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-red-700">❌ {result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
