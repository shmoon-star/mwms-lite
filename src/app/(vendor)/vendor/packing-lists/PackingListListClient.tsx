"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PackingListRow = {
  id: string;
  packing_list_no: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  status: string | null;
  asn_created: boolean | null;
  asn_id: string | null;
  created_at: string | null;
  finalized_at: string | null;
};

type ApiResponse = {
  ok?: boolean;
  items?: PackingListRow[];
  error?: string;
};

function fmtDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function badgeStyle(status: string | null): React.CSSProperties {
  const s = (status || "").toUpperCase();

  if (s === "FINALIZED") {
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

  if (s === "SUBMITTED") {
    return {
      padding: "4px 8px",
      borderRadius: 8,
      background: "#dbeafe",
      color: "#1d4ed8",
      fontWeight: 600,
      fontSize: 12,
      display: "inline-block",
    };
  }

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

export default function PackingListListClient() {
  const [items, setItems] = useState<PackingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/vendor/packing-lists", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const text = await res.text();

      let json: ApiResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load packing lists");
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
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((row) => {
      const target = [
        row.packing_list_no,
        row.vendor_name,
        row.vendor_id,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return target.includes(keyword);
    });
  }, [items, q]);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

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
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>Vendor Packing Lists</div>
          <div style={{ color: "#666", marginTop: 4 }}>
            벤더 포탈에서 Packing List 생성 / 조회 / Finalize
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/vendor/packing-lists/new">
            <button>New Packing List</button>
          </Link>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search PL / Vendor / Status..."
          style={{
            padding: "10px 12px",
            minWidth: 280,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Packing List No</th>
              <th style={th}>Vendor</th>
              <th style={th}>Status</th>
              <th style={th}>ASN</th>
              <th style={th}>Created At</th>
              <th style={th}>Finalized At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>
                  No packing lists found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{row.packing_list_no ?? row.id}</td>
                  <td style={td}>{row.vendor_name ?? row.vendor_id ?? "-"}</td>
                  <td style={td}>
                    <span style={badgeStyle(row.status)}>{row.status ?? "-"}</span>
                  </td>
                  <td style={td}>
                    {row.asn_id ? (
                      <Link href={`/inbound/asn/${row.asn_id}`}>{row.asn_id}</Link>
                    ) : row.asn_created ? (
                      "Created"
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={td}>{fmtDate(row.created_at)}</td>
                  <td style={td}>{fmtDate(row.finalized_at)}</td>
                  <td style={td}>
                    <Link href={`/vendor/packing-lists/${row.id}`}>
                      <button>Open</button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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