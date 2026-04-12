"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type DnItem = {
  id: string;
  dn_no: string;
  status: string;
  buyer_id: string | null;
  ship_from: string | null;
  ship_to: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
  qty_total: number;
};

type Summary = {
  total_dn: number;
  open_dn: number;
  shipped_dn: number;
  total_qty: number;
  shipped_qty: number;
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

const OPEN_S  = ["PENDING","RESERVED","PICKED","PACKING","PACKED"];
const CLOSED_S = ["SHIPPED","CONFIRMED","CANCELLED"];

export default function BuyerDnPage() {
  const [items, setItems] = useState<DnItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"open"|"closed">("all");
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
      setSummary(json.summary ?? null);
      setBuyerCode(json.buyer_code ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter === "open")
      result = result.filter(r => OPEN_S.includes(String(r.status ?? "").toUpperCase()));
    else if (statusFilter === "closed")
      result = result.filter(r => CLOSED_S.includes(String(r.status ?? "").toUpperCase()));
    const q = query.trim().toLowerCase();
    if (!q) return result;
    return result.filter((row) =>
      [row.dn_no, row.status, row.ship_from ?? "", row.ship_to ?? ""]
        .join(" ").toLowerCase().includes(q)
    );
  }, [items, query, statusFilter]);

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Delivery Notes</h1>
          {buyerCode && (
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
              Buyer: <strong>{buyerCode}</strong>
            </p>
          )}
        </div>
        <button
          onClick={load}
          style={{ padding: "9px 18px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* 서머리 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total DN",   value: summary?.total_dn ?? 0,   sub: "# of delivery notes" },
          { label: "Open DN",    value: summary?.open_dn ?? 0,    sub: "Pending / Packing" },
          { label: "Shipped",    value: summary?.shipped_dn ?? 0, sub: "Shipped / Confirmed" },
          { label: "Total Qty",  value: summary?.total_qty ?? 0,  sub: "∑ qty ordered" },
          { label: "Shipped Qty",value: summary?.shipped_qty ?? 0,sub: "∑ qty shipped", highlight: false },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 20px", background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* 검색 + 상태 필터 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search DN No / Status..."
          style={{ padding: "9px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 280, outline: "none" }}
        />
        {(["all","open","closed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
              border: statusFilter === f ? "none" : "1px solid #d1d5db",
              background: statusFilter === f ? "#111" : "#fff",
              color: statusFilter === f ? "#fff" : "#374151",
            }}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : "Closed"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <a
          href="/api/buyer/dn/export"
          style={{ padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", fontSize: 13, textDecoration: "none", color: "#374151" }}
        >
          ⬇ CSV
        </a>
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
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
                <th style={th}>Planned GI</th>
                <th style={th}>Planned Ship</th>
                <th style={th}>Shipped</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
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
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{row.qty_total ?? 0}</td>
                    <td style={td}>{formatDate(row.planned_gi_date)}</td>
                    <td style={td}>{formatDate(row.planned_delivery_date)}</td>
                    <td style={td}>{fmtDate(row.shipped_at) || "-"}</td>
                    <td style={td}>{fmtDate(row.created_at) || "-"}</td>
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
