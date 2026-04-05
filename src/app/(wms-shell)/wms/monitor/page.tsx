"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DnSummary = {
  total_dn: number;
  open_dn: number;
  closed_dn: number;
  total_ordered: number;
  total_packed: number;
  total_balance: number;
};

type DnRow = {
  id: string;
  dn_no: string;
  customer_label: string;
  status: string;
  qty_ordered: number;
  qty_packed: number;
  balance: number;
  box_count: number;
  open_box_count: number;
  closed_box_count: number;
  created_at: string | null;
  shipped_at: string | null;
};

type AsnSummary = {
  total_asn: number;
  open_asn: number;
  closed_asn: number;
  total_expected: number;
  total_received: number;
  total_balance: number;
};

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

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export default function WmsMonitorPage() {
  const [tab, setTab] = useState<"dn" | "asn">("dn");
  const [view, setView] = useState<"all" | "open" | "closed">("all");
  const [keyword, setKeyword] = useState("");

  const [dnSummary, setDnSummary] = useState<DnSummary | null>(null);
  const [dnItems, setDnItems] = useState<DnRow[]>([]);

  const [asnSummary, setAsnSummary] = useState<AsnSummary | null>(null);
  const [asnItems, setAsnItems] = useState<AsnRow[]>([]);

  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (tab === "dn") {
        const res = await fetch(`/api/wms/monitor/dn?view=${view}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load DN monitor");
        }

        setDnSummary(json.summary);
        setDnItems(json.items || []);
      } else {
        const res = await fetch(`/api/wms/monitor/asn?view=${view}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load ASN monitor");
        }

        setAsnSummary(json.summary);
        setAsnItems(json.items || []);
      }
    } catch (e: any) {
      alert(e?.message || "Failed to load monitor");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab, view]);

  const filteredDn = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return dnItems;

    return dnItems.filter((row) =>
      [row.dn_no, row.customer_label || "", row.status || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [dnItems, keyword]);

  const filteredAsn = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return asnItems;

    return asnItems.filter((row) =>
      [row.asn_no, row.po_no || "", row.vendor_label || "", row.status || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [asnItems, keyword]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">WMS / Monitor</div>
          <h1 className="mt-1 text-2xl font-semibold">Execution Monitor</h1>
          <p className="mt-1 text-sm text-gray-500">
            ASN / DN 실행 결과를 모니터링하고 상세 화면으로 이동합니다.
          </p>
        </div>

        <div className="flex gap-2">
          {tab === "dn" ? (
            <>
              <a
                href={`/api/wms/monitor/dn/export?view=${view}`}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                DN Summary CSV
              </a>
              <a
                href={`/api/wms/monitor/dn/export/box-summary?view=${view}`}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Box Summary CSV
              </a>
              <a
                href={`/api/wms/monitor/dn/export/box-detail?view=${view}`}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                Box Detail CSV
              </a>
            </>
          ) : (
            <>
              <a
                href={`/api/wms/monitor/asn/export?view=${view}`}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                ASN Summary CSV
              </a>
              <a
                href={`/api/wms/monitor/asn/export/detail?view=${view}`}
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                ASN Detail CSV
              </a>
            </>
          )}

          <button
            onClick={load}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("dn")}
          className={`rounded border px-3 py-2 text-sm ${
            tab === "dn" ? "bg-black text-white" : ""
          }`}
        >
          DN
        </button>

        <button
          onClick={() => setTab("asn")}
          className={`rounded border px-3 py-2 text-sm ${
            tab === "asn" ? "bg-black text-white" : ""
          }`}
        >
          ASN
        </button>

        <div className="mx-2 h-6 w-px bg-gray-300" />

        <button
          onClick={() => setView("all")}
          className={`rounded border px-3 py-2 text-sm ${
            view === "all" ? "bg-black text-white" : ""
          }`}
        >
          All
        </button>

        <button
          onClick={() => setView("open")}
          className={`rounded border px-3 py-2 text-sm ${
            view === "open" ? "bg-black text-white" : ""
          }`}
        >
          Open
        </button>

        <button
          onClick={() => setView("closed")}
          className={`rounded border px-3 py-2 text-sm ${
            view === "closed" ? "bg-black text-white" : ""
          }`}
        >
          Closed
        </button>

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={
            tab === "dn"
              ? "DN No / Customer / Status"
              : "ASN No / PO No / Vendor / Status"
          }
          className="ml-auto w-[320px] rounded border px-3 py-2 text-sm"
        />
      </div>

      {tab === "dn" ? (
        <>
          <div className="grid grid-cols-6 gap-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Total DN</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.total_dn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Open DN</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.open_dn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Closed DN</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.closed_dn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Ordered</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.total_ordered ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Packed</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.total_packed ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Balance</div>
              <div className="mt-1 text-2xl font-semibold">
                {dnSummary?.total_balance ?? 0}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">DN No</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Packed</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Boxes</th>
                  <th className="px-3 py-2">Open Boxes</th>
                  <th className="px-3 py-2">Closed Boxes</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Shipped At</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : filteredDn.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  filteredDn.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/wms/dn/${row.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {row.dn_no}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.customer_label || "-"}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{row.qty_ordered}</td>
                      <td className="px-3 py-2">{row.qty_packed}</td>
                      <td className="px-3 py-2">{row.balance}</td>
                      <td className="px-3 py-2">{row.box_count}</td>
                      <td className="px-3 py-2">{row.open_box_count}</td>
                      <td className="px-3 py-2">{row.closed_box_count}</td>
                      <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                      <td className="px-3 py-2">{fmtDate(row.shipped_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Total ASN</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.total_asn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Open ASN</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.open_asn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Closed ASN</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.closed_asn ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Expected</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.total_expected ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Received</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.total_received ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-500">Balance</div>
              <div className="mt-1 text-2xl font-semibold">
                {asnSummary?.total_balance ?? 0}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">ASN No</th>
                  <th className="px-3 py-2">PO No</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : filteredAsn.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-gray-500"
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  filteredAsn.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/wms/asn/${row.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {row.asn_no}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.po_no}</td>
                      <td className="px-3 py-2">{row.vendor_label}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{row.qty_expected}</td>
                      <td className="px-3 py-2">{row.qty_received}</td>
                      <td className="px-3 py-2">{row.balance}</td>
                      <td className="px-3 py-2">{fmtDate(row.created_at)}</td>
                      <td className="px-3 py-2">{fmtDate(row.confirmed_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}