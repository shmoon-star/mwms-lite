"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

// ─── Types ────────────────────────────────────────────────────────────────────

type DnSummary = {
  total_dn: number; open_dn: number; closed_dn: number;
  total_ordered: number; total_shipped: number; total_packed: number; total_balance: number;
};
type DnRow = {
  id: string; dn_no: string; customer_label: string;
  ship_from: string | null; ship_to: string | null; status: string;
  qty_ordered: number; qty_shipped: number; qty_packed: number; balance: number;
  boxes: number; created_at: string | null; shipped_at: string | null;
  planned_gi_date: string | null; planned_delivery_date: string | null;
};
type AsnSummary = {
  total_asn: number; open_asn: number; closed_asn: number;
  total_expected: number; total_received: number; total_balance: number;
};
type AsnRow = {
  id: string; asn_no: string; po_no: string; vendor_label: string;
  status: string; qty_expected: number; qty_received: number; balance: number;
  created_at: string | null; confirmed_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try { return new Date(v).toLocaleDateString("ko-KR"); } catch { return v; }
}

const DN_STATUS_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:  { label: "Pending",   bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  RESERVED: { label: "Reserved",  bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  PICKED:   { label: "Picked",    bg: "#e0e7ff", color: "#3730a3", border: "#c7d2fe" },
  PACKED:   { label: "Packed",    bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  PACKING:  { label: "Packing",   bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  SHIPPED:  { label: "Shipped",   bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  CONFIRMED:{ label: "Confirmed", bg: "#f0fdf4", color: "#14532d", border: "#86efac" },
  CANCELLED:{ label: "Cancelled", bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

function DnStatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const m = DN_STATUS_META[s] ?? { label: s || "-", bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  return (
    <span style={{
      display: "inline-flex", padding: "2px 10px", borderRadius: 9999,
      fontSize: 11, fontWeight: 600,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  );
}

// ─── Summary Card (SCM Monitor 동일 스타일) ───────────────────────────────────

function SummaryCard({
  title, total, totalQty, countUnit, qtyLabel, open, openQty, closed, closedQty, loading,
}: {
  title: string; total: number; totalQty: number;
  countUnit: string; qtyLabel: string;
  open: number; openQty: number; closed: number; closedQty: number;
  loading: boolean;
}) {
  return (
    <div style={{
      border: "1px solid #ddd", borderRadius: 8, padding: "14px 16px",
      minWidth: 210, background: "#fff",
    }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, fontWeight: 500 }}>{title}</div>
      {loading ? (
        <div style={{ fontSize: 28, fontWeight: 700, color: "#d1d5db" }}>—</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{total.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{countUnit}</span>
          <span style={{ fontSize: 13, color: "#d1d5db" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{totalQty.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{qtyLabel}</span>
        </div>
      )}
      <div style={{ borderTop: "1px solid #f3f4f6", margin: "10px 0 8px" }} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Open</span>
        {loading ? <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span> : (<>
          <strong style={{ fontSize: 13, color: "#111827" }}>{open.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
          <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
          <strong style={{ fontSize: 13, color: "#111827" }}>{openQty.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
        </>)}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Closed</span>
        {loading ? <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span> : (<>
          <strong style={{ fontSize: 13, color: "#111827" }}>{closed.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
          <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
          <strong style={{ fontSize: 13, color: "#111827" }}>{closedQty.toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
        </>)}
      </div>
    </div>
  );
}

// ─── Filter Buttons ───────────────────────────────────────────────────────────

type ViewType = "all" | "open" | "closed";

function ViewFilter({ value, onChange }: { value: ViewType; onChange: (v: ViewType) => void }) {
  return (
    <div className="flex gap-1">
      {(["all", "open", "closed"] as ViewType[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded border px-3 py-1 text-sm capitalize ${
            value === v ? "bg-black text-white border-black" : "hover:bg-gray-50"
          }`}
        >
          {v === "all" ? "All" : v === "open" ? "Open" : "Closed"}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WmsMonitorPage() {
  // DN state
  const [dnView, setDnView] = useState<ViewType>("all");
  const [dnSummaryAll, setDnSummaryAll] = useState<DnSummary | null>(null);
  const [dnItems, setDnItems] = useState<DnRow[]>([]);
  const [dnLoading, setDnLoading] = useState(true);
  const [dnKeyword, setDnKeyword] = useState("");

  // ASN state
  const [asnView, setAsnView] = useState<ViewType>("all");
  const [asnSummaryAll, setAsnSummaryAll] = useState<AsnSummary | null>(null);
  const [asnItems, setAsnItems] = useState<AsnRow[]>([]);
  const [asnLoading, setAsnLoading] = useState(true);
  const [asnKeyword, setAsnKeyword] = useState("");

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadDn(view: ViewType) {
    setDnLoading(true);
    try {
      const res = await fetch(`/api/wms/monitor/dn?view=${view}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to load DN");
      setDnItems(json.items || []);
      // Always load summary from "all" for the top card
      if (view === "all") setDnSummaryAll(json.summary);
    } catch (e: any) {
      console.error(e);
    } finally {
      setDnLoading(false);
    }
  }

  async function loadAsn(view: ViewType) {
    setAsnLoading(true);
    try {
      const res = await fetch(`/api/wms/monitor/asn?view=${view}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to load ASN");
      setAsnItems(json.items || []);
      if (view === "all") setAsnSummaryAll(json.summary);
    } catch (e: any) {
      console.error(e);
    } finally {
      setAsnLoading(false);
    }
  }

  // Load "all" once on mount for summary cards, then switch views freely
  useEffect(() => {
    // Load all once to get full summary for cards
    fetch("/api/wms/monitor/dn?view=all", { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j?.ok) setDnSummaryAll(j.summary); });
    fetch("/api/wms/monitor/asn?view=all", { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j?.ok) setAsnSummaryAll(j.summary); });
  }, []);

  useEffect(() => { loadDn(dnView); }, [dnView]);
  useEffect(() => { loadAsn(asnView); }, [asnView]);

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const filteredDn = useMemo(() => {
    const q = dnKeyword.trim().toLowerCase();
    if (!q) return dnItems;
    return dnItems.filter((r) =>
      [r.dn_no, r.customer_label, r.ship_from, r.ship_to, r.status]
        .join(" ").toLowerCase().includes(q)
    );
  }, [dnItems, dnKeyword]);

  const filteredAsn = useMemo(() => {
    const q = asnKeyword.trim().toLowerCase();
    if (!q) return asnItems;
    return asnItems.filter((r) =>
      [r.asn_no, r.po_no, r.vendor_label, r.status]
        .join(" ").toLowerCase().includes(q)
    );
  }, [asnItems, asnKeyword]);

  // ── DN summary qty per view ────────────────────────────────────────────────
  const dnOpenQty = dnSummaryAll
    ? dnItems
        .filter((r) => { const s = r.status.toUpperCase(); return s !== "CONFIRMED" && s !== "SHIPPED" && s !== "CANCELLED"; })
        .reduce((s, r) => s + r.qty_ordered, 0)
    : 0;

  const dnClosedQty = dnSummaryAll
    ? dnItems
        .filter((r) => { const s = r.status.toUpperCase(); return s === "CONFIRMED" || s === "SHIPPED"; })
        .reduce((s, r) => s + r.qty_ordered, 0)
    : 0;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="text-sm text-gray-500">WMS / Monitor</div>
        <h1 className="mt-1 text-2xl font-semibold">Execution Monitor</h1>
        <p className="mt-1 text-sm text-gray-400">ASN / DN 실행 결과를 모니터링하고 상세 화면으로 이동합니다.</p>
      </div>

      {/* Summary Cards (SCM Monitor 동일 스타일) */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <SummaryCard
          title="ASN"
          countUnit="ASNs" qtyLabel="qty"
          total={asnSummaryAll?.total_asn ?? 0}
          totalQty={asnSummaryAll?.total_expected ?? 0}
          open={asnSummaryAll?.open_asn ?? 0}
          openQty={/* open expected qty: all items - need to compute */ asnItems.filter(r => !["FULL_RECEIVED","CONFIRMED","CLOSED","RECEIVED"].includes(r.status.toUpperCase())).reduce((s,r) => s + r.qty_expected, 0)}
          closed={asnSummaryAll?.closed_asn ?? 0}
          closedQty={asnItems.filter(r => ["FULL_RECEIVED","CONFIRMED","CLOSED","RECEIVED"].includes(r.status.toUpperCase())).reduce((s,r) => s + r.qty_expected, 0)}
          loading={asnLoading}
        />
        <SummaryCard
          title="DN"
          countUnit="DNs" qtyLabel="qty"
          total={dnSummaryAll?.total_dn ?? 0}
          totalQty={dnSummaryAll?.total_ordered ?? 0}
          open={dnSummaryAll?.open_dn ?? 0}
          openQty={dnOpenQty}
          closed={dnSummaryAll?.closed_dn ?? 0}
          closedQty={dnClosedQty}
          loading={dnLoading}
        />
      </div>

      {/* ── ASN Section ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">ASN</h2>
            <ViewFilter value={asnView} onChange={setAsnView} />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={asnKeyword}
              onChange={(e) => setAsnKeyword(e.target.value)}
              placeholder="ASN No / PO No / Vendor / Status"
              className="w-[280px] rounded border px-3 py-1.5 text-sm"
            />
            <a
              href={`/api/wms/monitor/asn/export?view=${asnView}`}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              ↓ Summary CSV
            </a>
            <a
              href={`/api/wms/monitor/asn/export/detail?view=${asnView}`}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              ↓ Detail CSV (SKU)
            </a>
          </div>
        </div>

        <div className="text-xs text-gray-400">
          ASN List ({asnView === "all" ? "ALL" : asnView === "open" ? "OPEN" : "CLOSED"})
        </div>

        {/* ASN Table */}
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">ASN No</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">PO No</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">ASN Qty</th>
                <th className="px-3 py-2 text-right">Received Qty</th>
                <th className="px-3 py-2 text-right">Balance Qty</th>
                <th className="px-3 py-2">GR No</th>
                <th className="px-3 py-2">GR Status</th>
                <th className="px-3 py-2">Created At</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {asnLoading ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : filteredAsn.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">No data</td></tr>
              ) : filteredAsn.map((row) => (
                <tr key={row.id} className="border-t hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/wms/asn/${row.id}`} className="text-blue-600 hover:underline">{row.asn_no}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.vendor_label || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{row.po_no || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded border ${
                      row.status === "FULL_RECEIVED" || row.status === "CONFIRMED"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : row.status === "PARTIAL_RECEIVED"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{row.qty_expected}</td>
                  <td className="px-3 py-2 text-right">{row.qty_received}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.balance}</td>
                  <td className="px-3 py-2 text-gray-400">-</td>
                  <td className="px-3 py-2 text-gray-400">-</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{fmtDateYmd(row.created_at) || "-"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/wms/asn/${row.id}`} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DN Section ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">DN</h2>
            <ViewFilter value={dnView} onChange={setDnView} />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={dnKeyword}
              onChange={(e) => setDnKeyword(e.target.value)}
              placeholder="DN No / Ship To / Ship From / Status"
              className="w-[280px] rounded border px-3 py-1.5 text-sm"
            />
            <a
              href={`/api/wms/monitor/dn/export?view=${dnView}`}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              ↓ DN Summary CSV
            </a>
            <a
              href={`/api/wms/monitor/dn/export/box-summary?view=${dnView}`}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              ↓ Box Summary CSV
            </a>
            <a
              href={`/api/wms/monitor/dn/export/box-detail?view=${dnView}`}
              className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-nowrap"
            >
              ↓ Box Detail CSV (SKU)
            </a>
          </div>
        </div>

        <div className="text-xs text-gray-400">
          DN List ({dnView === "all" ? "ALL" : dnView === "open" ? "OPEN" : "CLOSED"})
        </div>

        {/* DN Table */}
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">DN No</th>
                <th className="px-3 py-2">Ship To</th>
                <th className="px-3 py-2">Ship From</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Shipped</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Planned GI</th>
                <th className="px-3 py-2">Planned Ship</th>
                <th className="px-3 py-2 text-right">Boxes</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Shipped At</th>
              </tr>
            </thead>
            <tbody>
              {dnLoading ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : filteredDn.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-400">No data</td></tr>
              ) : filteredDn.map((row) => (
                <tr key={row.id} className="border-t hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/wms/dn/${row.id}`} className="text-blue-600 hover:underline">{row.dn_no}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.ship_to || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{row.ship_from || "-"}</td>
                  <td className="px-3 py-2"><DnStatusBadge status={row.status} /></td>
                  <td className="px-3 py-2 text-right">{row.qty_ordered}</td>
                  <td className="px-3 py-2 text-right">{row.qty_shipped}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.balance}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(row.planned_gi_date)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(row.planned_delivery_date)}</td>
                  <td className="px-3 py-2 text-right">{row.boxes || <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDateYmd(row.created_at) || "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDateYmd(row.shipped_at) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
