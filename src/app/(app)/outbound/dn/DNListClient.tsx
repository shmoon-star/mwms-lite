"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DNHeader = {
  id: string;
  dn_no: string | null;
  status: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  qty_total?: number | null;
  created_at: string | null;
  confirmed_at: string | null;
  reserved_at?: string | null;
  picked_at?: string | null;
  packed_at?: string | null;
  shipped_at?: string | null;
};

export default function DNListClient() {
  const router = useRouter();

  const [dns, setDns] = useState<DNHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dn", { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load DN list");
      }

      setDns(json.dns ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateDN() {
    try {
      setWorking(true);

      const res = await fetch("/api/dn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to create DN");
      }

      const createdId = json?.dn?.id;
      if (!createdId) {
        throw new Error("DN created but id is missing");
      }

      router.push(`/outbound/dn/${createdId}`);
    } catch (e: any) {
      alert(e?.message ?? "Failed to create DN");
    } finally {
      setWorking(false);
    }
  }

  const rows = useMemo(() => dns ?? [], [dns]);

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
      <h2>DN List</h2>

      <div
        style={{
          marginBottom: 24,
          border: "1px solid #ddd",
          padding: 16,
          borderRadius: 8,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Create New DN</h3>
        <button onClick={handleCreateDN} disabled={working}>
          {working ? "Creating..." : "New DN"}
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <button onClick={load} disabled={loading || working}>
          Refresh
        </button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
<tr>
  <th style={th}>DN No</th>
  <th style={th}>Ship From</th>
  <th style={th}>Ship To</th>
  <th style={th}>Qty</th>
  <th style={th}>Status</th>
  <th style={th}>Created At</th>
  <th style={th}>Confirmed At</th>
  <th style={th}>Action</th>
</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={td} colSpan={8}>
                No DN records
              </td>
            </tr>
          ) : (
            rows.map((row) => (
<tr key={row.id}>
  <td style={td}>{row.dn_no ?? "-"}</td>
  <td style={td}>{row.ship_from ?? "-"}</td>
  <td style={td}>{row.ship_to ?? "-"}</td>
  <td style={td}>{row.qty_total ?? 0}</td>
  <td style={td}>{mapStatusLabel(row.status)}</td>
  <td style={td}>{row.created_at ?? "-"}</td>
  <td style={td}>{row.confirmed_at ?? "-"}</td>
  <td style={td}>
    <button onClick={() => router.push(`/outbound/dn/${row.id}`)}>
      Open
    </button>
  </td>
</tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function mapStatusLabel(status?: string | null) {
  const s = String(status ?? "").trim().toUpperCase();

  if (s === "PENDING") return "Pending";
  if (s === "RESERVED") return "Reserved";
  if (s === "PICKED") return "Picked";
  if (s === "PACKED") return "Packed";
  if (s === "PARTIAL_SHIPPED") return "Partial Shipped";
  if (s === "SHIPPED") return "Shipped";
  if (s === "CONFIRMED") return "Confirmed";
  if (s === "CANCELLED") return "Cancelled";

  return s || "-";
}

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  textAlign: "left",
  background: "#f5f5f5",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
};