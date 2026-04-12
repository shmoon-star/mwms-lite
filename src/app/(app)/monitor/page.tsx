"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type FilterType = "ALL" | "OPEN" | "CLOSED";

type PackingListRow = {
  id: string;
  pl_no?: string | null;
  po_id?: string | null;
  po_no?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  asn_id?: string | null;
  asn_no?: string | null;
  eta?: string | null;
  qty?: number | null;
  status?: string | null;
  created_at?: string | null;
  finalized_at?: string | null;
};

type ASNRow = {
  id: string;
  asn_no?: string | null;
  po_no?: string | null;
  po_id?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_ref_no?: string | null;
  header_status?: string | null;
  computed_status?: string | null;
  total_cartons?: number | null;
  po_qty?: number | null;
  asn_qty?: number | null;
  received_qty?: number | null;
  balance_qty?: number | null;
  gr_id?: string | null;
  gr_no?: string | null;
  gr_status?: string | null;
  gr_confirmed_at?: string | null;
  created_at?: string | null;
};

type GRRow = {
  id: string;
  gr_no?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  asn_id?: string | null;
  asn_no?: string | null;
  po_id?: string | null;
  po_no?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
  expected_total?: number | null;
  received_total?: number | null;
};

type DNRow = {
  id: string;
  dn_no?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  qty?: number | null;
  planned_gi_date?: string | null;
  planned_delivery_date?: string | null;
};

type ShipmentDnItem = {
  id: string;
  dn_no: string | null;
  status: string | null;
  ship_from: string | null;
  ship_to: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
  shipped_at: string | null;
};

type ShipmentRow = {
  id: string;
  shipment_no: string | null;
  status: string | null;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  vessel_name: string | null;
  container_no: string | null;
  created_at: string | null;
  closed_at: string | null;
  dn_count: number;
  pallet_count: number;
  dn_list: ShipmentDnItem[];
  is_closed: boolean;
};

type MonitorApiResponse = {
  ok: boolean;
  open_dn?: number;
  reserved_dn?: number;
  shipped_dn?: number;

  open_pl?: number;
  draft_pl?: number;
  submitted_pl?: number;
  finalized_pl?: number;
  inbound_completed_pl?: number;

  open_asn?: number;
  created_asn?: number;
  partial_received_asn?: number;
  full_received_asn?: number;

  pending_gr?: number;
  confirmed_gr?: number;

  totals?: {
    dn?: number;
    packing_list?: number;
    asn?: number;
    gr?: number;
  };

  recent?: {
    dns: DNRow[];
    packing_lists: PackingListRow[];
    asns: ASNRow[];
    grs: any[];
  };

  error?: string;
};

type SummaryCardProps = {
  title: string;
  total: number;
  totalQty?: number;
  countUnit?: string;  // e.g. "PLs", "ASNs", "GRs", "DNs"
  qtyLabel?: string;   // e.g. "qty", "received", "DNs"
  open: number;
  openQty?: number;
  closed: number;
  closedQty?: number;
};

type SummaryState = {
  packing_list: { total: number; open: number; closed: number };
  asn: { total: number; open: number; closed: number };
  gr: { total: number; open: number; closed: number };
  dn: { total: number; open: number; closed: number };
  shipment: { total: number; open: number; closed: number };
};

type ASNLookupRow = {
  id: string;
  asn_no?: string | null;
  po_id?: string | null;
  po_no?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  vendor_name?: string | null;
};

function SummaryCard({
  title,
  total, totalQty,
  countUnit = "cases", qtyLabel = "qty",
  open, openQty,
  closed, closedQty,
}: SummaryCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "14px 16px",
        minWidth: 200,
        background: "#fff",
      }}
    >
      {/* Title */}
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, fontWeight: 500 }}>{title}</div>

      {/* Big number row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{total.toLocaleString()}</span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{countUnit}</span>
        {totalQty !== undefined && (
          <>
            <span style={{ fontSize: 13, color: "#d1d5db" }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{totalQty.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{qtyLabel}</span>
          </>
        )}
      </div>

      <div style={{ borderTop: "1px solid #f3f4f6", margin: "10px 0 8px" }} />

      {/* Open row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Open</span>
        <strong style={{ fontSize: 13, color: "#111827" }}>{open.toLocaleString()}</strong>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
        {openQty !== undefined && (
          <>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
            <strong style={{ fontSize: 13, color: "#111827" }}>{openQty.toLocaleString()}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
          </>
        )}
      </div>

      {/* Closed row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280", minWidth: 46 }}>Closed</span>
        <strong style={{ fontSize: 13, color: "#111827" }}>{closed.toLocaleString()}</strong>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{countUnit}</span>
        {closedQty !== undefined && (
          <>
            <span style={{ fontSize: 11, color: "#d1d5db" }}>/</span>
            <strong style={{ fontSize: 13, color: "#111827" }}>{closedQty.toLocaleString()}</strong>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{qtyLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}

function FilterButtons({
  value,
  onChange,
}: {
  value: FilterType;
  onChange: (value: FilterType) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => onChange("ALL")}
        style={value === "ALL" ? activeFilterBtn : filterBtn}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onChange("OPEN")}
        style={value === "OPEN" ? activeFilterBtn : filterBtn}
      >
        Open
      </button>
      <button
        type="button"
        onClick={() => onChange("CLOSED")}
        style={value === "CLOSED" ? activeFilterBtn : filterBtn}
      >
        Closed
      </button>
    </div>
  );
}

function PackingListSectionTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: PackingListRow[];
  emptyText?: string;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {rows.length === 0 ? (
        <div style={{ color: "#666" }}>{emptyText ?? "No data"}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>PO No</th>
              <th style={th}>Vendor</th>
              <th style={th}>PL No</th>
              <th style={th}>ASN No</th>
              <th style={th}>ETA</th>
              <th style={th}>Qty</th>
              <th style={th}>Status</th>
              <th style={th}>Created At</th>
              <th style={th}>Confirmed / Finalized</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  {r.po_id ? (
                    <a href={`/inbound/po/${r.po_id}`} style={link}>
                      {r.po_no ?? "-"}
                    </a>
                  ) : (
                    r.po_no ?? "-"
                  )}
                </td>

                <td style={td}>
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                    <span>{r.vendor_name ?? "-"}</span>
                    <span style={{ fontSize: 12, color: "#666" }}>{r.vendor_code ?? "-"}</span>
                  </div>
                </td>

                <td style={td}>
                  <a href={`/vendor/packing-lists/${r.id}`} style={link}>
                    {r.pl_no ?? "-"}
                  </a>
                </td>

                <td style={td}>
                  {r.asn_id ? (
                    <a href={`/inbound/asn/${r.asn_id}`} style={link}>
                      {r.asn_no ?? "-"}
                    </a>
                  ) : (
                    r.asn_no ?? "-"
                  )}
                </td>

                <td style={td}>{formatDate(r.eta)}</td>
                <td style={td}>{Number(r.qty ?? 0)}</td>
                <td style={td}>{r.status ?? "-"}</td>
                <td style={td}>{formatDate(r.created_at)}</td>
                <td style={td}>{formatDate(r.finalized_at)}</td>
                <td style={td}>
                  <a href={`/vendor/packing-lists/${r.id}`}>
                    {getActionLabelByOpenClosed(isPLOpen(r.status))}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ASNSectionTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: ASNRow[];
  emptyText?: string;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {rows.length === 0 ? (
        <div style={{ color: "#666" }}>{emptyText ?? "No data"}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>ASN No</th>
              <th style={th}>Vendor</th>
              <th style={th}>PO No</th>
              <th style={th}>PL No</th>
              <th style={th}>ASN Qty</th>
              <th style={th}>Received Qty</th>
              <th style={th}>Balance Qty</th>
              <th style={th}>Status</th>
              <th style={th}>GR No</th>
              <th style={th}>GR Status</th>
              <th style={th}>Created At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const displayStatus = r.computed_status ?? r.header_status ?? "-";
              const isOpen = isASNOpen(displayStatus);

              return (
                <tr key={r.id}>
                  <td style={td}>
                    <a href={`/inbound/asn/${r.id}`} style={link}>
                      {r.asn_no ?? "-"}
                    </a>
                  </td>

                  <td style={td}>
                    {r.vendor_name ? (
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                        <span>{r.vendor_name}</span>
                        <span style={{ fontSize: 12, color: "#666" }}>
                          {r.vendor_code ?? "-"}
                        </span>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td style={td}>{r.po_no ?? "-"}</td>
                  <td style={td}>{r.source_ref_no ?? "-"}</td>
                  <td style={td}>{Number(r.asn_qty ?? 0)}</td>
                  <td style={td}>{Number(r.received_qty ?? 0)}</td>
                  <td style={td}>{Number(r.balance_qty ?? 0)}</td>
                  <td style={td}>{displayStatus}</td>
                  <td style={td}>{r.gr_no ?? "-"}</td>
                  <td style={td}>{r.gr_status ?? "-"}</td>
                  <td style={td}>{formatDate(r.created_at)}</td>
                  <td style={td}>
                    <a href={`/inbound/asn/${r.id}`}>
                      {getActionLabelByOpenClosed(isOpen)}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GRSectionTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: GRRow[];
  emptyText?: string;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {rows.length === 0 ? (
        <div style={{ color: "#666" }}>{emptyText ?? "No data"}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>GR No</th>
              <th style={th}>Vendor</th>
              <th style={th}>ASN No</th>
              <th style={th}>PO No</th>
              <th style={th}>Expected Qty</th>
              <th style={th}>Received Qty</th>
              <th style={th}>Status</th>
              <th style={th}>Created At</th>
              <th style={th}>Confirmed</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <a href={`/inbound/gr/${r.id}`} style={link}>
                    {r.gr_no ?? "-"}
                  </a>
                </td>

                <td style={td}>
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                    <span>{r.vendor_name ?? "-"}</span>
                    <span style={{ fontSize: 12, color: "#666" }}>{r.vendor_code ?? "-"}</span>
                  </div>
                </td>

                <td style={td}>
                  {r.asn_id ? (
                    <a href={`/inbound/asn/${r.asn_id}`} style={link}>
                      {r.asn_no ?? "-"}
                    </a>
                  ) : (
                    r.asn_no ?? "-"
                  )}
                </td>

                <td style={td}>
                  {r.po_id ? (
                    <a href={`/inbound/po/${r.po_id}`} style={link}>
                      {r.po_no ?? "-"}
                    </a>
                  ) : (
                    r.po_no ?? "-"
                  )}
                </td>

                <td style={td}>{Number(r.expected_total ?? 0)}</td>
                <td style={td}>{Number(r.received_total ?? 0)}</td>
                <td style={td}>{r.status ?? "-"}</td>
                <td style={td}>{formatDate(r.created_at)}</td>
                <td style={td}>{formatDate(r.confirmed_at)}</td>
                <td style={td}>
                  <a href={`/inbound/gr/${r.id}`}>
                    {getActionLabelByOpenClosed(isGROpen(r.status))}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DNSectionTable({
  title,
  rows,
}: {
  title: string;
  rows: DNRow[];
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {rows.length === 0 ? (
        <div style={{ color: "#666" }}>No DN data</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>DN No</th>
              <th style={th}>Ship From</th>
              <th style={th}>Ship To</th>
              <th style={th}>Qty</th>
              <th style={th}>Status</th>
              <th style={th}>Planned GI</th>
              <th style={th}>Planned Ship</th>
              <th style={th}>Shipped At</th>
              <th style={th}>Created At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <a href={`/outbound/dn/${r.id}`} style={link}>
                    {r.dn_no ?? "-"}
                  </a>
                </td>
                <td style={td}>{r.ship_from ?? "-"}</td>
                <td style={td}>{r.ship_to ?? "-"}</td>
                <td style={td}>{Number(r.qty ?? 0)}</td>
                <td style={td}>{r.status ?? "-"}</td>
                <td style={td}>{r.planned_gi_date ? formatDateOnly(r.planned_gi_date) : "-"}</td>
                <td style={td}>{r.planned_delivery_date ? formatDateOnly(r.planned_delivery_date) : "-"}</td>
                <td style={td}>{formatDate(r.shipped_at)}</td>
                <td style={td}>{formatDate(r.created_at)}</td>
                <td style={td}>
                  <a href={`/outbound/dn/${r.id}`}>
                    {getActionLabelByOpenClosed(isDNOpen(r.status))}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShipmentSectionTable({
  title,
  rows,
}: {
  title: string;
  rows: ShipmentRow[];
}) {
  // Flatten: one row per DN. Shipments with no DNs get one row with empty DN columns.
  const flatRows: Array<{ ship: ShipmentRow; dn: ShipmentDnItem | null; isFirstDn: boolean; dnIndex: number; dnTotal: number }> = [];
  for (const ship of rows) {
    if (ship.dn_list.length === 0) {
      flatRows.push({ ship, dn: null, isFirstDn: true, dnIndex: 0, dnTotal: 0 });
    } else {
      ship.dn_list.forEach((dn, i) => {
        flatRows.push({ ship, dn, isFirstDn: i === 0, dnIndex: i, dnTotal: ship.dn_list.length });
      });
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>

      {rows.length === 0 ? (
        <div style={{ color: "#666" }}>No Shipment data</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Shipment No</th>
              <th style={th}>Status</th>
              <th style={th}>BL No</th>
              <th style={th}>ETA</th>
              <th style={th}>ETD</th>
              <th style={th}>Vessel</th>
              <th style={th}>Container</th>
              <th style={th}>DN No</th>
              <th style={th}>DN Status</th>
              <th style={th}>Ship From</th>
              <th style={th}>Ship To</th>
              <th style={th}>Planned GI</th>
              <th style={th}>Planned Ship</th>
              <th style={th}>Shipped At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map(({ ship, dn, isFirstDn, dnIndex, dnTotal }, idx) => {
              const rowSpan = dnTotal > 0 ? dnTotal : 1;
              const isNewShipment = isFirstDn;
              const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";
              return (
                <tr key={`${ship.id}-${dn?.id ?? "none"}`} style={{ background: rowBg, borderTop: isNewShipment ? "2px solid #e5e7eb" : "1px solid #f0f0f0" }}>
                  {/* Shipment columns — only on first DN row, use rowspan */}
                  {isFirstDn && (
                    <>
                      <td style={{ ...td, fontWeight: 600, verticalAlign: "top" }} rowSpan={rowSpan}>
                        <a href={`/outbound/shipment/${ship.id}`} style={link}>
                          {ship.shipment_no ?? "-"}
                        </a>
                        {dnTotal > 1 && (
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{dnTotal} DNs</div>
                        )}
                      </td>
                      <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>{ship.status ?? "-"}</td>
                      <td style={{ ...td, fontWeight: 500, color: ship.bl_no ? "#111" : "#9ca3af", verticalAlign: "top" }} rowSpan={rowSpan}>
                        {ship.bl_no ?? "-"}
                      </td>
                      <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>{ship.eta ? formatDateOnly(ship.eta) : "-"}</td>
                      <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>{ship.etd ? formatDateOnly(ship.etd) : "-"}</td>
                      <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>{ship.vessel_name ?? "-"}</td>
                      <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>{ship.container_no ?? "-"}</td>
                    </>
                  )}
                  {/* DN columns */}
                  <td style={td}>
                    {dn ? (
                      <a href={`/outbound/dn/${dn.id}`} style={link}>{dn.dn_no ?? "-"}</a>
                    ) : "-"}
                  </td>
                  <td style={td}>{dn?.status ?? "-"}</td>
                  <td style={td}>{dn?.ship_from ?? "-"}</td>
                  <td style={td}>{dn?.ship_to ?? "-"}</td>
                  <td style={td}>{dn?.planned_gi_date ? formatDateOnly(dn.planned_gi_date) : "-"}</td>
                  <td style={td}>{dn?.planned_delivery_date ? formatDateOnly(dn.planned_delivery_date) : "-"}</td>
                  <td style={td}>{dn?.shipped_at ? formatDate(dn.shipped_at) : "-"}</td>
                  {/* Action — only on first row */}
                  {isFirstDn && (
                    <td style={{ ...td, verticalAlign: "top" }} rowSpan={rowSpan}>
                      <a href={`/outbound/shipment/${ship.id}`} style={link}>
                        {getActionLabelByOpenClosed(!ship.is_closed)}
                      </a>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function parseStatus(status?: string | null) {
  return String(status ?? "").trim().toUpperCase();
}

function isPLClosed(status?: string | null) {
  return parseStatus(status) === "INBOUND_COMPLETED";
}

// open = anything that is NOT closed  →  open + closed = total (always)
function isPLOpen(status?: string | null) {
  return !isPLClosed(status);
}

function isASNClosed(status?: string | null) {
  const s = parseStatus(status);
  return s === "FULL_RECEIVED" || s === "CONFIRMED";
}

function isASNOpen(status?: string | null) {
  return !isASNClosed(status);
}

function isGRClosed(status?: string | null) {
  return parseStatus(status) === "CONFIRMED";
}

function isGROpen(status?: string | null) {
  return !isGRClosed(status);
}

function isDNOpen(status?: string | null) {
  const s = parseStatus(status);
  return s !== "SHIPPED" && s !== "CONFIRMED";
}

function isDNClosed(status?: string | null) {
  const s = parseStatus(status);
  return s === "SHIPPED" || s === "CONFIRMED";
}

function getActionLabelByOpenClosed(isOpen: boolean) {
  return isOpen ? "Open" : "View";
}

function formatDate(value?: string | null) {
  return fmtDate(value) || "-";
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ko-KR");
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);

  const escapeCsv = (value: unknown) => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ];

  return lines.join("\n");
}

function pickArray(json: unknown): any[] {
  if (Array.isArray(json)) return json;

  if (json && typeof json === "object") {
    const obj = json as any;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.asns)) return obj.asns;
    if (Array.isArray(obj.grs)) return obj.grs;
    if (Array.isArray(obj.dns)) return obj.dns;
  }

  return [];
}

const EMPTY_SUMMARY: SummaryState = {
  packing_list: { total: 0, open: 0, closed: 0 },
  asn: { total: 0, open: 0, closed: 0 },
  gr: { total: 0, open: 0, closed: 0 },
  dn: { total: 0, open: 0, closed: 0 },
  shipment: { total: 0, open: 0, closed: 0 },
};

export default function MonitorClient() {
  const [packingLists, setPackingLists] = useState<PackingListRow[]>([]);
  const [asnRows, setAsnRows] = useState<ASNRow[]>([]);
  const [grRows, setGrRows] = useState<GRRow[]>([]);
  const [dnRows, setDnRows] = useState<DNRow[]>([]);
  const [shipmentRows, setShipmentRows] = useState<ShipmentRow[]>([]);
  const [summary, setSummary] = useState<SummaryState>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [plFilter, setPlFilter] = useState<FilterType>("OPEN");
  const [asnFilter, setAsnFilter] = useState<FilterType>("OPEN");
  const [grFilter, setGrFilter] = useState<FilterType>("OPEN");
  const [dnFilter, setDnFilter] = useState<FilterType>("OPEN");
  const [shipFilter, setShipFilter] = useState<FilterType>("ALL");

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response: ${text}`);
    }
  }

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [monitorRes, asnRes, grRes, dnRes, shipRes] = await Promise.all([
        fetch("/api/monitor", { cache: "no-store" }),
        fetch("/api/asn/list", { cache: "no-store" }),
        fetch("/api/monitor/gr?status=ALL", { cache: "no-store" }),
        fetch("/api/dn", { cache: "no-store" }),           // ← full DN data with ship_from/to
        fetch("/api/monitor/shipment", { cache: "no-store" }),
      ]);

      const [monitorJson, asnJson, grJson, dnJson, shipJson] = await Promise.all([
        parseJsonSafe(monitorRes),
        parseJsonSafe(asnRes),
        parseJsonSafe(grRes),
        parseJsonSafe(dnRes),
        parseJsonSafe(shipRes),
      ]);

      if (!monitorRes.ok || !(monitorJson as any)?.ok) {
        throw new Error((monitorJson as any)?.error || "Failed to load monitor");
      }
      if (!asnRes.ok || (asnJson as any)?.ok === false) {
        throw new Error((asnJson as any)?.error || "Failed to load ASN list");
      }
      if (!grRes.ok || (grJson as any)?.ok === false) {
        throw new Error((grJson as any)?.error || "Failed to load GR list");
      }
      if (!dnRes.ok || (dnJson as any)?.ok === false) {
        throw new Error((dnJson as any)?.error || "Failed to load DN list");
      }

      const monitorData = monitorJson as MonitorApiResponse;

      setSummary((prev) => ({
        ...prev,
        packing_list: {
          total: Number(monitorData.totals?.packing_list ?? 0),
          open: Number(monitorData.open_pl ?? 0),
          closed: Number(monitorData.inbound_completed_pl ?? 0),
        },
        asn: {
          total: Number(monitorData.totals?.asn ?? 0),
          open: Number(monitorData.open_asn ?? 0),
          closed: Number(monitorData.full_received_asn ?? 0),
        },
        gr: {
          total: Number(monitorData.totals?.gr ?? 0),
          open: Number(monitorData.pending_gr ?? 0),
          closed: Number(monitorData.confirmed_gr ?? 0),
        },
        dn: {
          total: Number(monitorData.totals?.dn ?? 0),
          open: Number(monitorData.open_dn ?? 0) + Number(monitorData.reserved_dn ?? 0),
          closed: Number(monitorData.shipped_dn ?? 0),
        },
      }));

      setPackingLists(monitorData.recent?.packing_lists ?? []);

      const rawAsns = pickArray(asnJson);
      const asnLookup = new Map<string, ASNLookupRow>();

      const mappedAsns: ASNRow[] = rawAsns.map((r: any) => {
        const row: ASNRow = {
          id: String(r.id),
          asn_no: r.asn_no ?? null,
          po_id: r.po_id ?? null,
          po_no: r.po_no ?? null,
          vendor_id: r.vendor_id ?? null,
          vendor_code: r.vendor_code ?? null,
          vendor_name: r.vendor_name ?? null,
          source_type: r.source_type ?? null,
          source_id: r.source_id ?? null,
          source_ref_no: r.source_ref_no ?? null,
          header_status: r.header_status ?? r.status ?? null,
          computed_status: r.computed_status ?? null,
          total_cartons: r.total_cartons ?? null,
          po_qty: r.po_qty ?? null,
          asn_qty: r.asn_qty ?? null,
          received_qty: r.received_qty ?? null,
          balance_qty: r.balance_qty ?? null,
          gr_id: r.gr_id ?? null,
          gr_no: r.gr_no ?? null,
          gr_status: r.gr_status ?? null,
          gr_confirmed_at: r.gr_confirmed_at ?? null,
          created_at: r.created_at ?? null,
        };

        asnLookup.set(row.id, {
          id: row.id,
          asn_no: row.asn_no ?? null,
          po_id: row.po_id ?? null,
          po_no: row.po_no ?? null,
          vendor_id: row.vendor_id ?? null,
          vendor_code: row.vendor_code ?? null,
          vendor_name: row.vendor_name ?? null,
        });

        return row;
      });

      setAsnRows(mappedAsns);

      const rawGr = pickArray(grJson);
      const mappedGr: GRRow[] = rawGr.map((r: any) => {
        const asnId = r.asn_id ?? r.asnId ?? r.asn?.id ?? r.asn_header?.id ?? null;
        const lookup = asnId ? asnLookup.get(String(asnId)) : undefined;

        return {
          id: String(r.id),
          gr_no: r.gr_no ?? r.grNo ?? null,
          status: r.status ?? null,
          created_at: r.created_at ?? r.createdAt ?? null,
          confirmed_at: r.confirmed_at ?? r.confirmedAt ?? null,
          asn_id: asnId ? String(asnId) : null,
          asn_no:
            r.asn_no ??
            r.asnNo ??
            r.asn?.asn_no ??
            r.asn_header?.asn_no ??
            lookup?.asn_no ??
            null,
          po_id:
            r.po_id ??
            r.poId ??
            r.po?.id ??
            r.po_header?.id ??
            lookup?.po_id ??
            null,
          po_no:
            r.po_no ??
            r.poNo ??
            r.po?.po_no ??
            r.po_header?.po_no ??
            lookup?.po_no ??
            null,
          vendor_id:
            r.vendor_id ??
            r.vendorId ??
            lookup?.vendor_id ??
            null,
          vendor_code:
            r.vendor_code ??
            r.vendorCode ??
            lookup?.vendor_code ??
            null,
          vendor_name:
            r.vendor_name ??
            r.vendorName ??
            lookup?.vendor_name ??
            null,
          expected_total: r.expected_total ?? r.expectedTotal ?? null,
          received_total: r.received_total ?? r.receivedTotal ?? null,
        };
      });

      setGrRows(mappedGr);

      // DN: from /api/dn which returns { ok, dns: [...] }
      const rawDn = (dnJson as any)?.dns ?? pickArray(dnJson);
      const mappedDn: DNRow[] = rawDn.map((r: any) => ({
        id: String(r.id),
        dn_no: r.dn_no ?? r.dnNo ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? r.createdAt ?? null,
        confirmed_at: r.confirmed_at ?? r.confirmedAt ?? null,
        shipped_at: r.shipped_at ?? null,
        ship_from: r.ship_from ?? null,
        ship_to: r.ship_to ?? null,
        qty: r.qty_total ?? r.qty ?? 0,
        planned_gi_date: r.planned_gi_date ?? null,
        planned_delivery_date: r.planned_delivery_date ?? null,
      }));

      setDnRows(mappedDn);

      // Shipment summary update from shipJson
      const shipSummary = (shipJson as any)?.summary ?? { total: 0, open: 0, closed: 0 };
      setSummary((prev) => ({
        ...prev,
        shipment: {
          total: shipSummary.total ?? 0,
          open: shipSummary.open ?? 0,
          closed: shipSummary.closed ?? 0,
        },
      }));

      const rawShipments = (shipJson as any)?.items ?? [];
      setShipmentRows(rawShipments);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load monitor");
      setPackingLists([]);
      setAsnRows([]);
      setGrRows([]);
      setDnRows([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }

  function downloadAllCsv() {
    const rows: Record<string, unknown>[] = [];

    packingLists.forEach((r) => {
      rows.push({
        type: "PACKING_LIST",
        po_no: r.po_no ?? "",
        vendor_name: r.vendor_name ?? "",
        vendor_code: r.vendor_code ?? "",
        pl_no: r.pl_no ?? "",
        asn_no: r.asn_no ?? "",
        eta: r.eta ?? "",
        qty: Number(r.qty ?? 0),
        status: r.status ?? "",
        created_at: r.created_at ?? "",
        finalized_at: r.finalized_at ?? "",
      });
    });

    asnRows.forEach((r) => {
      rows.push({
        type: "ASN",
        asn_no: r.asn_no ?? "",
        vendor_name: r.vendor_name ?? "",
        vendor_code: r.vendor_code ?? "",
        po_no: r.po_no ?? "",
        pl_no: r.source_ref_no ?? "",
        asn_qty: Number(r.asn_qty ?? 0),
        received_qty: Number(r.received_qty ?? 0),
        balance_qty: Number(r.balance_qty ?? 0),
        header_status: r.header_status ?? "",
        computed_status: r.computed_status ?? "",
        gr_no: r.gr_no ?? "",
        gr_status: r.gr_status ?? "",
        created_at: r.created_at ?? "",
      });
    });

    grRows.forEach((r) => {
      rows.push({
        type: "GR",
        gr_no: r.gr_no ?? "",
        vendor_name: r.vendor_name ?? "",
        vendor_code: r.vendor_code ?? "",
        po_no: r.po_no ?? "",
        asn_no: r.asn_no ?? "",
        expected_total: Number(r.expected_total ?? 0),
        received_total: Number(r.received_total ?? 0),
        status: r.status ?? "",
        created_at: r.created_at ?? "",
        confirmed_at: r.confirmed_at ?? "",
      });
    });

    dnRows.forEach((r) => {
      rows.push({
        type: "DN",
        dn_no: r.dn_no ?? "",
        ship_from: r.ship_from ?? "",
        ship_to: r.ship_to ?? "",
        qty: Number(r.qty ?? 0),
        status: r.status ?? "",
        created_at: r.created_at ?? "",
        confirmed_at: r.confirmed_at ?? "",
      });
    });

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "monitor_export.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    load();
  }, []);

  const plOpenRows = useMemo(() => packingLists.filter((r) => isPLOpen(r.status)), [packingLists]);
  const plClosedRows = useMemo(() => packingLists.filter((r) => isPLClosed(r.status)), [packingLists]);

  const asnOpenRows = useMemo(
    () => asnRows.filter((r) => isASNOpen(r.computed_status ?? r.header_status)),
    [asnRows]
  );
  const asnClosedRows = useMemo(
    () => asnRows.filter((r) => isASNClosed(r.computed_status ?? r.header_status)),
    [asnRows]
  );

  const grOpenRows = useMemo(() => grRows.filter((r) => isGROpen(r.status)), [grRows]);
  const grClosedRows = useMemo(() => grRows.filter((r) => isGRClosed(r.status)), [grRows]);

  const dnOpenRows = useMemo(() => dnRows.filter((r) => isDNOpen(r.status)), [dnRows]);
  const dnClosedRows = useMemo(() => dnRows.filter((r) => isDNClosed(r.status)), [dnRows]);

  const shipOpenRows = useMemo(() => shipmentRows.filter((r) => !r.is_closed), [shipmentRows]);
  const shipClosedRows = useMemo(() => shipmentRows.filter((r) => r.is_closed), [shipmentRows]);

  const plDisplayRows = useMemo(() => {
    if (plFilter === "ALL") return packingLists;
    if (plFilter === "OPEN") return plOpenRows;
    return plClosedRows;
  }, [plFilter, packingLists, plOpenRows, plClosedRows]);

  const asnDisplayRows = useMemo(() => {
    if (asnFilter === "ALL") return asnRows;
    if (asnFilter === "OPEN") return asnOpenRows;
    return asnClosedRows;
  }, [asnFilter, asnRows, asnOpenRows, asnClosedRows]);

  const grDisplayRows = useMemo(() => {
    if (grFilter === "ALL") return grRows;
    if (grFilter === "OPEN") return grOpenRows;
    return grClosedRows;
  }, [grFilter, grRows, grOpenRows, grClosedRows]);

  const dnDisplayRows = useMemo(() => {
    if (dnFilter === "ALL") return dnRows;
    if (dnFilter === "OPEN") return dnOpenRows;
    return dnClosedRows;
  }, [dnFilter, dnRows, dnOpenRows, dnClosedRows]);

  const shipDisplayRows = useMemo(() => {
    if (shipFilter === "ALL") return shipmentRows;
    if (shipFilter === "OPEN") return shipOpenRows;
    return shipClosedRows;
  }, [shipFilter, shipmentRows, shipOpenRows, shipClosedRows]);

  if (loading) {
    return <div style={{ padding: 20 }}>Loading monitor...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 6 }}>Monitor</h2>
          <div style={{ color: "#666" }}>Open / Closed operational monitoring</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={button}>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards — counts & qty computed from loaded rows for consistency */}
      {(() => {
        // ── Packing List ──────────────────────────────────────────────────────
        const plOpen_rows   = packingLists.filter(r => isPLOpen(r.status));
        const plClosed_rows = packingLists.filter(r => isPLClosed(r.status));
        const plTotal   = packingLists.length;
        const plOpen    = plOpen_rows.length;
        const plClosed  = plClosed_rows.length;
        const plQtyAll    = packingLists.reduce((s, r) => s + Number(r.qty ?? 0), 0);
        const plQtyOpen   = plOpen_rows.reduce((s, r) => s + Number(r.qty ?? 0), 0);
        const plQtyClosed = plClosed_rows.reduce((s, r) => s + Number(r.qty ?? 0), 0);

        // ── ASN ───────────────────────────────────────────────────────────────
        const asnOpen_rows   = asnRows.filter(r => isASNOpen(r.computed_status ?? r.header_status));
        const asnClosed_rows = asnRows.filter(r => isASNClosed(r.computed_status ?? r.header_status));
        const asnTotal   = asnRows.length;
        const asnOpen    = asnOpen_rows.length;
        const asnClosed  = asnClosed_rows.length;
        const asnQtyAll    = asnRows.reduce((s, r) => s + Number(r.asn_qty ?? 0), 0);
        const asnQtyOpen   = asnOpen_rows.reduce((s, r) => s + Number(r.asn_qty ?? 0), 0);
        const asnQtyClosed = asnClosed_rows.reduce((s, r) => s + Number(r.asn_qty ?? 0), 0);

        // ── GR ────────────────────────────────────────────────────────────────
        const grOpen_rows   = grRows.filter(r => isGROpen(r.status));
        const grClosed_rows = grRows.filter(r => isGRClosed(r.status));
        const grTotal   = grRows.length;
        const grOpen    = grOpen_rows.length;
        const grClosed  = grClosed_rows.length;
        const grQtyAll    = grRows.reduce((s, r) => s + Number(r.received_total ?? 0), 0);
        const grQtyOpen   = grOpen_rows.reduce((s, r) => s + Number(r.received_total ?? 0), 0);
        const grQtyClosed = grClosed_rows.reduce((s, r) => s + Number(r.received_total ?? 0), 0);

        // ── DN ────────────────────────────────────────────────────────────────
        const dnOpen_rows   = dnRows.filter(r => isDNOpen(r.status));
        const dnClosed_rows = dnRows.filter(r => isDNClosed(r.status));
        const dnTotal   = dnRows.length;
        const dnOpen    = dnOpen_rows.length;
        const dnClosed  = dnClosed_rows.length;
        const dnQtyAll    = dnRows.reduce((s, r) => s + Number(r.qty ?? 0), 0);
        const dnQtyOpen   = dnOpen_rows.reduce((s, r) => s + Number(r.qty ?? 0), 0);
        const dnQtyClosed = dnClosed_rows.reduce((s, r) => s + Number(r.qty ?? 0), 0);

        // ── Shipment ──────────────────────────────────────────────────────────
        const shipOpen_rows   = shipmentRows.filter(r => !r.is_closed);
        const shipClosed_rows = shipmentRows.filter(r => r.is_closed);
        const shipTotal   = shipmentRows.length;
        const shipOpen    = shipOpen_rows.length;
        const shipClosed  = shipClosed_rows.length;
        const shipDnsAll    = shipmentRows.reduce((s, r) => s + (r.dn_count ?? 0), 0);
        const shipDnsOpen   = shipOpen_rows.reduce((s, r) => s + (r.dn_count ?? 0), 0);
        const shipDnsClosed = shipClosed_rows.reduce((s, r) => s + (r.dn_count ?? 0), 0);

        return (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <SummaryCard
              title="Packing List"
              total={plTotal}   totalQty={plQtyAll}
              countUnit="PLs"   qtyLabel="qty"
              open={plOpen}     openQty={plQtyOpen}
              closed={plClosed} closedQty={plQtyClosed}
            />
            <SummaryCard
              title="ASN"
              total={asnTotal}   totalQty={asnQtyAll}
              countUnit="ASNs"   qtyLabel="qty"
              open={asnOpen}     openQty={asnQtyOpen}
              closed={asnClosed} closedQty={asnQtyClosed}
            />
            <SummaryCard
              title="GR"
              total={grTotal}   totalQty={grQtyAll}
              countUnit="GRs"   qtyLabel="received"
              open={grOpen}     openQty={grQtyOpen}
              closed={grClosed} closedQty={grQtyClosed}
            />
            <SummaryCard
              title="DN"
              total={dnTotal}   totalQty={dnQtyAll}
              countUnit="DNs"   qtyLabel="qty"
              open={dnOpen}     openQty={dnQtyOpen}
              closed={dnClosed} closedQty={dnQtyClosed}
            />
            <SummaryCard
              title="Shipment"
              total={shipTotal}   totalQty={shipDnsAll}
              countUnit="Shipments" qtyLabel="DNs"
              open={shipOpen}     openQty={shipDnsOpen}
              closed={shipClosed} closedQty={shipDnsClosed}
            />
          </div>
        );
      })()}

      {/* Packing List */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Packing List</h3>
          <a href="/api/monitor/export/pl" download style={dlBtn}>
            ⬇ Detail CSV (SKU)
          </a>
        </div>
        <FilterButtons value={plFilter} onChange={setPlFilter} />
        <PackingListSectionTable
          title={`Packing List (${plFilter})`}
          rows={plDisplayRows}
          emptyText="No Packing List data"
        />
      </div>

      {/* ASN */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>ASN</h3>
          <a href="/api/wms/monitor/asn/export/detail?view=all" download style={dlBtn}>
            ⬇ Detail CSV (SKU)
          </a>
        </div>
        <FilterButtons value={asnFilter} onChange={setAsnFilter} />
        <ASNSectionTable
          title={`ASN List (${asnFilter})`}
          rows={asnDisplayRows}
          emptyText="No ASN data"
        />
      </div>

      {/* GR */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>GR</h3>
          <a href="/api/monitor/export/gr" download style={dlBtn}>
            ⬇ Detail CSV (SKU)
          </a>
        </div>
        <FilterButtons value={grFilter} onChange={setGrFilter} />
        <GRSectionTable
          title={`GR List (${grFilter})`}
          rows={grDisplayRows}
          emptyText="No GR data"
        />
      </div>

      {/* DN */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>DN</h3>
          <a href="/api/dn/export" download style={dlBtn}>
            ⬇ Detail CSV (SKU)
          </a>
        </div>
        <FilterButtons value={dnFilter} onChange={setDnFilter} />
        <DNSectionTable
          title={`DN List (${dnFilter})`}
          rows={dnDisplayRows}
        />
      </div>

      {/* Shipment */}
      <div style={{ marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Shipment</h3>
          <a href="/api/monitor/export/shipment" download style={dlBtn}>
            ⬇ Detail CSV (DN)
          </a>
        </div>
        <FilterButtons value={shipFilter} onChange={setShipFilter} />
        <ShipmentSectionTable
          title={`Shipment List (${shipFilter})`}
          rows={shipDisplayRows}
        />
      </div>
    </div>
  );
}

const button: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

const dlBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#374151",
  fontSize: 12,
  fontWeight: 500,
  textDecoration: "none",
  cursor: "pointer",
};

const filterBtn: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

const activeFilterBtn: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #111",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f5f5f5",
  textAlign: "left",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
};

const link: React.CSSProperties = {
  color: "#111827",
  fontWeight: 500,
  textDecoration: "none",
};