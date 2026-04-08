"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  dn_count: number;
  pallet_count: number;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString();
}

export default function OutboundShipmentPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Outbound / Shipment</h1>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">Shipment No</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">DN Count</th>
              <th className="px-4 py-3">Pallet Count</th>
              <th className="px-4 py-3">BL No</th>
              <th className="px-4 py-3">ETA</th>
              <th className="px-4 py-3">Created At</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  No shipment
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{row.shipment_no}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.dn_count}</td>
                  <td className="px-4 py-3">{row.pallet_count}</td>
                  <td className="px-4 py-3">{row.bl_no || "-"}</td>
                  <td className="px-4 py-3">{row.eta || "-"}</td>
                  <td className="px-4 py-3">{fmtDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/outbound/shipment/${row.id}`}
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