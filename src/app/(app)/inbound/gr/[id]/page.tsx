"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type GrLine = {
  id: string;
  line_no: number;
  sku: string | null;
  qty_expected: number;
  qty_received: number;
};

type GrDetail = {
  id: string;
  gr_no: string;
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  asn_id: string | null;
  asn_no: string | null;
  vendor_name: string | null;
  lines: GrLine[];
};

type GrDetailResponse = {
  ok?: boolean;
  item?: GrDetail;
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function resultLabel(expected: number, received: number) {
  if (received === expected) return "MATCH";
  if (received < expected) return "SHORT";
  return "OVER";
}

function resultClass(expected: number, received: number) {
  const v = resultLabel(expected, received);
  if (v === "MATCH") return "bg-green-100 text-green-700 border border-green-200";
  if (v === "SHORT") return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-red-100 text-red-700 border border-red-200";
}

function headerBadgeClass(status: string | null) {
  switch ((status || "").toUpperCase()) {
    case "CONFIRMED":
      return "bg-green-100 text-green-700 border border-green-200";
    case "PENDING":
      return "bg-yellow-100 text-yellow-700 border border-yellow-200";
    case "DRAFT":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
}

export default function GrDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id || "");

  const [item, setItem] = useState<GrDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const res = await fetch(`/api/gr/${id}`, { cache: "no-store" });
      const json: GrDetailResponse = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load GR detail");
      }

      setItem(json.item || null);
    } catch (e: any) {
      setError(e?.message || "Failed to load GR detail");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  const summary = useMemo(() => {
    const lines = item?.lines || [];
    const expected = lines.reduce((acc, r) => acc + Number(r.qty_expected || 0), 0);
    const received = lines.reduce((acc, r) => acc + Number(r.qty_received || 0), 0);
    const shortage = Math.max(0, expected - received);
    const over = Math.max(0, received - expected);
    const fullReceipt = expected > 0 && received === expected;
    const partialReceipt = received > 0 && received < expected;

    return {
      expected,
      received,
      shortage,
      over,
      fullReceipt,
      partialReceipt,
    };
  }, [item]);

  async function onConfirm() {
    if (!item) return;
    if ((item.status || "").toUpperCase() === "CONFIRMED") return;

    const hasReceived = (item.lines || []).some((line) => Number(line.qty_received || 0) > 0);
    if (!hasReceived) {
      alert("Confirm 전에 qty_received 값이 있는지 먼저 확인해줘.");
      return;
    }

    try {
      setConfirming(true);
      setMessage("");

      const res = await fetch(`/api/gr/${item.id}/confirm`, {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Failed to confirm GR");
      }

      setMessage(
        `GR confirmed successfully${json?.asn_status ? ` / ASN status: ${json.asn_status}` : ""}`
      );

      await load();
      router.refresh();
    } catch (e: any) {
      alert(e?.message || "Failed to confirm GR");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!item) {
    return <div className="p-6 text-sm text-slate-500">GR not found.</div>;
  }

  const isConfirmed = (item.status || "").toUpperCase() === "CONFIRMED";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-sm text-slate-500">
            <Link href="/inbound/gr" className="hover:underline">
              Inbound / GR
            </Link>
            <span className="mx-2">/</span>
            <span>{item.gr_no}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{item.gr_no}</h1>
            <span
              className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${headerBadgeClass(
                item.status
              )}`}
            >
              {item.status || "-"}
            </span>
          </div>

          <div className="text-sm text-slate-600 space-y-1">
            <div>
              ASN:{" "}
              {item.asn_id && item.asn_no ? (
                <Link
                  href={`/inbound/asn/${item.asn_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {item.asn_no}
                </Link>
              ) : (
                "-"
              )}
            </div>
            <div>Vendor: {item.vendor_name || "-"}</div>
            <div>Created: {fmtDate(item.created_at)}</div>
            <div>Confirmed: {fmtDate(item.confirmed_at)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg border text-sm bg-white"
          >
            Refresh
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirmed || confirming}
            className={`px-4 py-2 rounded-lg text-sm ${
              isConfirmed || confirming
                ? "bg-slate-300 text-white cursor-not-allowed"
                : "bg-black text-white"
            }`}
          >
            {isConfirmed ? "Confirmed" : confirming ? "Confirming..." : "Confirm"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-slate-500">Expected Total</div>
          <div className="text-2xl font-semibold mt-1">{summary.expected}</div>
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-slate-500">Received Total</div>
          <div className="text-2xl font-semibold mt-1">{summary.received}</div>
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-slate-500">Shortage</div>
          <div className="text-2xl font-semibold mt-1">{summary.shortage}</div>
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-slate-500">Over Receipt</div>
          <div className="text-2xl font-semibold mt-1">{summary.over}</div>
        </div>

        <div className="rounded-xl border p-4 bg-white">
          <div className="text-xs text-slate-500">Receipt Result</div>
          <div className="text-base font-semibold mt-2">
            {summary.fullReceipt
              ? "FULL"
              : summary.partialReceipt
              ? "PARTIAL"
              : "NOT RECEIVED"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <div className="font-medium">GR Lines</div>
          <div className="text-xs text-slate-500 mt-1">
            CSV 업로드 결과 기준으로 qty_received를 확인하고 Confirm 하면 된다.
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-white">
                <th className="text-left px-3 py-3 font-medium">Line</th>
                <th className="text-left px-3 py-3 font-medium">SKU</th>
                <th className="text-right px-3 py-3 font-medium">Expected</th>
                <th className="text-right px-3 py-3 font-medium">Received</th>
                <th className="text-right px-3 py-3 font-medium">Delta</th>
                <th className="text-left px-3 py-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {(item.lines || []).map((line) => {
                const expected = Number(line.qty_expected || 0);
                const received = Number(line.qty_received || 0);
                const delta = received - expected;

                return (
                  <tr key={line.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-3">{line.line_no}</td>
                    <td className="px-3 py-3">{line.sku || "-"}</td>
                    <td className="px-3 py-3 text-right">{expected}</td>
                    <td className="px-3 py-3 text-right">{received}</td>
                    <td className="px-3 py-3 text-right">{delta}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${resultClass(
                          expected,
                          received
                        )}`}
                      >
                        {resultLabel(expected, received)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(item.lines || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No GR lines found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}