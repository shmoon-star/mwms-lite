
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WmsAsnItem = {
  id: string;
  asn_no: string | null;
  po_no: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  total_cartons: number;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  status: string | null;
  created_at: string | null;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function WmsAsnListPage() {
  const [items, setItems] = useState<WmsAsnItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  async function loadList() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());

      const res = await fetch(`/api/wms/asn?${params.toString()}`, {
        cache: "no-store",
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load open ASN list");
      }

      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Failed to load open ASN list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.cartons += safeNum(row.total_cartons);
        acc.asn_qty += safeNum(row.asn_qty);
        acc.received_qty += safeNum(row.received_qty);
        acc.balance_qty += safeNum(row.balance_qty);
        return acc;
      },
      { count: 0, cartons: 0, asn_qty: 0, received_qty: 0, balance_qty: 0 }
    );
  }, [items]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">WMS / Open ASN</h1>
          <p className="text-sm text-gray-500 mt-1">
            3PL 현장 키인용 Open ASN 목록
          </p>
        </div>

        <button
          type="button"
          onClick={loadList}
          className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">Open ASN</div>
          <div className="text-2xl font-semibold mt-1">{totals.count}</div>
        </div>
        <div className="border rounded p-4 bg-white">
          <div className="text-xs text-gray-500">Total Cartons</div>
          <div className="text-2xl font-semibold mt-1">{totals.cartons}</div>
        </div>
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

      <div className="border rounded bg-white p-4">
        <label className="block text-xs text-gray-500 mb-2">Keyword</label>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="ASN / PO / Vendor"
          className="w-full md:w-[320px] border rounded px-3 py-2"
        />
      </div>

      <div className="border rounded bg-white overflow-hidden">
        <div className="px-4 py-3 border-b font-medium">Open ASN List</div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No open ASN found.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 border-b">ASN No</th>
                  <th className="text-left px-4 py-3 border-b">PO No</th>
                  <th className="text-left px-4 py-3 border-b">Vendor</th>
                  <th className="text-right px-4 py-3 border-b">Cartons</th>
                  <th className="text-right px-4 py-3 border-b">ASN Qty</th>
                  <th className="text-right px-4 py-3 border-b">Received Qty</th>
                  <th className="text-right px-4 py-3 border-b">Balance Qty</th>
                  <th className="text-left px-4 py-3 border-b">Created At</th>
                  <th className="text-left px-4 py-3 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border-b font-medium">{row.asn_no || "-"}</td>
                    <td className="px-4 py-3 border-b">{row.po_no || "-"}</td>
                    <td className="px-4 py-3 border-b">
                      <div>{row.vendor_name || "-"}</div>
                      <div className="text-xs text-gray-500">{row.vendor_code || "-"}</div>
                    </td>
                    <td className="px-4 py-3 border-b text-right">{row.total_cartons}</td>
                    <td className="px-4 py-3 border-b text-right">{row.asn_qty}</td>
                    <td className="px-4 py-3 border-b text-right">{row.received_qty}</td>
                    <td className="px-4 py-3 border-b text-right">{row.balance_qty}</td>
                    <td className="px-4 py-3 border-b">{fmtDate(row.created_at)}</td>
                    <td className="px-4 py-3 border-b">
                      <Link
                        href={`/wms/asn/${row.id}`}
                        className="inline-flex px-3 py-2 rounded border bg-white hover:bg-gray-50"
                      >
                        Open
                      </Link>
                    </td>
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