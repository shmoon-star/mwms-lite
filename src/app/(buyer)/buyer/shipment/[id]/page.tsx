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
  invoice_no: string | null;
  vessel_name: string | null;
  container_no: string | null;
  seal_no: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DnRow = { id: string; dn_no: string; status: string; ship_from: string | null; ship_to: string | null; created_at: string | null; confirmed_at: string | null };
type PalletRow = { id: string; pallet_no: string; status: string; total_boxes: number; total_qty: number; total_weight: number; total_cbm: number; length: number; width: number; height: number; created_at: string | null; closed_at: string | null };
type ShipmentFile = { id: string; file_name: string; file_size: number; mime_type: string | null; storage_path: string; uploaded_at: string | null };

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  let bg = "#f3f4f6", color = "#374151", border = "#d1d5db";
  if (s === "ARRIVED") { bg = "#dcfce7"; color = "#166534"; border = "#bbf7d0"; }
  else if (s === "SHIPPED") { bg = "#dbeafe"; color = "#1e40af"; border = "#bfdbfe"; }
  else if (s === "OPEN") { bg = "#fef9c3"; color = "#854d0e"; border = "#fde68a"; }
  else if (s === "PALLETIZING") { bg = "#ffedd5"; color = "#9a3412"; border = "#fed7aa"; }
  else if (s === "CANCELLED") { bg = "#fee2e2"; color = "#991b1b"; border = "#fecaca"; }
  return <span style={{ display: "inline-flex", padding: "3px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 600, background: bg, color, border: `1px solid ${border}` }}>{status || "-"}</span>;
}

export default function BuyerShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [header, setHeader] = useState<ShipmentHeader | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [pallets, setPallets] = useState<PalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<ShipmentFile[]>([]);

  // 편집 상태
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [form, setForm] = useState({
    bl_no: "", etd: "", eta: "", atd: "", ata: "", buyer_gr_date: "", invoice_no: "",
    vessel_name: "", container_no: "", seal_no: "", remark: "",
  });

  function syncForm(h: ShipmentHeader) {
    setForm({
      bl_no: h.bl_no || "",
      etd: h.etd || "",
      eta: h.eta || "",
      atd: h.atd || "",
      ata: h.ata || "",
      buyer_gr_date: h.buyer_gr_date || "",
      invoice_no: h.invoice_no || "",
      vessel_name: h.vessel_name || "",
      container_no: h.container_no || "",
      seal_no: h.seal_no || "",
      remark: h.remark || "",
    });
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/scm/shipment/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load");
      setHeader(json.header);
      setDns(json.dns ?? []);
      setPallets(json.pallets ?? []);
      syncForm(json.header);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }

    fetch(`/api/buyer/shipment/${id}/files`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json?.ok) setFiles(json.files ?? []); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/scm/shipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to save");
      setSaveResult({ type: "success", msg: "Saved" });
      setEditing(false);
      await load();
    } catch (e: any) {
      setSaveResult({ type: "error", msg: e.message });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (header) syncForm(header);
    setEditing(false);
    setSaveResult(null);
  }

  async function downloadFile(storagePath: string, fileName: string) {
    try {
      const res = await fetch("/api/scm/shipment-files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath, file_name: fileName }),
      });
      const json = await res.json();
      if (json?.url) { const a = document.createElement("a"); a.href = json.url; a.download = fileName; a.target = "_blank"; a.click(); }
    } catch {}
  }

  if (loading) return <p style={{ color: "#6b7280" }}>Loading...</p>;
  if (error) return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#991b1b" }}>{error}</div>;
  if (!header) return null;

  const activePallets = pallets.filter(p => p.status !== "CANCELLED");
  const totalBoxes = activePallets.reduce((s, p) => s + p.total_boxes, 0);
  const totalQty = activePallets.reduce((s, p) => s + p.total_qty, 0);
  const totalWeight = activePallets.reduce((s, p) => s + p.total_weight, 0);
  const totalCbm = activePallets.reduce((s, p) => s + p.total_cbm, 0);

  const fields: { label: string; key: keyof typeof form; type?: string }[] = [
    { label: "BL No", key: "bl_no" },
    { label: "Vessel", key: "vessel_name" },
    { label: "Container No", key: "container_no" },
    { label: "Seal No", key: "seal_no" },
    { label: "ETD", key: "etd", type: "date" },
    { label: "ETA", key: "eta", type: "date" },
    { label: "ATD (실제 출발)", key: "atd", type: "date" },
    { label: "ATA (실제 도착)", key: "ata", type: "date" },
    { label: "Buyer GR Date", key: "buyer_gr_date", type: "date" },
    { label: "Invoice No", key: "invoice_no" },
    { label: "Remark", key: "remark" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/buyer/shipment" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Back to Shipments</Link>
      </div>

      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{header.shipment_no}</h1>
        <StatusBadge status={header.status} />
      </div>

      {/* Shipment Info — 편집 가능 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 20, background: editing ? "#fffbeb" : "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Shipment Details
          </div>
          {!editing ? (
            <button onClick={() => { setEditing(true); setSaveResult(null); }} style={editBtn}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...editBtn, background: "#111", color: "#fff" }}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={handleCancel} style={editBtn}>Cancel</button>
            </div>
          )}
        </div>

        {saveResult && (
          <div style={{ marginBottom: 12, padding: "6px 12px", borderRadius: 6, fontSize: 12, background: saveResult.type === "success" ? "#dcfce7" : "#fef2f2", color: saveResult.type === "success" ? "#166534" : "#991b1b" }}>
            {saveResult.msg}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 40px" }}>
          {fields.map(f => (
            <div key={f.key} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
              <span style={{ width: 130, color: "#6b7280", fontSize: 13, flexShrink: 0 }}>{f.label}</span>
              {editing ? (
                <input
                  type={f.type || "text"}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
                />
              ) : (
                <span style={{ fontWeight: 500, fontSize: 13 }}>
                  {f.type === "date" ? (form[f.key] || "-") : (form[f.key] || "-")}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <span style={{ width: 130, color: "#6b7280", fontSize: 13 }}>Created</span>
          <span style={{ fontSize: 13 }}>{fmtDateYmd(header.created_at) || "-"}</span>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Pallets", value: activePallets.length },
          { label: "Boxes", value: totalBoxes },
          { label: "Qty", value: totalQty },
          { label: "Weight (kg)", value: totalWeight },
          { label: "CBM", value: totalCbm.toFixed(2) },
        ].map(c => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fff" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* DNs */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Delivery Notes ({dns.length})</div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["DN No", "Status", "Ship From", "Ship To", "Created", "Confirmed"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dns.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No DNs</td></tr>
            ) : dns.map(dn => (
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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Pallets ({pallets.length})</div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["Pallet No", "Status", "Boxes", "Qty", "Weight", "CBM", "L\u00D7W\u00D7H", "Closed"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pallets.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No pallets</td></tr>
            ) : pallets.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #e5e7eb", opacity: p.status === "CANCELLED" ? 0.4 : 1 }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.pallet_no}</td>
                <td style={{ padding: "10px 14px" }}>{p.status}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_boxes}</td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{p.total_qty}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_weight}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>{p.total_cbm.toFixed(2)}</td>
                <td style={{ padding: "10px 14px" }}>{p.length}\u00D7{p.width}\u00D7{p.height}</td>
                <td style={{ padding: "10px 14px" }}>{fmtDateYmd(p.closed_at) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Files */}
      {files.length > 0 && (
        <div style={{ marginTop: 32, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "20px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
            Shipment Documents
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" }}>{files.length}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ paddingBottom: 8 }}>File Name</th>
                <th style={{ paddingBottom: 8 }}>Size</th>
                <th style={{ paddingBottom: 8 }}>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px 10px 0" }}>
                    <button onClick={() => downloadFile(f.storage_path, f.file_name)} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
                      {f.file_name}
                    </button>
                  </td>
                  <td style={{ padding: "10px 16px 10px 0", color: "#6b7280" }}>{f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : "-"}</td>
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

const editBtn: React.CSSProperties = { padding: "6px 16px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#374151" };
