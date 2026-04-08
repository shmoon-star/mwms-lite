"use client";

import { useEffect, useMemo, useState } from "react";

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
  ship_from?: string | null;
  ship_to?: string | null;
  qty?: number | null;
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
  open: number;
  closed: number;
};

type SummaryState = {
  packing_list: {
    total: number;
    open: number;
    closed: number;
  };
  asn: {
    total: number;
    open: number;
    closed: number;
  };
  gr: {
    total: number;
    open: number;
    closed: number;
  };
  dn: {
    total: number;
    open: number;
    closed: number;
  };
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

function SummaryCard({ title, total, open, closed }: SummaryCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        minWidth: 220,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, marginBottom: 12 }}>
        {total}
      </div>
      <div style={{ fontSize: 13, color: "#777", marginBottom: 4 }}>Open: {open}</div>
      <div style={{ fontSize: 13, color: "#777" }}>Closed: {closed}</div>
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
              <th style={th}>Created At</th>
              <th style={th}>Confirmed</th>
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
                <td style={td}>{formatDate(r.created_at)}</td>
                <td style={td}>{formatDate(r.confirmed_at)}</td>
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

function parseStatus(status?: string | null) {
  return String(status ?? "").trim().toUpperCase();
}

function isPLOpen(status?: string | null) {
  const s = parseStatus(status);
  return s === "DRAFT" || s === "SUBMITTED" || s === "FINALIZED";
}

function isPLClosed(status?: string | null) {
  return parseStatus(status) === "INBOUND_COMPLETED";
}

function isASNOpen(status?: string | null) {
  const s = parseStatus(status);
  return s === "CREATED" || s === "PARTIAL_RECEIVED" || s === "OPEN";
}

function isASNClosed(status?: string | null) {
  const s = parseStatus(status);
  return s === "FULL_RECEIVED" || s === "CONFIRMED";
}

function isGROpen(status?: string | null) {
  return parseStatus(status) === "PENDING";
}

function isGRClosed(status?: string | null) {
  return parseStatus(status) === "CONFIRMED";
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
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR");
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
};

export default function MonitorClient() {
  const [packingLists, setPackingLists] = useState<PackingListRow[]>([]);
  const [asnRows, setAsnRows] = useState<ASNRow[]>([]);
  const [grRows, setGrRows] = useState<GRRow[]>([]);
  const [dnRows, setDnRows] = useState<DNRow[]>([]);
  const [summary, setSummary] = useState<SummaryState>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [plFilter, setPlFilter] = useState<FilterType>("OPEN");
  const [asnFilter, setAsnFilter] = useState<FilterType>("OPEN");
  const [grFilter, setGrFilter] = useState<FilterType>("OPEN");
  const [dnFilter, setDnFilter] = useState<FilterType>("OPEN");

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

      const [monitorRes, asnRes, grRes, dnRes] = await Promise.all([
        fetch("/api/monitor", { cache: "no-store" }),
        fetch("/api/asn/list", { cache: "no-store" }),
        fetch("/api/monitor/gr?status=ALL", { cache: "no-store" }),
        fetch("/api/monitor/dn?status=ALL", { cache: "no-store" }),
      ]);

      const [monitorJson, asnJson, grJson, dnJson] = await Promise.all([
        parseJsonSafe(monitorRes),
        parseJsonSafe(asnRes),
        parseJsonSafe(grRes),
        parseJsonSafe(dnRes),
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

      setSummary({
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
      });

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

      const rawDn = pickArray(dnJson);
      const mappedDn: DNRow[] = rawDn.map((r: any) => ({
        id: String(r.id),
        dn_no: r.dn_no ?? r.dnNo ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? r.createdAt ?? null,
        confirmed_at: r.confirmed_at ?? r.confirmedAt ?? null,
        ship_from: r.ship_from ?? null,
        ship_to: r.ship_to ?? null,
        qty: r.qty ?? 0,
      }));

      setDnRows(mappedDn);
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
          <button onClick={downloadAllCsv} style={button}>
            Download CSV
          </button>
          <button onClick={load} style={button}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <SummaryCard
          title="Packing List Summary"
          total={summary.packing_list.total}
          open={summary.packing_list.open}
          closed={summary.packing_list.closed}
        />
        <SummaryCard
          title="ASN Summary"
          total={summary.asn.total}
          open={summary.asn.open}
          closed={summary.asn.closed}
        />
        <SummaryCard
          title="GR Summary"
          total={summary.gr.total}
          open={summary.gr.open}
          closed={summary.gr.closed}
        />
        <SummaryCard
          title="DN Summary"
          total={summary.dn.total}
          open={summary.dn.open}
          closed={summary.dn.closed}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Packing List</h3>
        <FilterButtons value={plFilter} onChange={setPlFilter} />
        <PackingListSectionTable
          title={`Packing List (${plFilter})`}
          rows={plDisplayRows}
          emptyText="No Packing List data"
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>ASN</h3>
        <FilterButtons value={asnFilter} onChange={setAsnFilter} />
        <ASNSectionTable
          title={`ASN List (${asnFilter})`}
          rows={asnDisplayRows}
          emptyText="No ASN data"
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>GR</h3>
        <FilterButtons value={grFilter} onChange={setGrFilter} />
        <GRSectionTable
          title={`GR List (${grFilter})`}
          rows={grDisplayRows}
          emptyText="No GR data"
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>DN</h3>
        <FilterButtons value={dnFilter} onChange={setDnFilter} />
        <DNSectionTable
          title={`DN List (${dnFilter})`}
          rows={dnDisplayRows}
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