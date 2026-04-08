"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  atd: string | null;
  ata: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  dn_count: number;
  pallet_count: number;
  total_boxes: number;
  total_qty: number;
  total_weight: number;
  total_cbm: number;
  ship_from_summary: string;
  ship_to_summary: string;
  dn_summary: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusBadgeClass(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CANCELLED") return "bg-red-100 text-red-700 border-red-200";
  if (s === "CLOSED") return "bg-gray-100 text-gray-700 border-gray-200";
  if (s === "PALLETIZING") return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "OPEN") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default function ScmShipmentPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  async function load() {
    setLoading(true);
    try {
      const qs =
        statusFilter === "ALL"
          ? "?status=ALL"
          : `?status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(`/api/scm/shipment${qs}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!json?.ok) {
        throw new Error(json?.error || "failed to load SCM shipment list");
      }

      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e: any) {
      alert(e?.message || "failed to load SCM shipment list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const joined = [
        row.shipment_no,
        row.status,
        row.ship_from_summary || "",
        row.ship_to_summary || "",
        row.dn_summary || "",
        row.bl_no || "",
        row.eta || "",
        row.etd || "",
        row.atd || "",
        row.ata || "",
        row.vessel_name || "",
        row.container_no || "",
        row.remark || "",
      ]
        .join(" ")
        .toLowerCase();

      return joined.includes(q);
    });
  }, [rows, keyword]);

  const summary = useMemo(() => {
    return {
      shipment_count: filteredRows.length,
      dn_count: filteredRows.reduce((sum, row) => sum + safeNum(row.dn_count), 0),
      pallet_count: filteredRows.reduce(
        (sum, row) => sum + safeNum(row.pallet_count),
        0
      ),
      total_boxes: filteredRows.reduce(
        (sum, row) => sum + safeNum(row.total_boxes),
        0
      ),
      total_qty: filteredRows.reduce((sum, row) => sum + safeNum(row.total_qty), 0),
      total_weight: filteredRows.reduce(
        (sum, row) => sum + safeNum(row.total_weight),
        0
      ),
      total_cbm: filteredRows.reduce((sum, row) => sum + safeNum(row.total_cbm), 0),
    };
  }, [filteredRows]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">SCM / Shipment</div>
          <h1 className="mt-1 text-2xl font-semibold">SCM Shipment</h1>
          <p className="mt-1 text-sm text-gray-500">
            WMS shipment 결과를 조회하고 선적 공유 정보를 관리합니다.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
          <Link
            href="/wms/shipment"
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Go WMS Shipment
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Shipment</div>
          <div className="mt-1 text-2xl font-semibold">{summary.shipment_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">DN</div>
          <div className="mt-1 text-2xl font-semibold">{summary.dn_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Pallet</div>
          <div className="mt-1 text-2xl font-semibold">{summary.pallet_count}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Boxes</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_boxes}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Qty</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total_qty}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs text-gray-500">Weight / CBM</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary.total_weight} / {summary.total_cbm}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-sm font-medium">Status</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="OPEN">OPEN</option>
              <option value="PALLETIZING">PALLETIZING</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          <div className="flex-1">
            <div className="mb-1 text-sm font-medium">Keyword</div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Shipment / DN / Ship From / Ship To / Vessel / Container"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-3">Shipment No</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Ship From</th>
              <th className="px-3 py-3">Ship To</th>
              <th className="px-3 py-3">DN Summary</th>
              <th className="px-3 py-3">Pallet</th>
              <th className="px-3 py-3">Boxes</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Weight</th>
              <th className="px-3 py-3">CBM</th>
              <th className="px-3 py-3">BL No</th>
              <th className="px-3 py-3">ETD</th>
              <th className="px-3 py-3">ETA</th>
              <th className="px-3 py-3">ATD</th>
              <th className="px-3 py-3">ATA</th>
              <th className="px-3 py-3">Vessel</th>
              <th className="px-3 py-3">Container</th>
              <th className="px-3 py-3">Created At</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={19} className="px-3 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={19} className="px-3 py-8 text-center text-gray-500">
                  No shipment
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.shipment_no}</td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                        statusBadgeClass(row.status),
                      ].join(" ")}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.ship_from_summary}</td>
                  <td className="px-3 py-2">{row.ship_to_summary}</td>
                  <td className="px-3 py-2">{row.dn_summary}</td>
                  <td className="px-3 py-2">{row.pallet_count}</td>
                  <td className="px-3 py-2">{row.total_boxes}</td>
                  <td className="px-3 py-2">{row.total_qty}</td>
                  <td className="px-3 py-2">{row.total_weight}</td>
                  <td className="px-3 py-2">{row.total_cbm}</td>
                  <td className="px-3 py-2">{row.bl_no || "-"}</td>
                  <td className="px-3 py-2">{row.etd || "-"}</td>
                  <td className="px-3 py-2">{row.eta || "-"}</td>
                  <td className="px-3 py-2">{row.atd || "-"}</td>
                  <td className="px-3 py-2">{row.ata || "-"}</td>
                  <td className="px-3 py-2">{row.vessel_name || "-"}</td>
                  <td className="px-3 py-2">{row.container_no || "-"}</td>
                  <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/scm/shipment/${row.id}`}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}