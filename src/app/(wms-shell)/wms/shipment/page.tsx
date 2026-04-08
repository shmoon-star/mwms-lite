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
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
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

  useEffect(() => {
    load();
  }, []);

  async function cancelShipment(id: string, shipmentNo: string) {
    const ok = confirm(
      `${shipmentNo} 을(를) Cancel 할까요?\n\n- pallet_box 해제\n- pallet CANCELLED\n- shipment CANCELLED`
    );
    if (!ok) return;

    setCancellingId(id);
    try {
      const res = await fetch(`/api/shipment/${id}/cancel`, {
        method: "POST",
      });

      const json = await res.json();

      if (!json?.ok) {
        alert(json?.error || "failed to cancel shipment");
        return;
      }

      await load();
    } catch (e: any) {
      alert(e?.message || "failed to cancel shipment");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shipment</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
          <Link
            href="/wms/dn"
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Go DN
          </Link>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-3">Shipment No</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">DN Count</th>
              <th className="px-3 py-3">Pallet Count</th>
              <th className="px-3 py-3">BL No</th>
              <th className="px-3 py-3">ETA</th>
              <th className="px-3 py-3">Created At</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  No shipment
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isCancelled =
                  String(row.status || "").toUpperCase() === "CANCELLED";
                const isBusy = cancellingId === row.id;

                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.shipment_no}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.dn_count}</td>
                    <td className="px-3 py-2">{row.pallet_count}</td>
                    <td className="px-3 py-2">{row.bl_no || "-"}</td>
                    <td className="px-3 py-2">{row.eta || "-"}</td>
                    <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                    <td className="px-3 py-2">
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
                          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
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