"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ASNRow = {
  id: string;
  asn_no: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  status: string | null;
  created_at: string | null;
};

export default function ASNListClient() {
  const [items, setItems] = useState<ASNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const url = new URL("/api/asn/list", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load ASN list");
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

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (error) return <div style={{ padding: 20, color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ASN / Vendor / Status..."
          style={{ padding: "10px 12px", minWidth: 280, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button onClick={load}>Search</button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>ASN No</th>
            <th style={th}>Vendor</th>
            <th style={th}>Status</th>
            <th style={th}>Created At</th>
            <th style={th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td style={td} colSpan={5}>No ASN found</td>
            </tr>
          ) : (
            items.map((row) => (
              <tr key={row.id}>
                <td style={td}>{row.asn_no ?? row.id}</td>
                <td style={td}>{row.vendor_name ?? row.vendor_id ?? "-"}</td>
                <td style={td}>{row.status ?? "-"}</td>
                <td style={td}>{row.created_at ?? "-"}</td>
                <td style={td}>
                  <Link href={`/inbound/asn/${row.id}`}>Open</Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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