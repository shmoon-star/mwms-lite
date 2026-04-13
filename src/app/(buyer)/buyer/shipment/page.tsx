"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

type Row = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  atd: string | null;
  ata: string | null;
  buyer_gr_date: string | null;
  invoice_no: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  dn_count: number;
  pallet_count: number;
  total_boxes: number;
  total_qty: number;
  total_weight: number;
  total_cbm: number;
  ship_from_summary: string;
  ship_to_summary: string;
  dn_summary: string;
  doc_count: number;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try { return new Date(v).toLocaleDateString("ko-KR"); } catch { return v; }
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  let bg = "#f3f4f6", color = "#374151", border = "#d1d5db";

  if (s === "ARRIVED")    { bg = "#dcfce7"; color = "#166534"; border = "#bbf7d0"; }
  else if (s === "SHIPPED") { bg = "#dbeafe"; color = "#1e40af"; border = "#bfdbfe"; }
  else if (s === "CLOSED")  { bg = "#e5e7eb"; color = "#374151"; border = "#d1d5db"; }
  else if (s === "OPEN")    { bg = "#fef9c3"; color = "#854d0e"; border = "#fde68a"; }
  else if (s === "PALLETIZING") { bg = "#ffedd5"; color = "#9a3412"; border = "#fed7aa"; }
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

export default function BuyerShipmentPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [buyerCode, setBuyerCode] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const qs =
        statusFilter === "ALL"
          ? "?status=ALL"
          : `?status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(`/api/buyer/shipment${qs}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/buyer-login";
          return;
        }
        throw new Error(json?.error || "Failed to load shipments");
      }

      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setBuyerCode(json.buyer_code ?? null);
    } catch (e: any) {
      alert(e?.message || "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [
        row.shipment_no, row.status,
        row.ship_from_summary, row.ship_to_summary,
        row.dn_summary, row.bl_no ?? "",
        row.eta ?? "", row.etd ?? "",
        row.vessel_name ?? "", row.container_no ?? "",
        row.remark ?? "",
      ].join(" ").toLowerCase().includes(q)
    );
  }, [rows, keyword]);

  const summary = useMemo(() => ({
    shipment_count: filteredRows.length,
    dn_count: filteredRows.reduce((s, r) => s + safeNum(r.dn_count), 0),
    pallet_count: filteredRows.reduce((s, r) => s + safeNum(r.pallet_count), 0),
    total_boxes: filteredRows.reduce((s, r) => s + safeNum(r.total_boxes), 0),
    total_qty: filteredRows.reduce((s, r) => s + safeNum(r.total_qty), 0),
    total_weight: filteredRows.reduce((s, r) => s + safeNum(r.total_weight), 0),
    total_cbm: filteredRows.reduce((s, r) => s + safeNum(r.total_cbm), 0),
  }), [filteredRows]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Shipments</h1>
        {buyerCode && (
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            Buyer: <strong>{buyerCode}</strong>
          </p>
        )}
      </div>

      {/* 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Shipments", value: summary.shipment_count },
          { label: "DNs", value: summary.dn_count },
          { label: "Pallets", value: summary.pallet_count },
          { label: "Boxes", value: summary.total_boxes },
          { label: "Qty", value: summary.total_qty },
          { label: "Weight / CBM", value: `${summary.total_weight} / ${summary.total_cbm.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Status</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="OPEN">OPEN</option>
            <option value="PALLETIZING">PALLETIZING</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="ALL">ALL</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Keyword</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Shipment / DN / Ship From / Ship To / Vessel / Container / BL No"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <button
          onClick={load}
          style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", fontSize: 13, cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* 테이블 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
        <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["Shipment No","Status","Ship From","Ship To","DN","Pallet","Boxes","Qty","Weight","CBM","BL No","ETD","ETA","ATD","ATA","GR Date","Invoice","Vessel","Container","Files","Created"].map((h) => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={19} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading...</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={19} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No shipments found</td></tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    <Link
                      href={`/buyer/shipment/${row.id}`}
                      style={{ color: "#1d4ed8", textDecoration: "none" }}
                    >
                      {row.shipment_no}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge status={row.status} /></td>
                  <td style={{ padding: "10px 12px" }}>{row.ship_from_summary}</td>
                  <td style={{ padding: "10px 12px" }}>{row.ship_to_summary}</td>
                  <td style={{ padding: "10px 12px" }}>{row.dn_summary}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{row.pallet_count}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{row.total_boxes}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{row.total_qty}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{row.total_weight}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{typeof row.total_cbm === "number" ? row.total_cbm.toFixed(2) : row.total_cbm}</td>
                  <td style={{ padding: "10px 12px" }}>{row.bl_no || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.etd || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.eta || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.atd || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.ata || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.buyer_gr_date || "-"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.invoice_no || "-"}</td>
                  <td style={{ padding: "10px 12px" }}>{row.vessel_name || "-"}</td>
                  <td style={{ padding: "10px 12px" }}>{row.container_no || "-"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.doc_count > 0 ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600,
                        background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe",
                      }}>
                        📂 {row.doc_count}
                      </span>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDateYmd(row.created_at) || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
