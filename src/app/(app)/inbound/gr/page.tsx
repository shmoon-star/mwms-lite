"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type GrListItem = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  asn_no: string | null;
  po_no?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  status: string | null;
  created_at: string | null;
  confirmed_at?: string | null;
  expected_total: number;
  received_total: number;
};

type GrListResponse = {
  ok?: boolean;
  items?: GrListItem[];
  error?: string;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function badgeClass(status: string | null | undefined) {
  const s = String(status || "").toUpperCase();

  if (s === "CONFIRMED" || s === "CLOSED") {
    return "bg-green-100 text-green-700 border border-green-200";
  }

  if (s === "PENDING" || s === "OPEN" || s === "DRAFT") {
    return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  }

  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function receiptStatus(expected: number, received: number) {
  if (received <= 0) return "NOT_RECEIVED";
  if (received < expected) return "PARTIAL";
  if (received === expected) return "FULL";
  return "OVER";
}

function receiptBadgeClass(v: string) {
  if (v === "FULL") return "bg-green-100 text-green-700 border border-green-200";
  if (v === "PARTIAL") return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  if (v === "OVER") return "bg-red-100 text-red-700 border border-red-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function toCsv(items: GrListItem[]) {
  const rows = [
    [
      "gr_no",
      "asn_no",
      "po_no",
      "vendor_code",
      "vendor_name",
      "document_status",
      "receipt_status",
      "expected_total",
      "received_total",
      "created_at",
      "confirmed_at",
    ],
    ...items.map((row) => {
      const expected = safeNum(row.expected_total);
      const received = safeNum(row.received_total);

      return [
        row.gr_no ?? "",
        row.asn_no ?? "",
        row.po_no ?? "",
        row.vendor_code ?? "",
        row.vendor_name ?? "",
        row.status ?? "",
        receiptStatus(expected, received),
        String(expected),
        String(received),
        row.created_at ?? "",
        row.confirmed_at ?? "",
      ];
    }),
  ];

  return rows
    .map((cols) =>
      cols
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InboundGrPage() {
  const [items, setItems] = useState<GrListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [keyword, setKeyword] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const apiStatus =
        tab === "ALL" ? "ALL" : tab === "OPEN" ? "OPEN" : "CLOSED";

      const res = await fetch(`/api/gr?status=${apiStatus}`, {
        cache: "no-store",
      });

      const json: GrListResponse = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load GR list");
      }

      setItems(json.items || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load GR list");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;

    return items.filter((row) => {
      const receipt = receiptStatus(
        safeNum(row.expected_total),
        safeNum(row.received_total)
      );

      const haystack = [
        row.gr_no,
        row.asn_no,
        row.po_no,
        row.vendor_code,
        row.vendor_name,
        row.status,
        receipt,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      return haystack.includes(q);
    });
  }, [items, keyword]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold">GR</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("ALL")}
          className={`px-4 py-2 rounded-lg border ${
            tab === "ALL" ? "bg-black text-white border-black" : "bg-white"
          }`}
        >
          All
        </button>

        <button
          type="button"
          onClick={() => setTab("OPEN")}
          className={`px-4 py-2 rounded-lg border ${
            tab === "OPEN" ? "bg-black text-white border-black" : "bg-white"
          }`}
        >
          Open
        </button>

        <button
          type="button"
          onClick={() => setTab("CLOSED")}
          className={`px-4 py-2 rounded-lg border ${
            tab === "CLOSED" ? "bg-black text-white border-black" : "bg-white"
          }`}
        >
          Closed
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="w-full max-w-md">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search GR / ASN / PO / Vendor / Status..."
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded-lg border bg-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                `gr-list-${tab.toLowerCase()}.csv`,
                toCsv(filteredItems)
              )
            }
            className="px-3 py-2 rounded-lg border bg-white"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="text-sm text-slate-500">GR List ({tab})</div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No GR found.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium">GR No</th>
                  <th className="text-left px-3 py-3 font-medium">ASN No</th>
                  <th className="text-left px-3 py-3 font-medium">PO No</th>
                  <th className="text-left px-3 py-3 font-medium">Vendor</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-left px-3 py-3 font-medium">Receipt</th>
                  <th className="text-right px-3 py-3 font-medium">Expected</th>
                  <th className="text-right px-3 py-3 font-medium">Received</th>
                  <th className="text-left px-3 py-3 font-medium">Created At</th>
                  <th className="text-left px-3 py-3 font-medium">Confirmed At</th>
                  <th className="text-left px-3 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const expected = safeNum(row.expected_total);
                  const received = safeNum(row.received_total);
                  const receipt = receiptStatus(expected, received);

                  return (
                    <tr key={row.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-3">{row.gr_no || "-"}</td>
                      <td className="px-3 py-3">{row.asn_no || "-"}</td>
                      <td className="px-3 py-3">{row.po_no || "-"}</td>
                      <td className="px-3 py-3">
                        <div>{row.vendor_name || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {row.vendor_code || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${badgeClass(
                            row.status
                          )}`}
                        >
                          {row.status || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${receiptBadgeClass(
                            receipt
                          )}`}
                        >
                          {receipt}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">{expected}</td>
                      <td className="px-3 py-3 text-right">{received}</td>
                      <td className="px-3 py-3">{fmtDate(row.created_at) || "-"}</td>
                      <td className="px-3 py-3">{fmtDate(row.confirmed_at) || "-"}</td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/inbound/gr/${row.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}