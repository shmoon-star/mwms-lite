"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DnItem = {
  id: string;
  dn_no: string;
  status: string;
  buyer_id: string | null;
  ship_from: string | null;
  ship_to: string | null;
  created_at: string | null;
  confirmed_at: string | null;
};

function formatDate(v: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("ko-KR");
}

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  let bg = "#f3f4f6", color = "#374151", border = "#d1d5db";

  if (s === "SHIPPED") { bg = "#dcfce7"; color = "#166534"; border = "#bbf7d0"; }
  else if (s === "CONFIRMED") { bg = "#dbeafe"; color = "#1e40af"; border = "#bfdbfe"; }
  else if (s === "PENDING") { bg = "#fef9c3"; color = "#854d0e"; border = "#fde68a"; }
  else if (s === "CANCELLED") { bg = "#fee2e2"; color = "#991b1b"; border = "#fecaca"; }

  return (
    <span style={{
      display: "inline-flex",
      padding: "2px 10px",
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      border: `1px solid ${border}`,
    }}>
      {status || "-"}
    </span>
  );
}

export default function BuyerDnPage() {
  const [items, setItems] = useState<DnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [buyerCode, setBuyerCode] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/buyer/dn", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/buyer-login";
          return;
        }
        throw new Error(json.error || "Failed to load");
      }

      setItems(json.data ?? []);
      setBuyerCode(json.buyer_code ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) =>
      [row.dn_no, row.status, row.ship_from ?? "", row.ship_to ?? ""]
        .join(" ").toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Delivery Notes</h1>
        {buyerCode && (
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Buyer: <strong>{buyerCode}</strong>
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search DN No / Status..."
          style={{
            padding: "10px 14px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
            width: 340,
            outline: "none",
          }}
        />
        <button
          onClick={load}
          style={{
            marginLeft: 8,
            padding: "10px 16px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
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
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={th}>DN No</th>
                <th style={th}>Status</th>
                <th style={th}>Ship From</th>
                <th style={th}>Ship To</th>
                <th style={th}>Created</th>
                <th style={th}>Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
                    No delivery notes found
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{row.dn_no}</td>
                    <td style={td}><StatusBadge status={row.status} /></td>
                    <td style={td}>{row.ship_from ?? "-"}</td>
                    <td style={td}>{row.ship_to ?? "-"}</td>
                    <td style={td}>{formatDate(row.created_at)}</td>
                    <td style={td}>{formatDate(row.confirmed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  color: "#374151",
};

const td: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "middle",
};
