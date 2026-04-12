"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

type DnRow = {
  id: string;
  dn_no: string;
  status: string;
  qty_ordered: number;
  qty_shipped: number;
  balance: number;
  created_at: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
};

type Summary = {
  total_dn: number;
  open_dn: number;
  closed_dn: number;
  total_ordered: number;
  total_shipped: number;
  total_balance: number;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export default function WmsDnPage() {
  const [items, setItems] = useState<DnRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creatingShipment, setCreatingShipment] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll(ids: string[]) {
    const validIds = ids.filter(Boolean);
    const allSelected =
      validIds.length > 0 && validIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !validIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...validIds])));
    }
  }

  async function createShipment() {
    if (!selectedIds.length) {
      alert("Select DN first");
      return;
    }

    setCreatingShipment(true);
    try {
      const res = await fetch("/api/shipment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dn_ids: selectedIds }),
      });

      const json = await res.json();

      console.log("create shipment result:", json);

      if (!json?.ok) {
        alert(json?.error || "failed to create shipment");
        return;
      }

      const shipmentId =
  json?.shipment?.id ||
  json?.id ||
  json?.data?.id;
      if (!shipmentId) {
        alert("shipment id missing");
        return;
      }

      window.location.href = `/wms/shipment/${shipmentId}`;
    } finally {
      setCreatingShipment(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/wms/monitor/dn?view=open", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load Open DN");
      }

      setSummary(json.summary || null);
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      alert(e?.message || "Failed to load Open DN");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;

    return items.filter((row) =>
      [row.dn_no, row.status].join(" ").toLowerCase().includes(q)
    );
  }, [items, keyword]);

  useEffect(() => {
    const visibleIds = filtered.map((x) => x.id);
    setSelectedIds((prev) => prev.filter((id) => visibleIds.includes(id)));
  }, [keyword, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">WMS / Open DN</div>
          <h1 className="mt-1 text-2xl font-semibold">Open DN</h1>
          <p className="mt-1 text-sm text-gray-500">출고 작업용 Open DN 목록</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500">
            Selected: {selectedIds.length}
          </div>

          <button
            onClick={createShipment}
            disabled={creatingShipment || selectedIds.length === 0}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {creatingShipment ? "Creating..." : "Create Shipment"}
          </button>

          <button
            onClick={load}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Open DN</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.open_dn ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Ordered</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_ordered ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Shipped</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_shipped ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Balance</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_balance ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Total DN</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_dn ?? 0}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-medium">Keyword</div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="DN No / Status"
          className="w-[320px] rounded border px-3 py-2 text-sm"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-medium">Open DN List</div>
          <div className="text-sm text-gray-500">
            Filtered: {filtered.length}
          </div>
        </div>

        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 &&
                    filtered.every((row) => selectedIds.includes(row.id))
                  }
                  onChange={() => toggleSelectAll(filtered.map((row) => row.id))}
                />
              </th>
              <th className="px-3 py-2">DN No</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ordered</th>
              <th className="px-3 py-2">Shipped</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Planned GI</th>
              <th className="px-3 py-2">Planned Ship</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  No open DN
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{row.dn_no}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.qty_ordered}</td>
                  <td className="px-3 py-2">{row.qty_shipped}</td>
                  <td className="px-3 py-2">{row.balance}</td>
                  <td className="px-3 py-2">{fmtDate(row.planned_gi_date)}</td>
                  <td className="px-3 py-2">{fmtDate(row.planned_delivery_date)}</td>
                  <td className="px-3 py-2">{fmtDateYmd(row.created_at) || "-"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/wms/dn/${row.id}`}
                      className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
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