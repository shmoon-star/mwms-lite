"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type DnLine = {
  id: string;
  sku: string;
  qty_ordered: number | null;
  qty_shipped: number | null;
  created_at: string | null;
};

type DnData = {
  id: string;
  dn_no: string | null;
  status: string | null;
  customer_name: string | null;
  channel: string | null;
  ship_to: string | null;
  ship_from: string | null;
  requested_at: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  remarks: string | null;
  dn_lines: DnLine[];
};

const STATUS_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:         { label: "Pending",         bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  RESERVED:        { label: "Reserved",        bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  PICKED:          { label: "Picked",          bg: "#e0e7ff", color: "#3730a3", border: "#c7d2fe" },
  PACKED:          { label: "Packed",          bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  PARTIAL_SHIPPED: { label: "Partial Shipped", bg: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
  SHIPPED:         { label: "Shipped",         bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  CONFIRMED:       { label: "Confirmed",       bg: "#f0fdf4", color: "#14532d", border: "#86efac" },
  CANCELLED:       { label: "Cancelled",       bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = String(status || "").toUpperCase();
  const m = STATUS_META[s] ?? { label: s || "-", bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  return (
    <span style={{
      display: "inline-flex", padding: "3px 14px", borderRadius: 9999,
      fontSize: 13, fontWeight: 700,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  );
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v?: string | null) {
  return fmtDate(v) || "-";
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 110, color: "#6b7280", fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{value || "-"}</span>
    </div>
  );
}

function normalizeDN(raw: any): DnData | null {
  if (!raw) return null;
  const root = raw ?? {};
  const data = root?.data ?? {};
  const dn = root?.dn ?? data?.dn ?? {};
  const header = root?.header ?? data?.header ?? {};
  const merged = { ...root, ...data, ...header, ...dn };

  const linesSource = Array.isArray(merged?.dn_lines) ? merged.dn_lines
    : Array.isArray(merged?.lines) ? merged.lines
    : Array.isArray(root?.lines) ? root.lines
    : [];

  return {
    id: String(merged?.id ?? ""),
    dn_no: merged?.dn_no ?? null,
    status: merged?.status ?? null,
    channel: merged?.channel ?? merged?.sales_channel ?? null,
    customer_name: merged?.customer_name ?? merged?.customer ?? null,
    ship_from: merged?.ship_from ?? null,
    ship_to: merged?.ship_to ?? merged?.ship_to_name ?? merged?.customer_name ?? null,
    requested_at: merged?.requested_at ?? null,
    created_at: merged?.created_at ?? null,
    confirmed_at: merged?.confirmed_at ?? null,
    shipped_at: merged?.shipped_at ?? null,
    remarks: merged?.remarks ?? null,
    dn_lines: linesSource.map((r: any, i: number) => ({
      id: String(r?.id ?? `line-${i}`),
      sku: String(r?.sku ?? "-"),
      qty_ordered: safeNum(r?.qty_ordered ?? r?.qty ?? r?.ordered_qty),
      qty_shipped: safeNum(r?.qty_shipped ?? r?.qty_packed ?? r?.packed_qty ?? r?.qty_received),
      created_at: r?.created_at ?? null,
    })),
  };
}

export default function DNDetailClient({ id }: { id: string }) {
  const [dn, setDn] = useState<DnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/wms/dn/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load DN");
      setDn(normalizeDN(json));
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const status = String(dn?.status || "").toUpperCase();
  const canShip = ["PENDING", "RESERVED", "PICKED", "PACKED"].includes(status);
  const isShipped = status === "SHIPPED";
  const isConfirmed = status === "CONFIRMED";
  const isCancelled = status === "CANCELLED";

  const totals = useMemo(() => {
    const lines = dn?.dn_lines ?? [];
    const ordered = lines.reduce((s, l) => s + safeNum(l.qty_ordered), 0);
    const shipped = lines.reduce((s, l) => s + safeNum(l.qty_shipped), 0);
    return { ordered, shipped, balance: Math.max(ordered - shipped, 0) };
  }, [dn]);

  async function doAction(url: string, label: string) {
    if (!confirm(`${label} 처리하시겠습니까?`)) return;
    setWorking(true);
    try {
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <div style={{ padding: 32, color: "#6b7280" }}>Loading...</div>;
  if (error) return (
    <div style={{ padding: 32 }}>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#991b1b" }}>{error}</div>
    </div>
  );
  if (!dn) return <div style={{ padding: 32 }}>DN not found</div>;

  return (
    <div style={{ padding: 28 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 8 }}>
        <Link href="/outbound/dn" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Back to DN List
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{dn.dn_no ?? dn.id}</h1>
        <StatusBadge status={dn.status} />
      </div>

      {/* 수량 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Qty Ordered", value: totals.ordered },
          { label: "Qty Shipped", value: totals.shipped },
          { label: "Balance", value: totals.balance },
        ].map(c => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.label === "Balance" && c.value > 0 ? "#b45309" : "#111" }}>
              {c.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* DN 정보 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20, background: "#fafafa" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          DN Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
          <InfoRow label="DN No" value={dn.dn_no} />
          <InfoRow label="Status" value={dn.status} />
          <InfoRow label="Ship From" value={dn.ship_from} />
          <InfoRow label="Ship To" value={dn.ship_to} />
          <InfoRow label="Customer" value={dn.customer_name} />
          <InfoRow label="Channel" value={dn.channel} />
          <InfoRow label="Created" value={fmt(dn.created_at)} />
          <InfoRow label="Shipped" value={fmt(dn.shipped_at)} />
          <InfoRow label="Confirmed" value={fmt(dn.confirmed_at)} />
          {dn.remarks && <InfoRow label="Remarks" value={dn.remarks} />}
        </div>
      </div>

      {/* 액션 버튼 */}
      {!isConfirmed && !isCancelled && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 20, background: "#fff", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#6b7280", marginRight: 4 }}>Actions:</span>

          {canShip && (
            <button
              onClick={() => doAction(`/api/dn/${id}/ship`, "이 DN을 출하(SHIP)")}
              disabled={working}
              style={primaryBtn}
            >
              🚚 Ship DN
            </button>
          )}

          {isShipped && (
            <button
              onClick={() => doAction(`/api/dn/confirm/${id}`, "이 DN을 Confirm")}
              disabled={working}
              style={primaryBtn}
            >
              ✅ Confirm DN
            </button>
          )}

          <button onClick={load} disabled={working} style={outlineBtn}>
            Refresh
          </button>

          {working && <span style={{ fontSize: 13, color: "#6b7280" }}>처리 중...</span>}
        </div>
      )}

      {(isConfirmed || isCancelled) && (
        <div style={{
          border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 20,
          background: isConfirmed ? "#f0fdf4" : "#fef2f2",
          color: isConfirmed ? "#166534" : "#991b1b",
          fontSize: 13, fontWeight: 600,
        }}>
          {isConfirmed ? "✅ 이 DN은 Confirm 완료되었습니다." : "❌ 이 DN은 취소되었습니다."}
        </div>
      )}

      {/* 라인 테이블 */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
        DN Lines <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400 }}>({dn.dn_lines.length} SKUs)</span>
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>SKU</th>
              <th style={{ ...th, textAlign: "right" }}>Qty Ordered</th>
              <th style={{ ...th, textAlign: "right" }}>Qty Shipped</th>
              <th style={{ ...th, textAlign: "right" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {dn.dn_lines.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No lines</td></tr>
            ) : (
              dn.dn_lines.map(line => {
                const ordered = safeNum(line.qty_ordered);
                const shipped = safeNum(line.qty_shipped);
                const balance = Math.max(ordered - shipped, 0);
                return (
                  <tr key={line.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 13 }}>{line.sku}</td>
                    <td style={{ ...td, textAlign: "right" }}>{ordered.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", color: shipped > 0 ? "#166534" : undefined }}>
                      {shipped.toLocaleString()}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: balance > 0 ? 600 : 400, color: balance > 0 ? "#b45309" : "#6b7280" }}>
                      {balance.toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {dn.dn_lines.length > 0 && (
            <tfoot style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
              <tr>
                <td style={{ ...td, fontWeight: 700, color: "#374151" }}>Total</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{totals.ordered.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{totals.shipped.toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, color: totals.balance > 0 ? "#b45309" : "#6b7280" }}>
                  {totals.balance.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ── styles ── */
const primaryBtn: React.CSSProperties = {
  padding: "9px 20px", border: "none", borderRadius: 8,
  background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const outlineBtn: React.CSSProperties = {
  padding: "9px 16px", border: "1px solid #d1d5db", borderRadius: 8,
  background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const th: React.CSSProperties = {
  padding: "12px 14px", textAlign: "left", fontWeight: 600, fontSize: 13, color: "#374151",
};
const td: React.CSSProperties = { padding: "11px 14px", verticalAlign: "middle" };
