"use client";

import { useEffect, useState } from "react";

type Inventory = {
  sku: string;
  qty_onhand: number;
  qty_reserved: number;
  allocated: number;
};

export default function InventoryPage() {
  const [rows, setRows] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const res = await fetch("/api/inventory", { cache: "no-store" });
    const json = await res.json();

    setRows(json.rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function downloadCsv() {
    window.location.href = "/api/inventory/export";
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Inventory</h2>

      {/* 버튼 영역 */}
      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <button onClick={load}>
          Refresh
        </button>

        <button onClick={downloadCsv}>
          Download CSV
        </button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>On Hand</th>
            <th style={th}>Reserved</th>
            <th style={th}>Allocated</th>
            <th style={th}>Available</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const available =
              (r.qty_onhand ?? 0) -
              (r.qty_reserved ?? 0) -
              (r.allocated ?? 0);

            return (
              <tr key={r.sku}>
                <td style={td}>{r.sku}</td>
                <td style={td}>{r.qty_onhand}</td>
                <td style={td}>{r.qty_reserved}</td>
                <td style={td}>{r.allocated}</td>
                <td style={td}>
                  <b>{available}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f5f5f5",
};

const td = {
  border: "1px solid #ddd",
  padding: 8,
};