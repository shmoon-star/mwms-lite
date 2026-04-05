"use client";

import { useEffect, useState } from "react";

type TxRow = {
  id: string;
  sku: string;
  tx_type: string;
  qty_delta: number;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string | null;
};

export default function InventoryTxPage() {
  const [sku, setSku] = useState("");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const qs = sku.trim() ? `?sku=${encodeURIComponent(sku.trim())}` : "";
      const res = await fetch(`/api/inventory/tx${qs}`, { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load inventory tx");
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

  return (
    <div style={{ padding: 20 }}>
      <h2>Inventory Ledger</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Filter SKU"
          style={{
            width: 220,
            padding: "8px 10px",
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
        <button onClick={load}>Search</button>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red", marginBottom: 12 }}>Error: {error}</div> : null}

      {!loading && rows.length === 0 ? (
        <div>No ledger rows</div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Created At</th>
              <th style={th}>SKU</th>
              <th style={th}>Tx Type</th>
              <th style={th}>Qty Delta</th>
              <th style={th}>Ref Type</th>
              <th style={th}>Ref ID</th>
              <th style={th}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={td}>{row.created_at ?? "-"}</td>
                <td style={td}>{row.sku}</td>
                <td style={td}>{row.tx_type}</td>
                <td style={td}>{row.qty_delta}</td>
                <td style={td}>{row.ref_type ?? "-"}</td>
                <td style={td}>{row.ref_id ?? "-"}</td>
                <td style={td}>{row.note ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

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