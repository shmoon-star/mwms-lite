"use client";

import { useEffect, useMemo, useState } from "react";

type WmsDNLine = {
  id: string;
  sku: string;
  qty_ordered: number | null;
  qty_shipped: number | null;
  created_at: string | null;
};

type WmsDNData = {
  id: string;
  dn_no: string | null;
  status: string | null;
  customer_name: string | null;
  channel: string | null;
  ship_to: string | null;
  requested_at: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  remarks: string | null;
  dn_lines: WmsDNLine[];
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v?: string | null) {
  if (!v) return "-";
  return v;
}

function normalizeLine(raw: any, idx: number): WmsDNLine {
  return {
    id: String(raw?.id ?? `line-${idx}`),
    sku: String(raw?.sku ?? "-"),
    qty_ordered: safeNum(
      raw?.qty_ordered ?? raw?.qty ?? raw?.ordered_qty
    ),
    qty_shipped: safeNum(
      raw?.qty_shipped ?? raw?.qty_packed ?? raw?.packed_qty ?? raw?.qty_received
    ),
    created_at: raw?.created_at ?? null,
  };
}

function normalizeDN(raw: any): WmsDNData | null {
  if (!raw) return null;

  console.log("DN RAW", raw);

  const root = raw ?? {};
  const data = root?.data ?? {};
  const dn = root?.dn ?? data?.dn ?? {};
  const header = root?.header ?? data?.header ?? {};

  const merged = {
    ...root,
    ...data,
    ...header,
    ...dn,
  };

  const linesSource = Array.isArray(merged?.dn_lines)
    ? merged.dn_lines
    : Array.isArray(merged?.lines)
      ? merged.lines
      : Array.isArray(root?.lines)
        ? root.lines
        : Array.isArray(data?.lines)
          ? data.lines
          : [];

return {
  id: String(merged?.id ?? ""),
  dn_no: merged?.dn_no ?? merged?.dnNo ?? null,
  status: merged?.status ?? null,

  channel:
    merged?.channel ??
    merged?.sales_channel ??
    merged?.channel_name ??
    null,

  customer_name:
    merged?.customer_name ??
    merged?.customer ??
    merged?.customer_label ??
    merged?.customer_display ??
    merged?.customer_code ??
    merged?.customer_no ??
    null,

  ship_to:
    merged?.ship_to ??
    merged?.ship_to_name ??
    merged?.ship_to_label ??
    merged?.ship_to_display ??
    merged?.ship_to_code ??
    merged?.ship_to_no ??
    merged?.customer_name ??
    merged?.customer ??
    merged?.customer_label ??
    null,

  requested_at: merged?.requested_at ?? null,
  created_at: merged?.created_at ?? null,
  confirmed_at: merged?.confirmed_at ?? null,
  shipped_at: merged?.shipped_at ?? null,
  remarks: merged?.remarks ?? null,
  dn_lines: linesSource.map(normalizeLine),
};
}

export default function DNDetailClient({ id }: { id: string }) {
  const [dn, setDn] = useState<WmsDNData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/wms/dn/${id}`, { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load WMS DN detail");
      }

const normalized = normalizeDN(json);

setDn(normalized);
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
    const s = String(dn?.status ?? "").toUpperCase();
    if (s === "PENDING") return "Pending";
    if (s === "RESERVED") return "Reserved";
    if (s === "PACKED") return "Packed";
    if (s === "PARTIAL_SHIPPED") return "Partial Shipped";
    if (s === "SHIPPED") return "Shipped";
    if (s === "CONFIRMED") return "Confirmed";
    if (s === "CANCELLED") return "Cancelled";
    return s || "-";
  }, [dn?.status]);

  const totals = useMemo(() => {
    const lines = dn?.dn_lines ?? [];
    const qtyOrdered = lines.reduce(
      (sum, line) => sum + safeNum(line.qty_ordered),
      0
    );
    const qtyShipped = lines.reduce(
      (sum, line) => sum + safeNum(line.qty_shipped),
      0
    );

    return {
      qtyOrdered,
      qtyShipped,
      balance: Math.max(qtyOrdered - qtyShipped, 0),
    };
  }, [dn]);

  const isCompleted = useMemo(() => {
    const s = String(dn?.status ?? "").toUpperCase();
    return s === "CONFIRMED" || s === "SHIPPED";
  }, [dn?.status]);

  async function handleConfirmDN() {
    try {
      if (!dn) return;

      if (isCompleted) {
        alert("이미 완료된 DN입니다.");
        return;
      }

      setWorking(true);

      const res = await fetch(`/api/wms/dn/${id}/confirm`, {
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

      alert(`DN confirmed: ${json.dn_no ?? dn.dn_no ?? id}`);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to confirm DN");
    } finally {
      setWorking(false);
    }
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
        <b>Requested At:</b> {fmt(dn.requested_at)}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Created At:</b> {fmt(dn.created_at)}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Confirmed At:</b> {fmt(dn.confirmed_at)}
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Shipped At:</b> {fmt(dn.shipped_at)}
      </div>

      <div style={{ marginBottom: 16 }}>
        {isCompleted ? (
          <>
            <button disabled>Completed</button>
            <span style={{ marginLeft: 8, color: "#666" }}>
              이 DN은 출고 완료되었습니다.
            </span>
          </>
        ) : (
          <button onClick={handleConfirmDN} disabled={working}>
            {working ? "Confirming..." : "Confirm DN"}
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 16 }}>
        <div><b>Qty Ordered:</b> {totals.qtyOrdered}</div>
        <div><b>Qty Shipped:</b> {totals.qtyShipped}</div>
        <div><b>Balance:</b> {totals.balance}</div>
      </div>

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
          {(dn.dn_lines ?? []).length === 0 ? (
            <tr>
              <td style={td} colSpan={4}>
                No lines
              </td>
            </tr>
          ) : (
            dn.dn_lines.map((line) => (
              <tr key={line.id}>
                <td style={td}>{line.sku}</td>
                <td style={td}>{safeNum(line.qty_ordered)}</td>
                <td style={td}>{safeNum(line.qty_shipped)}</td>
                <td style={td}>{fmt(line.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
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