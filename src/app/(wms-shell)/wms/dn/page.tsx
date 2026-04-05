"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AsnRow = {
  id: string;
  asn_no: string;
  po_no: string;
  vendor_label: string;
  status: string;
  qty_expected: number;
  qty_received: number;
  balance: number;
  created_at: string | null;
  confirmed_at: string | null;
};

type Summary = {
  total_asn: number;
  open_asn: number;
  closed_asn: number;
  total_expected: number;
  total_received: number;
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

export default function WmsAsnPage() {
  const [items, setItems] = useState<AsnRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/wms/monitor/asn?view=open", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load Open ASN");
      }

      setSummary(json.summary || null);
      setItems(json.items || []);
    } catch (e: any) {
      alert(e?.message || "Failed to load Open ASN");
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
      [row.asn_no, row.po_no, row.vendor_label, row.status]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, keyword]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">WMS / Open ASN</div>
          <h1 className="mt-1 text-2xl font-semibold">Open ASN</h1>
          <p className="mt-1 text-sm text-gray-500">
            3PL 현장 키인용 Open ASN 목록
          </p>
        </div>

        <button
          onClick={load}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Open ASN</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.open_asn ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Expected Qty</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_expected ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Received Qty</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_received ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Balance Qty</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_balance ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Total ASN</div>
          <div className="mt-1 text-2xl font-semibold">
            {summary?.total_asn ?? 0}
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="text-sm font-medium">Keyword</div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="ASN / PO / Vendor"
          className="w-[320px] rounded border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <div className="border-b px-4 py-3 font-medium">Open ASN List</div>

        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">ASN No</th>
              <th className="px-3 py-2">PO No</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  No open ASN
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.asn_no}</td>
                  <td className="px-3 py-2">{row.po_no || "-"}</td>
                  <td className="px-3 py-2">{row.vendor_label || "-"}</td>
                  <td className="px-3 py-2">{row.qty_expected}</td>
                  <td className="px-3 py-2">{row.qty_received}</td>
                  <td className="px-3 py-2">{row.balance}</td>
                  <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/wms/asn/${row.id}`}
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