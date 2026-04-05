"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PackingListItem = {
  id: string;
  packing_list_no: string;
  pl_no: string;
  po_no: string;
  po_id: string | null;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  vendor_display: string;
  status: string;
  asn_id: string | null;
  asn_no: string;
  eta: string;
  created_at: string | null;
  updated_at: string | null;
  finalized_at: string | null;
  is_vendor_scope: boolean;
};

type ApiResponse = {
  ok: boolean;
  scope: "VENDOR" | "ADMIN";
  items: PackingListItem[];
  error?: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR");
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toUpperCase();

  let className =
    "inline-flex rounded-full px-3 py-1 text-xs font-semibold border ";

  if (normalized === "DRAFT") {
    className += "bg-yellow-100 text-yellow-800 border-yellow-200";
  } else if (normalized === "SUBMITTED") {
    className += "bg-blue-100 text-blue-800 border-blue-200";
  } else if (normalized === "FINALIZED") {
    className += "bg-green-100 text-green-800 border-green-200";
  } else if (normalized === "INBOUND_COMPLETED") {
    className += "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (normalized === "PARTIAL") {
    className += "bg-orange-100 text-orange-800 border-orange-200";
  } else {
    className += "bg-gray-100 text-gray-800 border-gray-200";
  }

  return <span className={className}>{status || "-"}</span>;
}

export default function VendorPackingListsPage() {
  const [items, setItems] = useState<PackingListItem[]>([]);
  const [scope, setScope] = useState<"VENDOR" | "ADMIN">("VENDOR");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/vendor/packing-lists", {
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load packing lists");
      }

      setItems(json.items || []);
      setScope(json.scope || "VENDOR");
    } catch (e: any) {
      setError(e?.message || "Failed to load packing lists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((row) => {
      return [
        row.po_no,
        row.pl_no,
        row.packing_list_no,
        row.vendor_display,
        row.status,
        row.asn_no,
        row.eta,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Vendor Packing Lists</h1>
          <p className="mt-2 text-gray-500">
            벤더 포탈에서 Packing List 생성 / 조회 / Finalize
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/vendor/packing-lists/new"
            className="rounded-lg border px-4 py-2 hover:bg-gray-50"
          >
            New Packing List
          </Link>
          <button
            onClick={load}
            className="rounded-lg border px-4 py-2 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-md">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search PO / PL / ASN / Status..."
          className="w-full rounded-xl border px-4 py-3 outline-none"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border p-6">Loading...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-4">PO No</th>
                <th className="px-4 py-4">Packing List No</th>
                {scope === "ADMIN" ? (
                  <th className="px-4 py-4">Vendor</th>
                ) : null}
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">ASN</th>
                <th className="px-4 py-4">ETA</th>
                <th className="px-4 py-4">Created At</th>
                <th className="px-4 py-4">Finalized At</th>
                <th className="px-4 py-4">Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={scope === "ADMIN" ? 9 : 8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No packing lists found
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-4 py-4 font-semibold">
                      {row.po_id && row.po_no !== "-" ? (
                        <Link
                          href={`/inbound/po/${row.po_id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {row.po_no}
                        </Link>
                      ) : (
                        row.po_no || "-"
                      )}
                    </td>

                    <td className="px-4 py-4 font-medium">
                      {row.pl_no || row.packing_list_no}
                    </td>

                    {scope === "ADMIN" ? (
                      <td className="px-4 py-4">{row.vendor_display || "-"}</td>
                    ) : null}

                    <td className="px-4 py-4">
                      <StatusBadge status={row.status} />
                    </td>

                    <td className="px-4 py-4">{row.asn_no || "-"}</td>

                    <td className="px-4 py-4">{row.eta || "-"}</td>

                    <td className="px-4 py-4">
                      {formatDateTime(row.created_at)}
                    </td>

                    <td className="px-4 py-4">
                      {formatDateTime(row.finalized_at)}
                    </td>

                    <td className="px-4 py-4">
                      <Link
                        href={`/vendor/packing-lists/${row.id}`}
                        className="rounded-lg border px-3 py-2 hover:bg-gray-50"
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
      )}
    </div>
  );
}