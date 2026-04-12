"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtDate as fmtDateYmd } from "@/lib/fmt";

type ShipmentHeader = {
  id: string;
  shipment_no: string;
  status: string;
  bl_no: string | null;
  eta: string | null;
  etd: string | null;
  atd: string | null;
  ata: string | null;
  buyer_gr_date: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DnRow = {
  id: string;
  dn_no: string;
  status: string;
  ship_from: string | null;
  ship_to: string | null;
  created_at: string | null;
  confirmed_at: string | null;
};

type PalletRow = {
  id: string;
  pallet_no: string;
  status: string;
  total_boxes: number;
  total_qty: number;
  total_weight: number;
  total_cbm: number;
  length: number;
  width: number;
  height: number;
  created_at: string | null;
  closed_at: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  try { return new Date(v).toLocaleDateString("ko-KR"); } catch { return v; }
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 130, color: "#6b7280", fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{value || "-"}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  let bg = "#f3f4f6", color = "#374151", border = "#d1d5db";

  if (s === "ARRIVED")      { bg = "#dcfce7"; color = "#166534"; border = "#bbf7d0"; }
  else if (s === "SHIPPED") { bg = "#dbeafe"; color = "#1e40af"; border = "#bfdbfe"; }
  else if (s === "CLOSED")  { bg = "#e5e7eb"; color = "#374151"; border = "#d1d5db"; }
  else if (s === "OPEN")    { bg = "#fef9c3"; color = "#854d0e"; border = "#fde68a"; }
  else if (s === "PALLETIZING") { bg = "#ffedd5"; color = "#9a3412"; border = "#fed7aa"; }
  else if (s === "CANCELLED") { bg = "#fee2e2"; color = "#991b1b"; border = "#fecaca"; }

  return (
    <span style={{
      display: "inline-flex",
      padding: "3px 12px",
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

type ShipmentFile = { id: string; file_name: string; file_size: number; mime_type: string | null; storage_path: string; uploaded_at: string | null };

export default function BuyerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [header, setHeader] = useState<ShipmentHeader | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<ShipmentFile[]>([]);

  useEffect(() => {
    fetch(`/api/scm/shipment/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error || "Failed to load");
        setHeader(json.header);
        setDns(json.dns ?? []);
        setPallets(json.pallets ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    fetch(`/api/buyer/shipment/${id}/files`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (json?.ok) setFiles(json.files ?? []); })
      .catch(() => {});
  }, [id]);

  async function downloadFile(storagePath: string, fileName: string) {
    try {
      const res = await fetch("/api/scm/shipment-files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath, file_name: fileName }),
      });
      const json = await res.json();
      if (json?.url) {
        const a = document.createElement("a");
        a.href = json.url;
        a.download = fileName;
        a.target = "_blank";
        a.click();
      }
    } catch {}
  }

  if (loading) return <p style={{ color: "#6b7280" }}>Loading...</p>;
  if (error) return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#991b1b" }}>
      {error}
    </div>
  );
  if (!header) return null;

  const totalPallets = pallets.filter((p) => p.status !== "CANCELLED").length;
  const totalBoxes = pallets.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total_boxes, 0);
  const totalQty = pallets.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total_qty, 0);
  const totalWeight = pallets.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total_weight, 0);
  const totalCbm = pallets.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total_cbm, 0);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/buyer/shipment" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Back to Shipments
        </Link>
      </div>

      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{header.shipment_no}</h1>
        <StatusBadge status={header.status} />
      </div>

      {/* Shipment Info */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20, background: "#fafafa" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Shipment Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
          <InfoRow label="BL No" value={header.bl_no} />
          <InfoRow label="Vessel" value={header.vessel_name} />
          <InfoRow label="Container No" value={header.container_no} />
          <InfoRow label="Seal No" value={header.seal_no} />
          <InfoRow label="ETD" value={header.etd} />
          <InfoRow label="ETA" value={header.eta} />
          <InfoRow label="ATD (실제 출발)" value={header.atd} />
          <InfoRow label="ATA (실제 도착)" value={header.ata} />
          <InfoRow label="Buyer GR Date" value={header.buyer_gr_date} />
          <InfoRow label="Remark" value={header.remark} />
          <InfoRow label="Created" value={fmtDateYmd(header.created_at) || "-"} />
        </div>
      </div>

      {/* 수량 요약 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Pallets", value: totalPallets },
          { label: "Boxes", value: totalBoxes },
          { label: "Qty", value: totalQty },
          { label: "Weight (kg)", value: totalWeight },
          { label: "CBM", value: totalCbm.toFixed(2) },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* DNs */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
        Delivery Notes <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400 }}>({dns.length})</span>
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["DN No", "Status", "Ship From", "Ship To", "Created", "Confirmed"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dns.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No DNs</td></tr>
            ) : dns.map((dn) => (
              <tr key={dn.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{dn.dn_no}</td>
                <td style={{ padding: "10px 14px" }}>{dn.status}</td>
                <td style={{ padding: "10px 14px" }}>{dn.ship_from || "-"}</td>
                <td style={{ padding: "10px 14px" }}>{dn.ship_to || "-"}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDateYmd(dn.created_at) || "-"}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDateYmd(dn.confirmed_at) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pallets */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
        Pallets <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400 }}>({pallets.length})</span>
      </div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["Pallet No", "Status", "Boxes", "Qty", "Weight", "CBM", "L×W×H", "Closed"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pallets.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No pallets</td></tr>
            ) : pallets.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb", opacity: p.status === "CANCELLED" ? 0.4 : 1 }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.pallet_no}</td>
                <td style={{ padding: "10px 14px" }}>{p.status}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_boxes}</td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{p.total_qty}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_weight}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_cbm.toFixed(2)}</td>
                <td style={{ padding: "10px 14px" }}>{p.length}×{p.width}×{p.height}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDateYmd(p.closed_at) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Shipment Files ─────────────────────────────────────────────── */}
      {files.length > 0 && (
        <div style={{ marginTop: 32, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "20px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
            Shipment Documents
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" }}>
              {files.length}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ paddingBottom: 8, paddingRight: 16 }}>File Name</th>
                <th style={{ paddingBottom: 8, paddingRight: 16 }}>Size</th>
                <th style={{ paddingBottom: 8 }}>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px 10px 0", fontWeight: 500 }}>
                    <button
                      onClick={() => downloadFile(f.storage_path, f.file_name)}
                      style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13, textAlign: "left" }}
                    >
                      📄 {f.file_name}
                    </button>
                  </td>
                  <td style={{ padding: "10px 16px 10px 0", color: "#6b7280" }}>
                    {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : "-"}
                  </td>
                  <td style={{ padding: "10px 0", color: "#6b7280" }}>{fmtDateYmd(f.uploaded_at) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
