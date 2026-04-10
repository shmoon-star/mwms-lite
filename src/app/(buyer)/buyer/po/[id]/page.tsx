"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type PoLine = {
  id: string;
  line_no: number | null;
  sku: string;
  product_name: string;
  brand: string;
  qty: number;
  unit_price: number | null;
  currency: string | null;
  status: string | null;
};

type PoDetail = {
  id: string;
  po_no: string;
  vendor_code: string;
  vendor_name: string;
  buyer_code: string;
  buyer_name: string;
  status: string;
  eta: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  lines: PoLine[];
};

function formatDate(v: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("ko-KR");
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 120, color: "#6b7280", fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{value || "-"}</span>
    </div>
  );
}

export default function BuyerPoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/buyer/po/${id}`, { cache: "no-store" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          window.location.href = "/buyer-login";
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (!json) return;
        if (!json.ok) throw new Error(json.error || "Failed to load");
        setPo(json.po);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p style={{ color: "#6b7280" }}>Loading...</p>;
  if (error) return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#991b1b" }}>
      {error}
    </div>
  );
  if (!po) return null;

  const totalQty = po.lines.reduce((s, l) => s + (l.qty || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/buyer/po"
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Back to PO List
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{po.po_no}</h1>
        <span style={{
          display: "inline-flex",
          marginTop: 8,
          padding: "3px 12px",
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 600,
          background: "#f3f4f6",
          color: "#374151",
          border: "1px solid #d1d5db",
        }}>
          {po.status}
        </span>
      </div>

      {/* Header info */}
      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        marginBottom: 24,
        background: "#fafafa",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          PO Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
          <InfoRow label="PO No" value={po.po_no} />
          <InfoRow label="Status" value={po.status} />
          <InfoRow label="Vendor" value={`${po.vendor_code} · ${po.vendor_name}`} />
          <InfoRow label="Buyer" value={`${po.buyer_code} · ${po.buyer_name}`} />
          <InfoRow label="ETA" value={po.eta} />
          <InfoRow label="Created" value={formatDate(po.created_at)} />
          {po.confirmed_at && <InfoRow label="Confirmed" value={formatDate(po.confirmed_at)} />}
        </div>
      </div>

      {/* PO Lines */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
        PO Lines &nbsp;<span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400 }}>({po.lines.length} SKUs, {totalQty.toLocaleString()} pcs total)</span>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>#</th>
              <th style={th}>SKU</th>
              <th style={th}>Product</th>
              <th style={th}>Brand</th>
              <th style={th}>Qty</th>
              <th style={th}>Unit Price</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                  No lines
                </td>
              </tr>
            ) : (
              po.lines.map((line, i) => (
                <tr key={line.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={td}>{line.line_no ?? i + 1}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 13 }}>{line.sku}</td>
                  <td style={td}>{line.product_name}</td>
                  <td style={td}>{line.brand}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{(line.qty || 0).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {line.unit_price != null
                      ? `${line.unit_price.toLocaleString()} ${line.currency ?? ""}`
                      : "-"}
                  </td>
                  <td style={td}>{line.status ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
          {po.lines.length > 0 && (
            <tfoot style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
              <tr>
                <td colSpan={4} style={{ ...td, textAlign: "right", fontWeight: 600, color: "#374151" }}>Total</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{totalQty.toLocaleString()}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  color: "#374151",
};

const td: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "middle",
};
