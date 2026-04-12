"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type FilterType = "ALL" | "OPEN" | "CLOSED";

// ─── PO ───────────────────────────────────────────────────────
type PORow = {
  id: string;
  po_no: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
  po_qty: number;
  asn_qty: number;
  received_qty: number;
  balance_qty: number;
  asn_count: number;
};

const PO_OPEN   = ["DRAFT","SUBMITTED","CONFIRMED","IN_TRANSIT"];
const PO_CLOSED = ["RECEIVED","CLOSED","CANCELLED"];

// ─── DN ───────────────────────────────────────────────────────
type DNRow = {
  id: string;
  dn_no: string | null;
  status: string | null;
  ship_from: string | null;
  ship_to: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
  shipped_at: string | null;
  created_at: string | null;
  qty_total: number;
};

const DN_OPEN   = ["PENDING","RESERVED","PICKED","PACKING","PACKED"];
const DN_CLOSED = ["SHIPPED","CONFIRMED","CANCELLED"];

// ─── Shipment ─────────────────────────────────────────────────
type ShipmentRow = {
  id: string;
  shipment_no: string | null;
  status: string | null;
  bl_no: string | null;
  etd: string | null;
  eta: string | null;
  vessel_name: string | null;
  container_no: string | null;
  created_at: string | null;
  dn_count: number;
  total_qty: number;
  ship_from_summary: string | null;
  ship_to_summary: string | null;
  dn_summary: string | null;
};

const SHIP_OPEN   = ["OPEN","IN_TRANSIT","DRAFT"];
const SHIP_CLOSED = ["DELIVERED","CLOSED","CANCELLED"];

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(v: string | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("ko-KR");
}

function StatusBadge({ status }: { status: string | null }) {
  const s = String(status || "").toUpperCase();
  let bg = "#f3f4f6", color = "#374151", border = "#d1d5db";
  if (["SHIPPED","DELIVERED","CLOSED","RECEIVED","FULL_RECEIVED"].includes(s)) {
    bg = "#dcfce7"; color = "#166534"; border = "#bbf7d0";
  } else if (["CONFIRMED","SUBMITTED","FINALIZED","IN_TRANSIT"].includes(s)) {
    bg = "#dbeafe"; color = "#1e40af"; border = "#bfdbfe";
  } else if (["PENDING","DRAFT","OPEN","PARTIAL_RECEIVED"].includes(s)) {
    bg = "#fef9c3"; color = "#854d0e"; border = "#fde68a";
  } else if (["CANCELLED","CANCELED"].includes(s)) {
    bg = "#fee2e2"; color = "#991b1b"; border = "#fecaca";
  }
  return (
    <span style={{
      display: "inline-flex", padding: "2px 10px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600, background: bg, color, border: `1px solid ${border}`,
    }}>
      {status || "-"}
    </span>
  );
}

function FilterButtons({ value, onChange }: { value: FilterType; onChange: (v: FilterType) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(["ALL","OPEN","CLOSED"] as FilterType[]).map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          style={{
            padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
            border: value === f ? "none" : "1px solid #d1d5db",
            background: value === f ? "#111" : "#fff",
            color: value === f ? "#fff" : "#374151",
          }}
        >
          {f === "ALL" ? "All" : f === "OPEN" ? "Open" : "Closed"}
        </button>
      ))}
    </div>
  );
}

// ─── Mini summary card (inline strip) ─────────────────────────
function SummaryStrip({ total, open, closed, unit = "건" }: { total: number; open: number; closed: number; unit?: string }) {
  return (
    <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#374151" }}>
      <span>Total <strong>{total.toLocaleString()}</strong>{unit}</span>
      <span style={{ color: "#d1d5db" }}>|</span>
      <span style={{ color: "#b45309" }}>Open <strong>{open.toLocaleString()}</strong></span>
      <span style={{ color: "#d1d5db" }}>|</span>
      <span style={{ color: "#166534" }}>Closed <strong>{closed.toLocaleString()}</strong></span>
    </div>
  );
}

// ─── Panel wrapper ─────────────────────────────────────────────
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "14px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function BuyerMonitorPage() {
  const [poRows, setPoRows]   = useState<PORow[]>([]);
  const [dnRows, setDnRows]   = useState<DNRow[]>([]);
  const [shipRows, setShipRows] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [poFilter, setPoFilter]     = useState<FilterType>("ALL");
  const [dnFilter, setDnFilter]     = useState<FilterType>("ALL");
  const [shipFilter, setShipFilter] = useState<FilterType>("ALL");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [poRes, dnRes, shipRes] = await Promise.all([
        fetch("/api/buyer/po", { cache: "no-store" }),
        fetch("/api/buyer/dn", { cache: "no-store" }),
        fetch("/api/buyer/shipment?status=ALL", { cache: "no-store" }),
      ]);

      if (poRes.status === 401 || poRes.status === 403 || dnRes.status === 401 || dnRes.status === 403) {
        window.location.href = "/buyer-login";
        return;
      }

      const [poJson, dnJson, shipJson] = await Promise.all([
        poRes.json(), dnRes.json(), shipRes.json(),
      ]);

      if (!poJson.ok)   throw new Error(poJson.error   || "PO load failed");
      if (!dnJson.ok)   throw new Error(dnJson.error   || "DN load failed");
      if (!shipJson.ok) throw new Error(shipJson.error || "Shipment load failed");

      setPoRows(poJson.data   ?? []);
      setDnRows(dnJson.data   ?? []);
      setShipRows(shipJson.rows ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── filtered slices ──────────────────────────────────────────
  const filteredPo = useMemo(() => {
    if (poFilter === "OPEN")   return poRows.filter(r => PO_OPEN.includes(String(r.status ?? "").toUpperCase()));
    if (poFilter === "CLOSED") return poRows.filter(r => PO_CLOSED.includes(String(r.status ?? "").toUpperCase()));
    return poRows;
  }, [poRows, poFilter]);

  const filteredDn = useMemo(() => {
    if (dnFilter === "OPEN")   return dnRows.filter(r => DN_OPEN.includes(String(r.status ?? "").toUpperCase()));
    if (dnFilter === "CLOSED") return dnRows.filter(r => DN_CLOSED.includes(String(r.status ?? "").toUpperCase()));
    return dnRows;
  }, [dnRows, dnFilter]);

  const filteredShip = useMemo(() => {
    if (shipFilter === "OPEN")   return shipRows.filter(r => SHIP_OPEN.includes(String(r.status ?? "").toUpperCase()));
    if (shipFilter === "CLOSED") return shipRows.filter(r => SHIP_CLOSED.includes(String(r.status ?? "").toUpperCase()));
    return shipRows;
  }, [shipRows, shipFilter]);

  // ── summary counts ───────────────────────────────────────────
  const poSummary = useMemo(() => ({
    total: poRows.length,
    open:  poRows.filter(r => PO_OPEN.includes(String(r.status ?? "").toUpperCase())).length,
    closed: poRows.filter(r => PO_CLOSED.includes(String(r.status ?? "").toUpperCase())).length,
  }), [poRows]);

  const dnSummary = useMemo(() => ({
    total: dnRows.length,
    open:  dnRows.filter(r => DN_OPEN.includes(String(r.status ?? "").toUpperCase())).length,
    closed: dnRows.filter(r => DN_CLOSED.includes(String(r.status ?? "").toUpperCase())).length,
  }), [dnRows]);

  const shipSummary = useMemo(() => ({
    total: shipRows.length,
    open:  shipRows.filter(r => SHIP_OPEN.includes(String(r.status ?? "").toUpperCase())).length,
    closed: shipRows.filter(r => SHIP_CLOSED.includes(String(r.status ?? "").toUpperCase())).length,
  }), [shipRows]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Monitor</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14, margin: "4px 0 0" }}>
            PO · DN · Shipment 현황 및 SKU 레벨 데이터 다운로드
          </p>
        </div>
        <button
          onClick={load}
          style={{ padding: "9px 18px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading...</p>
      ) : error ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#991b1b" }}>
          {error}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── PO Panel ── */}
          <Panel title="📦 Purchase Orders">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <SummaryStrip {...poSummary} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <FilterButtons value={poFilter} onChange={setPoFilter} />
                <a
                  href="/api/buyer/monitor/export/po"
                  style={{ padding: "7px 14px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, textDecoration: "none", color: "#374151", whiteSpace: "nowrap" }}
                >
                  ⬇ Detail CSV
                </a>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={th}>PO No</th>
                    <th style={th}>Vendor</th>
                    <th style={th}>Status</th>
                    <th style={th}>ETA</th>
                    <th style={{ ...th, textAlign: "right" }}>PO Qty</th>
                    <th style={{ ...th, textAlign: "right" }}>ASN Qty</th>
                    <th style={{ ...th, textAlign: "right" }}>Received</th>
                    <th style={{ ...th, textAlign: "right" }}>Balance</th>
                    <th style={th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPo.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No purchase orders found</td></tr>
                  ) : filteredPo.map(row => (
                    <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{row.po_no ?? "-"}</td>
                      <td style={td}>
                        <div style={{ lineHeight: 1.3 }}>
                          <div>{row.vendor_name ?? "-"}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{row.vendor_code ?? ""}</div>
                        </div>
                      </td>
                      <td style={td}><StatusBadge status={row.status} /></td>
                      <td style={td}>{formatDate(row.eta)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.po_qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.asn_qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.received_qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right", color: row.balance_qty > 0 ? "#b45309" : "#6b7280" }}>
                        {row.balance_qty.toLocaleString()}
                      </td>
                      <td style={td}>{fmtDate(row.created_at) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* ── DN Panel ── */}
          <Panel title="🚚 Delivery Notes">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <SummaryStrip {...dnSummary} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <FilterButtons value={dnFilter} onChange={setDnFilter} />
                <a
                  href="/api/buyer/monitor/export/dn"
                  style={{ padding: "7px 14px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, textDecoration: "none", color: "#374151", whiteSpace: "nowrap" }}
                >
                  ⬇ Detail CSV
                </a>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={th}>DN No</th>
                    <th style={th}>Status</th>
                    <th style={th}>Ship From</th>
                    <th style={th}>Ship To</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                    <th style={th}>Planned GI</th>
                    <th style={th}>Planned Ship</th>
                    <th style={th}>Shipped</th>
                    <th style={th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDn.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No delivery notes found</td></tr>
                  ) : filteredDn.map(row => (
                    <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{row.dn_no ?? "-"}</td>
                      <td style={td}><StatusBadge status={row.status} /></td>
                      <td style={td}>{row.ship_from ?? "-"}</td>
                      <td style={td}>{row.ship_to ?? "-"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{(row.qty_total ?? 0).toLocaleString()}</td>
                      <td style={td}>{formatDate(row.planned_gi_date)}</td>
                      <td style={td}>{formatDate(row.planned_delivery_date)}</td>
                      <td style={td}>{fmtDate(row.shipped_at) || "-"}</td>
                      <td style={td}>{fmtDate(row.created_at) || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* ── Shipment Panel ── */}
          <Panel title="🛳 Shipments">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <SummaryStrip {...shipSummary} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <FilterButtons value={shipFilter} onChange={setShipFilter} />
                <a
                  href="/api/buyer/monitor/export/shipment"
                  style={{ padding: "7px 14px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, textDecoration: "none", color: "#374151", whiteSpace: "nowrap" }}
                >
                  ⬇ Detail CSV
                </a>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#f9fafb" }}>
                  <tr>
                    <th style={th}>Shipment No</th>
                    <th style={th}>Status</th>
                    <th style={th}>BL No</th>
                    <th style={th}>Vessel</th>
                    <th style={th}>Container</th>
                    <th style={th}>ETD</th>
                    <th style={th}>ETA</th>
                    <th style={th}>DN(s)</th>
                    <th style={{ ...th, textAlign: "right" }}>DNs</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                    <th style={th}>Ship From</th>
                    <th style={th}>Ship To</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShip.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No shipments found</td></tr>
                  ) : filteredShip.map(row => (
                    <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{row.shipment_no ?? "-"}</td>
                      <td style={td}><StatusBadge status={row.status} /></td>
                      <td style={td}>{row.bl_no ?? "-"}</td>
                      <td style={td}>{row.vessel_name ?? "-"}</td>
                      <td style={td}>{row.container_no ?? "-"}</td>
                      <td style={td}>{formatDate(row.etd)}</td>
                      <td style={td}>{formatDate(row.eta)}</td>
                      <td style={{ ...td, fontSize: 12, color: "#6b7280", maxWidth: 180 }}>{row.dn_summary ?? "-"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.dn_count}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{(row.total_qty ?? 0).toLocaleString()}</td>
                      <td style={td}>{row.ship_from_summary ?? "-"}</td>
                      <td style={td}>{row.ship_to_summary ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "11px 14px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "#374151",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "11px 14px",
  verticalAlign: "middle",
};
