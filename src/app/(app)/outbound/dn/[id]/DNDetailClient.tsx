"use client";

import { useEffect, useMemo, useState } from "react";

type DNLine = {
  id: string;
  dn_id: string;
  sku: string;
  qty_ordered: number | null;
  qty_shipped: number | null;
  created_at: string | null;
};

type DNData = {
  id: string;
  dn_no: string | null;
  status: string | null;
  customer_name: string | null;
  channel: string | null;
  ship_to: string | null;
  requested_at: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  remarks: string | null;
  dn_lines: DNLine[];
};

export default function DNDetailClient({ id }: { id: string }) {
  const [dn, setDn] = useState<DNData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const [sku, setSku] = useState("");
  const [qtyOrdered, setQtyOrdered] = useState("1");
  const [qtyShipped, setQtyShipped] = useState("1");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/dn/${id}`, { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load DN detail");
      }

      setDn(json.dn ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

const statusLabel = useMemo(() => {
  const s = dn?.status ?? "";
  if (s === "PENDING") return "Pending";
  if (s === "RESERVED") return "Reserved";
  if (s === "CONFIRMED") return "Confirmed";
  if (s === "SHIPPED") return "Shipped";
  if (s === "CANCELLED") return "Cancelled";
  return s || "-";
}, [dn?.status]);

  async function handleAddLine() {
    try {
      if (!dn) return;

      if (dn.status === "CONFIRMED") {
        alert("이미 Confirm 완료된 DN입니다.");
        return;
      }

      const payload = {
        sku: sku.trim(),
        qty_ordered: Number(qtyOrdered),
        qty_shipped: Number(qtyShipped),
      };

      const res = await fetch(`/api/dn/${id}/lines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add DN line");
      }

      setSku("");
      setQtyOrdered("1");
      setQtyShipped("1");

      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to add DN line");
    }
  }

  async function handleConfirmDN() {
    try {
      if (!dn) return;

      if (dn.status === "CONFIRMED") {
        alert("이미 Confirm 완료된 DN입니다.");
        return;
      }

      setWorking(true);

      const res = await fetch(`/api/dn/confirm/${id}`, {
        method: "POST",
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to confirm DN");
      }

      alert(`DN confirmed: ${json.dn_no ?? id}`);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to confirm DN");
    } finally {
      setWorking(false);
    }
  }

  function renderActionArea() {
    if (!dn) return null;

    if (dn.status === "CONFIRMED") {
      return (
        <div style={{ marginBottom: 16 }}>
          <button disabled>Completed</button>
          <span style={{ marginLeft: 8, color: "#666" }}>
            이 DN은 Confirm 완료되었습니다.
          </span>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleConfirmDN} disabled={working}>
          {working ? "Confirming..." : "Confirm DN"}
        </button>
      </div>
    );
  }

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

  if (!dn) {
    return <div style={{ padding: 20 }}>DN not found</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>DN Detail</h2>

      <div style={{ marginBottom: 4 }}>
        <b>DN ID:</b> {dn.id}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>DN No:</b> {dn.dn_no ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Status:</b> {statusLabel}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Customer:</b> {dn.customer_name ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Channel:</b> {dn.channel ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Ship To:</b> {dn.ship_to ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Requested At:</b> {dn.requested_at ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Created At:</b> {dn.created_at ?? "-"}
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Confirmed At:</b> {dn.confirmed_at ?? "-"}
      </div>

      {renderActionArea()}

      {dn.status !== "CONFIRMED" && (
        <div style={{ marginBottom: 24, border: "1px solid #ddd", padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Add Line</h3>

          <div style={{ marginBottom: 8 }}>
            <label style={label}>SKU</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU001"
              style={input}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={label}>Qty Ordered</label>
            <input
              value={qtyOrdered}
              onChange={(e) => setQtyOrdered(e.target.value)}
              type="number"
              min="1"
              style={input}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={label}>Qty Shipped</label>
            <input
              value={qtyShipped}
              onChange={(e) => setQtyShipped(e.target.value)}
              type="number"
              min="0"
              style={input}
            />
          </div>

          <button onClick={handleAddLine}>Add DN Line</button>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <b>Lines</b>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>Qty Ordered</th>
            <th style={th}>Qty Shipped</th>
            <th style={th}>Created At</th>
          </tr>
        </thead>
        <tbody>
          {(dn.dn_lines ?? []).map((line) => (
            <tr key={line.id}>
              <td style={td}>{line.sku}</td>
              <td style={td}>{line.qty_ordered ?? 0}</td>
              <td style={td}>{line.qty_shipped ?? 0}</td>
              <td style={td}>{line.created_at ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontWeight: 600,
};

const input: React.CSSProperties = {
  width: "100%",
  maxWidth: 320,
  padding: 8,
  border: "1px solid #ccc",
  borderRadius: 4,
};

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