"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type GRRow = {
  id: string;
  gr_no: string | null;
  asn_id: string | null;
  asn_no: string | null;
  vendor_name: string | null;
  status: string | null;
  created_at: string | null;
  expected_total: number;
  received_total: number;
};

type ApiResponse = {
  ok?: boolean;
  items?: GRRow[];
  error?: string;
};

function badgeStyle(status: string | null): React.CSSProperties {
  const s = (status || "").toUpperCase();

  if (s === "CONFIRMED") {
    return {
      padding: "4px 8px",
      borderRadius: 8,
      background: "#dcfce7",
      color: "#166534",
      fontWeight: 600,
      fontSize: 12,
      display: "inline-block",
    };
  }

  if (s === "PENDING") {
    return {
      padding: "4px 8px",
      borderRadius: 8,
      background: "#fef3c7",
      color: "#92400e",
      fontWeight: 600,
      fontSize: 12,
      display: "inline-block",
    };
  }

  return {
    padding: "4px 8px",
    borderRadius: 8,
    background: "#e5e7eb",
    color: "#374151",
    fontWeight: 600,
    fontSize: 12,
    display: "inline-block",
  };
}

function pct(expected: number, received: number) {
  if (!expected || expected <= 0) return 0;
  return Math.min(100, Math.round((received / expected) * 100));
}

export default function GRListClient() {
  const [items, setItems] = useState<GRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/gr", window.location.origin);
      url.searchParams.set("status", status);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const text = await res.text();

      let json: ApiResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load GR list");
      }

      setItems(json.items ?? []);
    } catch (e: any) {
      setItems([]);
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((row) => {
      const target = [
        row.gr_no,
        row.asn_no,
        row.asn_id,
        row.vendor_name,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return target.includes(keyword);
    });
  }, [items, q]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.expected += Number(row.expected_total || 0);
        acc.received += Number(row.received_total || 0);
        if ((row.status || "").toUpperCase() === "CONFIRMED") acc.confirmed += 1;
        return acc;
      },
      { count: 0, expected: 0, received: 0, confirmed: 0 }
    );
  }, [filtered]);

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
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
      <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
        Inbound / GR
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          GR Bulk Upload
        </div>
        <div style={{ color: "#666", marginBottom: 16 }}>
          ASN No + Line No 기준 입고 수량 처리 템플릿
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <a href="/api/gr/template" target="_blank" rel="noreferrer">
            <button>Download Template</button>
          </a>
          <a href="/api/gr/template" target="_blank" rel="noreferrer">
            <button>Upload CSV</button>
          </a>
        </div>

        <div
          style={{
            border: "1px dashed #ccc",
            borderRadius: 12,
            padding: 16,
            background: "#fafafa",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>CSV Template Preview</div>
          <div>asn_no,line_no,sku,qty_expected,qty_received</div>
          <div>ASN-1773525278832,1,SKU001,100,100</div>
          <div>ASN-1773525278832,2,SKU002,50,48</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <SummaryCard title="Rows" value={summary.count} />
        <SummaryCard title="Expected Total" value={summary.expected} />
        <SummaryCard title="Received Total" value={summary.received} />
        <SummaryCard title="Confirmed" value={summary.confirmed} />
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["OPEN", "PENDING", "CONFIRMED", "ALL"].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatus(tab)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: status === tab ? "#111827" : "#fff",
                  color: status === tab ? "#fff" : "#111827",
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search GR / ASN / Status..."
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                minWidth: 260,
              }}
            />
            <button onClick={load}>Refresh</button>
          </div>
        </div>

        <div style={{ marginBottom: 12, color: "#666" }}>Rows: {filtered.length}</div>

        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>GR No</th>
              <th style={th}>ASN No</th>
              <th style={th}>Status</th>
              <th style={th}>Expected</th>
              <th style={th}>Received</th>
              <th style={th}>Progress</th>
              <th style={th}>Created At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={td} colSpan={8}>
                  No GR records found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const progress = pct(
                  Number(row.expected_total || 0),
                  Number(row.received_total || 0)
                );

                return (
                  <tr key={row.id}>
                    <td style={td}>
                      <Link href={`/inbound/gr/${row.id}`}>
                        {row.gr_no ?? row.id}
                      </Link>
                    </td>

                    <td style={td}>
                      {row.asn_id ? (
                        <Link href={`/inbound/asn/${row.asn_id}`}>
                          {row.asn_no ?? row.asn_id}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={td}>
                      <span style={badgeStyle(row.status)}>{row.status ?? "-"}</span>
                    </td>

                    <td style={td}>{row.expected_total ?? 0}</td>
                    <td style={td}>{row.received_total ?? 0}</td>

                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: "#e5e7eb",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${progress}%`,
                              height: "100%",
                              background: "#374151",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color: "#666", minWidth: 36 }}>
                          {progress}%
                        </span>
                      </div>
                    </td>

                    <td style={td}>{fmtDate(row.created_at) || "-"}</td>

                    <td style={td}>
                      <Link href={`/inbound/gr/${row.id}`}>
                        <button>Open</button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  textAlign: "left",
  background: "#f9fafb",
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 12,
};