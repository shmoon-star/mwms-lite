"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

type DnItem = {
  id: string;
  dn_no: string;
  status: string;
};

type Row = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  vessel_name: string | null;
  container_no: string | null;
  created_at: string;
  closed_at: string | null;
  dn_list: DnItem[];
  dn_count: number;
  pallet_count: number;
  box_count: number;
  total_weight_kg: number | null;
  total_packed_qty: number;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try { return new Date(v).toLocaleString(); } catch { return v; }
}

function statusBadge(status: string) {
  const s = String(status || "").toUpperCase();
  const cls =
    s === "PALLETIZING" ? "bg-blue-100 text-blue-700 border-blue-200" :
    s === "SHIPPED" || s === "CLOSED" ? "bg-green-100 text-green-700 border-green-200" :
    s === "CANCELLED" ? "bg-gray-100 text-gray-500 border-gray-200" :
    "bg-amber-50 text-amber-700 border-amber-200"; // OPEN
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded border ${cls}`}>
      {status}
    </span>
  );
}

function dnStatusColor(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "SHIPPED" || s === "CONFIRMED") return "bg-green-100 text-green-700 border-green-200";
  if (s === "PACKED" || s === "PACKING") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function isClosedShipment(status: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "CLOSED" || s === "SHIPPED" || s === "CONFIRMED" || s === "CANCELLED";
}

function SummaryCard({
  loading,
  total, totalDns,
  open, openDns,
  closed, closedDns,
}: {
  loading: boolean;
  total: number; totalDns: number;
  open: number; openDns: number;
  closed: number; closedDns: number;
}) {
  return (
    <div style={{
      border: "1px solid #ddd", borderRadius: 8, padding: "14px 16px",
      minWidth: 220, background: "#fff", display: "inline-block",
    }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, fontWeight: 500 }}>Shipment</div>

      {loading ? (
        <div style={{ fontSize: 28, fontWeight: 700, color: "#d1d5db" }}>—</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Shipments</span>
          <span style={{ fontSize: 13, color: "#d1d5db" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{totalDns}</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>DNs</span>
        </div>
      )}

      <div style={{ borderTop: "1px solid #f3f4f6", margin: "10px 0 8px" }} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Open</span>
        {loading ? <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span> : (
          <>
            <strong style={{ fontSize: 13, color: "#111827" }}>{open}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Shipments</span>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
            <strong style={{ fontSize: 13, color: "#111827" }}>{openDns}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>DNs</span>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Closed</span>
        {loading ? <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span> : (
          <>
            <strong style={{ fontSize: 13, color: "#111827" }}>{closed}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Shipments</span>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
            <strong style={{ fontSize: 13, color: "#111827" }}>{closedDns}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>DNs</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function WmsShipmentPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/shipment/open", { cache: "no-store" });
      const json = await res.json();
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function cancelShipment(id: string, shipmentNo: string) {
    const ok = confirm(`${shipmentNo} 을(를) Cancel 할까요?\n\n- pallet_box 해제\n- pallet CANCELLED\n- shipment CANCELLED`);
    if (!ok) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/shipment/${id}/cancel`, { method: "POST" });
      const json = await res.json();
      if (!json?.ok) { alert(json?.error || "failed to cancel shipment"); return; }
      await load();
    } catch (e: any) {
      alert(e?.message || "failed to cancel shipment");
    } finally {
      setCancellingId("");
    }
  }

  const openRows = rows.filter((r) => !isClosedShipment(r.status));
  const closedRows = rows.filter((r) => isClosedShipment(r.status));
  const summary = {
    total: rows.length,
    totalDns: rows.reduce((s, r) => s + r.dn_count, 0),
    open: openRows.length,
    openDns: openRows.reduce((s, r) => s + r.dn_count, 0),
    closed: closedRows.length,
    closedDns: closedRows.reduce((s, r) => s + r.dn_count, 0),
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shipment</h1>
        <div className="flex gap-2">
          <button onClick={load} className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
            Refresh
          </button>
          <Link href="/wms/dn" className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
            Go DN
          </Link>
        </div>
      </div>

      {/* Summary card */}
      <SummaryCard loading={loading} {...summary} />

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Shipment No</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">DNs</th>
              <th className="px-4 py-3 text-right">Pallets</th>
              <th className="px-4 py-3 text-right">Boxes</th>
              <th className="px-4 py-3 text-right">Weight (kg)</th>
              <th className="px-4 py-3 text-right">Packed Qty</th>
              <th className="px-4 py-3">BL No</th>
              <th className="px-4 py-3">ETA</th>
              <th className="px-4 py-3">ETD</th>
              <th className="px-4 py-3">Vessel</th>
              <th className="px-4 py-3">Container</th>
              <th className="px-4 py-3">Created At</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-gray-400">Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-gray-400">No shipment</td>
              </tr>
            ) : (
              rows.map((row) => {
                const isCancelled = String(row.status || "").toUpperCase() === "CANCELLED";
                const isBusy = cancellingId === row.id;

                return (
                  <tr key={row.id} className="border-t hover:bg-gray-50/50">
                    {/* Shipment No */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/wms/shipment/${row.id}`}
                        className="font-semibold hover:underline text-gray-900"
                      >
                        {row.shipment_no}
                      </Link>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>

                    {/* DNs — inline tags instead of just count */}
                    <td className="px-4 py-3 max-w-[260px]">
                      {row.dn_list.length === 0 ? (
                        <span className="text-gray-300 text-xs">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.dn_list.map((dn) => (
                            <Link
                              key={dn.id}
                              href={`/wms/dn/${dn.id}`}
                              className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border hover:opacity-80 ${dnStatusColor(dn.status)}`}
                              title={dn.status}
                            >
                              {dn.dn_no}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Pallets */}
                    <td className="px-4 py-3 text-right">
                      {row.pallet_count > 0 ? (
                        <span className="font-medium">{row.pallet_count}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Boxes */}
                    <td className="px-4 py-3 text-right">
                      {row.box_count > 0 ? (
                        <span className="font-medium">{row.box_count}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Weight */}
                    <td className="px-4 py-3 text-right">
                      {row.total_weight_kg != null ? (
                        <span className="font-medium">{row.total_weight_kg.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Packed Qty */}
                    <td className="px-4 py-3 text-right">
                      {row.total_packed_qty > 0 ? (
                        <span className="font-medium">{row.total_packed_qty.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* BL No */}
                    <td className="px-4 py-3">
                      {row.bl_no ? (
                        <span className="font-mono text-xs">{row.bl_no}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* ETA */}
                    <td className="px-4 py-3 text-xs">
                      {row.eta ?? <span className="text-gray-300">-</span>}
                    </td>

                    {/* ETD */}
                    <td className="px-4 py-3 text-xs">
                      {row.etd ?? <span className="text-gray-300">-</span>}
                    </td>

                    {/* Vessel */}
                    <td className="px-4 py-3 text-xs">
                      {row.vessel_name ?? <span className="text-gray-300">-</span>}
                    </td>

                    {/* Container */}
                    <td className="px-4 py-3 text-xs font-mono">
                      {row.container_no ?? <span className="text-gray-300">-</span>}
                    </td>

                    {/* Created At */}
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDateYmd(row.created_at) || "-"}</td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/wms/shipment/${row.id}`}
                          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => cancelShipment(row.id, row.shipment_no)}
                          disabled={isCancelled || isBusy}
                          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
                        >
                          {isBusy ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
