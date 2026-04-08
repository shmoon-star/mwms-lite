"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  id?: string;
  sku: string;
  tx_type: string;
  qty_delta: number;
  ref_type?: string | null;
  ref_id?: string | null;
  ref_display_type?: string | null;
  ref_no?: string | null;
  related_no?: string | null;
  link_href?: string | null;
  created_at?: string | null;
  display_time?: string | null;
};

export default function InventoryLedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sku, setSku] = useState("");
  const [txType, setTxType] = useState("");
  const [refType, setRefType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function load() {
    setLoading(true);

    const params = new URLSearchParams();

    if (sku) params.set("sku", sku);
    if (txType) params.set("tx_type", txType);
    if (refType) params.set("ref_type", refType);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);

    const url = `/api/inventory/ledger?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    setRows(json.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const total = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.qty_delta ?? 0), 0);
  }, [rows]);

  function downloadCsv() {
    const params = new URLSearchParams();

    if (sku) params.set("sku", sku);
    if (txType) params.set("tx_type", txType);
    if (refType) params.set("ref_type", refType);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);

    window.location.href = `/api/inventory/ledger/export?${params.toString()}`;
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Inventory Ledger</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <input
            placeholder="TX Type"
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
          />
          <input
            placeholder="Ref Type"
            value={refType}
            onChange={(e) => setRefType(e.target.value)}
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <button onClick={load}>Search</button>
          <button onClick={downloadCsv} style={{ marginLeft: 8 }}>
            Download CSV
          </button>
          <button
            style={{ marginLeft: 8 }}
            onClick={() => {
              setSku("");
              setTxType("");
              setRefType("");
              setFromDate("");
              setToDate("");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        Rows: {rows.length} | Total Qty Delta: {total}
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>TX</th>
            <th style={th}>Qty</th>
            <th style={th}>Ref Type</th>
            <th style={th}>Ref No</th>
            <th style={th}>Related</th>
            <th style={th}>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              <td style={td}>
                <button onClick={() => setSku(r.sku)} style={link}>
                  {r.sku}
                </button>
              </td>

              <td style={td}>{r.tx_type}</td>

              <td style={td}>
                <b>{r.qty_delta}</b>
              </td>

              <td style={td}>{r.ref_display_type || r.ref_type || "-"}</td>

              <td style={td}>
                {r.link_href ? (
                  <Link href={r.link_href}>{r.ref_no || r.ref_id || "-"}</Link>
                ) : (
                  r.ref_no || r.ref_id || "-"
                )}
              </td>

              <td style={td}>{r.related_no || "-"}</td>

              <td style={td}>{r.display_time || r.created_at || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5" };
const td = { border: "1px solid #ddd", padding: 8 };
const link = {
  background: "none",
  border: "none",
  color: "blue",
  cursor: "pointer",
};