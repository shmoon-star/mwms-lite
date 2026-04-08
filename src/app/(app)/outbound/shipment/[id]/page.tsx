"use client";

import { useEffect, useState } from "react";

type ShipmentHeader = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string;
  closed_at: string | null;
};

type DnRow = {
  id: string;
  dn_no: string;
  status: string;
  created_at: string | null;
  ship_to?: string | null;
};

type PalletRow = {
  id: string;
  pallet_no: string;
  status: string;
  total_boxes: number;
  total_qty: number;
  total_weight: number;
  total_cbm: number;
  created_at: string;
  closed_at: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleString();
}

export default function OutboundShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [shipmentId, setShipmentId] = useState("");
  const [header, setHeader] = useState<ShipmentHeader | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((v) => setShipmentId(v.id));
  }, [params]);

  async function load(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shipment/${id}`, { cache: "no-store" });
      const json = await res.json();

      setHeader(json?.header || null);
      setDns(Array.isArray(json?.dns) ? json.dns : []);
      setPallets(Array.isArray(json?.pallets) ? json.pallets : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!shipmentId) return;
    load(shipmentId);
  }, [shipmentId]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!header) {
    return <div className="p-6">Shipment not found</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{header.shipment_no}</h1>
        <div className="mt-1 text-sm text-gray-600">
          Status: {header.status}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">Shipment Info</h2>
          <div className="space-y-2 text-sm">
            <div>BL No: {header.bl_no || "-"}</div>
            <div>ETA: {header.eta || "-"}</div>
            <div>ETD: {header.etd || "-"}</div>
            <div>Vessel: {header.vessel_name || "-"}</div>
            <div>Container: {header.container_no || "-"}</div>
            <div>Seal No: {header.seal_no || "-"}</div>
            <div>Remark: {header.remark || "-"}</div>
            <div>Created At: {fmtDate(header.created_at)}</div>
            <div>Closed At: {fmtDate(header.closed_at)}</div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-medium">DN</h2>
          <div className="space-y-2 text-sm">
            {dns.length === 0 ? (
              <div className="text-gray-500">No DN</div>
            ) : (
              dns.map((row) => (
                <div key={row.id} className="rounded border p-2">
                  <div className="font-medium">{row.dn_no}</div>
                  <div>Status: {row.status || "-"}</div>
                  <div>Ship To: {row.ship_to || "-"}</div>
                  <div>Created: {fmtDate(row.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-medium">Pallet</h2>

        {pallets.length === 0 ? (
          <div className="text-sm text-gray-500">No pallet</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-3">Pallet No</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Boxes</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">CBM</th>
                  <th className="px-3 py-3">Created At</th>
                </tr>
              </thead>
              <tbody>
                {pallets.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.pallet_no}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.total_boxes}</td>
                    <td className="px-3 py-2">{row.total_qty}</td>
                    <td className="px-3 py-2">{row.total_weight}</td>
                    <td className="px-3 py-2">{row.total_cbm}</td>
                    <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}