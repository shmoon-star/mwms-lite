"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TraceRow = {
  packing_list_id: string;
  packing_list_no: string | null;
  vendor_name: string | null;
  packing_list_status: string | null;
  asn_id: string | null;
  asn_no: string | null;
  asn_status: string | null;
  gr_count: number;
  grs: Array<{
    id: string;
    gr_no: string | null;
    status: string | null;
  }>;
  created_at: string | null;
};

export default function TraceClient() {
  const [items, setItems] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/monitor/trace", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load trace monitor");
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
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>PL → ASN → GR Trace</div>
          <div style={{ color: "#666", marginTop: 4 }}>Vendor Portal과 WMS 연결 모니터</div>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Packing List</th>
            <th style={th}>Vendor</th>
            <th style={th}>PL Status</th>
            <th style={th}>ASN</th>
            <th style={th}>ASN Status</th>
            <th style={th}>GR</th>
            <th style={th}>Created At</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td style={td} colSpan={7}>No trace data</td>
            </tr>
          ) : (
            items.map((row) => (
              <tr key={row.packing_list_id}>
                <td style={td}>{row.packing_list_no ?? row.packing_list_id}</td>
                <td style={td}>{row.vendor_name ?? "-"}</td>
                <td style={td}>{row.packing_list_status ?? "-"}</td>
                <td style={td}>
                  {row.asn_id ? (
                    <Link href={`/inbound/asn/${row.asn_id}`}>
                      {row.asn_no ?? row.asn_id}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td style={td}>{row.asn_status ?? "-"}</td>
                <td style={td}>
                  {row.gr_count === 0 ? (
                    "-"
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.grs.map((g) => (
                        <Link key={g.id} href={`/inbound/gr/${g.id}`}>
                          {g.gr_no ?? g.id} ({g.status ?? "-"})
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td style={td}>{row.created_at ?? "-"}</td>
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
  verticalAlign: "top",
};