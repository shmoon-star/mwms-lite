"use client";

import { useEffect, useMemo, useState } from "react";

type FilterType = "ALL" | "OPEN" | "CLOSED";

type PackingListRow = {
  id: string;
  pl_no?: string | null;
  po_no?: string | null;
  status?: string | null;
  created_at?: string | null;
  finalized_at?: string | null;
};

type ASNRow = {
  id: string;
  asn_no?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type GRRow = {
  id: string;
  gr_no?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
};

type DNRow = {
  id: string;
  dn_no?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
};

type MonitorApiResponse = {
  ok: boolean;

  open_dn: number;
  reserved_dn: number;
  shipped_dn: number;

  open_pl: number;
  draft_pl: number;
  submitted_pl: number;
  finalized_pl: number;
  inbound_completed_pl: number;

  open_asn: number;
  created_asn: number;
  partial_received_asn: number;
  full_received_asn: number;

  pending_gr: number;
  confirmed_gr: number;

  totals: {
    dn: number;
    packing_list: number;
    asn: number;
    gr: number;
  };

  recent: {
    dns: DNRow[];
    packing_lists: PackingListRow[];
    asns: ASNRow[];
    grs: GRRow[];
  };

  error?: string;
};

type SummaryCardProps = {
  title: string;
  total: number;
  open: number;
  closed: number;
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

function SectionTable({
  title,
  rows,
  noCol,
  openPathPrefix,
  emptyText,
  getActionLabel,
  showExtraDate = false,
}: {
  title: string;
  rows: Array<{
    id: string;
    no?: string | null;
    status?: string | null;
    created_at?: string | null;
    extra_date?: string | null;
  }>;
  noCol: string;
  openPathPrefix: string;
  emptyText?: string;
  getActionLabel: (status?: string | null) => string;
  showExtraDate?: boolean;
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
              <th style={th}>{noCol}</th>
              <th style={th}>Status</th>
              <th style={th}>Created At</th>
              {showExtraDate ? <th style={th}>Confirmed / Finalized</th> : null}
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.no ?? "-"}</td>
                <td style={td}>{r.status ?? "-"}</td>
                <td style={td}>{formatDate(r.created_at)}</td>
                {showExtraDate ? <td style={td}>{formatDate(r.extra_date)}</td> : null}
                <td style={td}>
                  <a href={`${openPathPrefix}/${r.id}`}>{getActionLabel(r.status)}</a>
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

/* ---------- PL ---------- */
function isPLOpen(status?: string | null) {
  const s = parseStatus(status);
  return s === "DRAFT" || s === "SUBMITTED" || s === "FINALIZED";
}
function isPLClosed(status?: string | null) {
  return parseStatus(status) === "INBOUND_COMPLETED";
}

/* ---------- ASN ---------- */
function isASNOpen(status?: string | null) {
  const s = parseStatus(status);
  return s === "CREATED" || s === "PARTIAL_RECEIVED";
}
function isASNClosed(status?: string | null) {
  return parseStatus(status) === "FULL_RECEIVED";
}

/* ---------- GR ---------- */
function isGROpen(status?: string | null) {
  return parseStatus(status) === "PENDING";
}
function isGRClosed(status?: string | null) {
  return parseStatus(status) === "CONFIRMED";
}

/* ---------- DN ---------- */
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

export default function MonitorClient() {
  const [packingLists, setPackingLists] = useState<PackingListRow[]>([]);
  const [asnRows, setAsnRows] = useState<ASNRow[]>([]);
  const [grRows, setGrRows] = useState<GRRow[]>([]);
  const [dnRows, setDnRows] = useState<DNRow[]>([]);
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

      const res = await fetch("/api/monitor", { cache: "no-store" });
      const json: MonitorApiResponse = await parseJsonSafe(res);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load monitor");
      }

      setPackingLists(json.recent?.packing_lists ?? []);
      setAsnRows(json.recent?.asns ?? []);
      setGrRows(json.recent?.grs ?? []);
      setDnRows(json.recent?.dns ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load monitor");
      setPackingLists([]);
      setAsnRows([]);
      setGrRows([]);
      setDnRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const plOpenRows = useMemo(
    () => packingLists.filter((r) => isPLOpen(r.status)),
    [packingLists]
  );
  const plClosedRows = useMemo(
    () => packingLists.filter((r) => isPLClosed(r.status)),
    [packingLists]
  );

  const asnOpenRows = useMemo(
    () => asnRows.filter((r) => isASNOpen(r.status)),
    [asnRows]
  );
  const asnClosedRows = useMemo(
    () => asnRows.filter((r) => isASNClosed(r.status)),
    [asnRows]
  );

  const grOpenRows = useMemo(
    () => grRows.filter((r) => isGROpen(r.status)),
    [grRows]
  );
  const grClosedRows = useMemo(
    () => grRows.filter((r) => isGRClosed(r.status)),
    [grRows]
  );

  const dnOpenRows = useMemo(
    () => dnRows.filter((r) => isDNOpen(r.status)),
    [dnRows]
  );
  const dnClosedRows = useMemo(
    () => dnRows.filter((r) => isDNClosed(r.status)),
    [dnRows]
  );

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

        <button onClick={load} style={button}>
          Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <SummaryCard
          title="Packing List Summary"
          total={packingLists.length}
          open={plOpenRows.length}
          closed={plClosedRows.length}
        />
        <SummaryCard
          title="ASN Summary"
          total={asnRows.length}
          open={asnOpenRows.length}
          closed={asnClosedRows.length}
        />
        <SummaryCard
          title="GR Summary"
          total={grRows.length}
          open={grOpenRows.length}
          closed={grClosedRows.length}
        />
        <SummaryCard
          title="DN Summary"
          total={dnRows.length}
          open={dnOpenRows.length}
          closed={dnClosedRows.length}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Packing List</h3>
        <FilterButtons value={plFilter} onChange={setPlFilter} />
        <SectionTable
          title={`Packing List (${plFilter})`}
          rows={plDisplayRows.map((r) => ({
            id: r.id,
            no: r.pl_no ?? r.po_no ?? r.id,
            status: r.status,
            created_at: r.created_at,
            extra_date: r.finalized_at ?? null,
          }))}
          noCol="PL No"
          openPathPrefix="/vendor/packing-lists"
          emptyText="No Packing List data"
          showExtraDate
          getActionLabel={(status) => getActionLabelByOpenClosed(isPLOpen(status))}
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>ASN</h3>
        <FilterButtons value={asnFilter} onChange={setAsnFilter} />
        <SectionTable
          title={`ASN List (${asnFilter})`}
          rows={asnDisplayRows.map((r) => ({
            id: r.id,
            no: r.asn_no,
            status: r.status,
            created_at: r.created_at,
          }))}
          noCol="ASN No"
          openPathPrefix="/inbound/asn"
          emptyText="No ASN data"
          getActionLabel={(status) => getActionLabelByOpenClosed(isASNOpen(status))}
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>GR</h3>
        <FilterButtons value={grFilter} onChange={setGrFilter} />
        <SectionTable
          title={`GR List (${grFilter})`}
          rows={grDisplayRows.map((r) => ({
            id: r.id,
            no: r.gr_no,
            status: r.status,
            created_at: r.created_at,
            extra_date: r.confirmed_at ?? null,
          }))}
          noCol="GR No"
          openPathPrefix="/inbound/gr"
          emptyText="No GR data"
          showExtraDate
          getActionLabel={(status) => getActionLabelByOpenClosed(isGROpen(status))}
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <h3 style={{ marginBottom: 8 }}>DN</h3>
        <FilterButtons value={dnFilter} onChange={setDnFilter} />
        <SectionTable
          title={`DN List (${dnFilter})`}
          rows={dnDisplayRows.map((r) => ({
            id: r.id,
            no: r.dn_no,
            status: r.status,
            created_at: r.created_at,
            extra_date: r.confirmed_at ?? null,
          }))}
          noCol="DN No"
          openPathPrefix="/outbound/dn"
          emptyText="No DN data"
          showExtraDate
          getActionLabel={(status) => getActionLabelByOpenClosed(isDNOpen(status))}
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