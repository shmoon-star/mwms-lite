"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AsnItem = {
  id: string;
  status: string | null;
  asn_qty: number;
};

type DnSummary = {
  total_dn: number;
  open_dn: number;
  closed_dn: number;
  total_ordered: number;
  total_packed: number;
};

type ShipmentRow = {
  id: string;
  status: string | null;
  dn_count: number;
};

type CardData = {
  total: number;
  totalQty: number;
  open: number;
  openQty: number;
  closed: number;
  closedQty: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isAsnClosed(status: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "CONFIRMED" || s === "CANCELLED" || s === "GR_CONFIRMED";
}

function isShipmentClosed(status: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "CLOSED" || s === "CONFIRMED" || s === "SHIPPED" || s === "CANCELLED";
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

type SummaryCardProps = {
  title: string;
  href: string;
  total: number;
  totalQty: number;
  countUnit: string;
  qtyLabel: string;
  open: number;
  openQty: number;
  closed: number;
  closedQty: number;
  loading: boolean;
};

function SummaryCard({
  title, href,
  total, totalQty,
  countUnit, qtyLabel,
  open, openQty,
  closed, closedQty,
  loading,
}: SummaryCardProps) {
  return (
    <Link href={href} className="block hover:no-underline">
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "14px 16px",
          minWidth: 200,
          background: "#fff",
          cursor: "pointer",
          transition: "box-shadow 0.15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
      >
        {/* Title */}
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, fontWeight: 500 }}>
          {title}
        </div>

        {/* Big number row */}
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

        {/* Open row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Open</span>
          {loading ? (
            <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
          ) : (
            <>
              <strong style={{ fontSize: 13, color: "#111827" }}>{open.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
              <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
              <strong style={{ fontSize: 13, color: "#111827" }}>{openQty.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
            </>
          )}
        </div>

        {/* Closed row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Closed</span>
          {loading ? (
            <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
          ) : (
            <>
              <strong style={{ fontSize: 13, color: "#111827" }}>{closed.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
              <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
              <strong style={{ fontSize: 13, color: "#111827" }}>{closedQty.toLocaleString()}</strong>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WmsHomePage() {
  const [asnCard, setAsnCard] = useState<CardData>({ total: 0, totalQty: 0, open: 0, openQty: 0, closed: 0, closedQty: 0 });
  const [dnCard, setDnCard] = useState<CardData>({ total: 0, totalQty: 0, open: 0, openQty: 0, closed: 0, closedQty: 0 });
  const [shipCard, setShipCard] = useState<CardData>({ total: 0, totalQty: 0, open: 0, openQty: 0, closed: 0, closedQty: 0 });
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [asnRes, dnRes, shipRes] = await Promise.all([
        fetch("/api/wms/asn", { cache: "no-store" }),
        fetch("/api/wms/monitor/dn?view=all", { cache: "no-store" }),
        fetch("/api/shipment/open", { cache: "no-store" }),
      ]);

      const [asnJson, dnJson, shipJson] = await Promise.all([
        asnRes.json(),
        dnRes.json(),
        shipRes.json(),
      ]);

      // ── ASN ──────────────────────────────────────────────────────────────
      if (asnJson?.ok) {
        const items: AsnItem[] = Array.isArray(asnJson.items) ? asnJson.items : [];
        const openItems = items.filter((r) => !isAsnClosed(r.status));
        const closedItems = items.filter((r) => isAsnClosed(r.status));
        setAsnCard({
          total: items.length,
          totalQty: items.reduce((s, r) => s + safeNum(r.asn_qty), 0),
          open: openItems.length,
          openQty: openItems.reduce((s, r) => s + safeNum(r.asn_qty), 0),
          closed: closedItems.length,
          closedQty: closedItems.reduce((s, r) => s + safeNum(r.asn_qty), 0),
        });
      }

      // ── DN ───────────────────────────────────────────────────────────────
      if (dnJson?.ok) {
        const summary: DnSummary = dnJson.summary ?? {};
        const allItems: any[] = Array.isArray(dnJson.items) ? dnJson.items : [];

        const totalOrdered = allItems.reduce((s, r) => s + safeNum(r.qty_ordered), 0);
        const openItems = allItems.filter((r) => {
          const s = String(r.status || "").toUpperCase();
          return s !== "CONFIRMED" && s !== "SHIPPED";
        });
        const closedItems = allItems.filter((r) => {
          const s = String(r.status || "").toUpperCase();
          return s === "CONFIRMED" || s === "SHIPPED";
        });

        setDnCard({
          total: safeNum(summary.total_dn),
          totalQty: totalOrdered,
          open: safeNum(summary.open_dn),
          openQty: openItems.reduce((s, r) => s + safeNum(r.qty_ordered), 0),
          closed: safeNum(summary.closed_dn),
          closedQty: closedItems.reduce((s, r) => s + safeNum(r.qty_ordered), 0),
        });
      }

      // ── Shipment ─────────────────────────────────────────────────────────
      if (shipJson?.ok) {
        const rows: ShipmentRow[] = Array.isArray(shipJson.rows) ? shipJson.rows : [];
        const openRows = rows.filter((r) => !isShipmentClosed(r.status));
        const closedRows = rows.filter((r) => isShipmentClosed(r.status));
        setShipCard({
          total: rows.length,
          totalQty: rows.reduce((s, r) => s + safeNum(r.dn_count), 0),
          open: openRows.length,
          openQty: openRows.reduce((s, r) => s + safeNum(r.dn_count), 0),
          closed: closedRows.length,
          closedQty: closedRows.reduce((s, r) => s + safeNum(r.dn_count), 0),
        });
      }
    } catch (e) {
      console.error("WMS dashboard load failed", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">WMS Console</h1>
          <p className="mt-1 text-sm text-gray-400">Open / Closed operational monitoring</p>
        </div>
        <button
          onClick={loadAll}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-600"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <SummaryCard
          title="ASN"
          href="/wms/asn"
          countUnit="ASNs"
          qtyLabel="qty"
          loading={loading}
          {...asnCard}
        />
        <SummaryCard
          title="DN"
          href="/wms/dn"
          countUnit="DNs"
          qtyLabel="qty"
          loading={loading}
          {...dnCard}
        />
        <SummaryCard
          title="Shipment"
          href="/wms/shipment"
          countUnit="Shipments"
          qtyLabel="DNs"
          loading={loading}
          {...shipCard}
        />
      </div>

      {/* Quick links */}
      <div className="pt-2">
        <p className="text-xs text-gray-400 mb-3">Quick access</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "ASN List", href: "/wms/asn" },
            { label: "Open DN", href: "/wms/dn" },
            { label: "Shipment", href: "/wms/shipment" },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="rounded border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
