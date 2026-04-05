"use client";

import { useEffect, useMemo, useState } from "react";

type OpenDNRow = {
  dn_id: string;
  dn_no: string | null;
  status: string | null;
  header_created_at: string | null;
  reserved_at: string | null;
  picked_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
  line_id: string;
  sku: string;
  qty: number;
  qty_picked: number;
  qty_packed: number;
  qty_shipped: number;
  line_created_at: string | null;
};

export default function OpenDNPage() {
  const [rows, setRows] = useState<OpenDNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dn/open", { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load open DN list");
      }

      setRows(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const skuOk = skuFilter.trim()
        ? row.sku.toLowerCase().includes(skuFilter.trim().toLowerCase())
        : true;

      const statusOk = statusFilter.trim()
        ? String(row.status ?? "").toLowerCase() === statusFilter.trim().toLowerCase()
        : true;

      return skuOk && statusOk;
    });
  }, [rows, skuFilter, statusFilter]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Open DN Monitor</h2>
      <div style={{ color: "#666", marginBottom: 12 }}>
        Reserve만 되고 Ship이 끝나지 않은 DN / 라인 모니터링
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={skuFilter}
          onChange={(e) => setSkuFilter(e.target.value)}
          placeholder="Filter SKU"
          style={inputStyle}
        />
        <input
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="Filter Status (PENDING / RESERVED / PICKED / PACKED)"
          style={{ ...inputStyle, width: 320 }}
        />
        <button onClick={load}>Refresh</button>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red", marginBottom: 12 }}>Error: {error}</div> : null}

      {!loading && filtered.length === 0 ? (
        <div>No open DN rows</div>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>DN No</th>
              <th style={th}>Status</th>
              <th style={th}>SKU</th>
              <th style={th}>Qty</th>
              <th style={th}>Picked</th>
              <th style={th}>Packed</th>
              <th style={th}>Shipped</th>
              <th style={th}>Created At</th>
              <th style={th}>Reserved At</th>
              <th style={th}>Picked At</th>
              <th style={th}>Packed At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.line_id}>
                <td style={td}>{row.dn_no ?? "-"}</td>
                <td style={td}>{row.status ?? "-"}</td>
                <td style={td}>{row.sku}</td>
                <td style={td}>{row.qty}</td>
                <td style={td}>{row.qty_picked}</td>
                <td style={td}>{row.qty_packed}</td>
                <td style={td}>{row.qty_shipped}</td>
                <td style={td}>{row.header_created_at ?? "-"}</td>
                <td style={td}>{row.reserved_at ?? "-"}</td>
                <td style={td}>{row.picked_at ?? "-"}</td>
                <td style={td}>{row.packed_at ?? "-"}</td>
                <td style={td}>
                  <a href={`/outbound/dn/${row.dn_id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 220,
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 4,
};

const th: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px",
  textAlign: "left",
  background: "#f5f5f5",
};

const td: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "8px",
};