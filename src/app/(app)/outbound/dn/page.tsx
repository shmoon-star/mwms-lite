"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function mapStatusLabel(status?: string | null) {
  if (status === "PENDING") return "PENDING";
  if (status === "RESERVED") return "RESERVED";
  if (status === "SHIPPED") return "SHIPPED";
  if (status === "CONFIRMED") return "CONFIRMED";
  return status ?? "-";
}

export default function DNPage() {
  const router = useRouter();

  const [dns, setDns] = useState<DNHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const createFileRef = useRef<HTMLInputElement | null>(null);
  const shipFileRef = useRef<HTMLInputElement | null>(null);

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

  function downloadDnCreateTemplate() {
    window.location.href = "/api/dn/template";
  }

  function downloadDnShipTemplate() {
    window.location.href = "/api/dn/template-ship";
  }

  function downloadDnCsv() {
    window.location.href = "/api/dn/export";
  }

  function openCreateFilePicker() {
    createFileRef.current?.click();
  }

  function openShipFilePicker() {
    shipFileRef.current?.click();
  }

  async function handleCreateUpload(file: File) {
    try {
      setWorking(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/dn/upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to upload DN create CSV");
      }

      const msg = [
        "DN Create Upload 완료",
        `rows=${json.total_rows ?? 0}`,
        `inserted headers=${json.inserted_header_count ?? 0}`,
        `inserted lines=${json.inserted_line_count ?? 0}`,
        `updated lines=${json.updated_line_count ?? 0}`,
        `errors=${json.error_count ?? 0}`,
        json.error_count > 0 ? JSON.stringify(json.errors ?? [], null, 2) : "",
      ].join("\n");

      alert(msg);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to upload DN create CSV");
    } finally {
      setWorking(false);
      if (createFileRef.current) createFileRef.current.value = "";
    }
  }

  async function handleShipUpload(file: File) {
    try {
      setWorking(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/dn/ship-upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to upload DN ship CSV");
      }

      const msg = [
        "DN Ship Upload 완료",
        `rows=${json.total_rows ?? 0}`,
        `updated headers=${json.updated_header_count ?? 0}`,
        `updated lines=${json.updated_line_count ?? 0}`,
        `reserved=${json.reserved_count ?? 0}`,
        `errors=${json.error_count ?? 0}`,
        json.error_count > 0 ? JSON.stringify(json.errors ?? [], null, 2) : "",
      ].join("\n");

      alert(msg);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to upload DN ship CSV");
    } finally {
      setWorking(false);
      if (shipFileRef.current) shipFileRef.current.value = "";
    }
  }

  async function handleBulkConfirmShipped() {
    try {
      setWorking(true);

      const reservedDns = (rows ?? []).filter((row) => row.status === "RESERVED");

      if (reservedDns.length === 0) {
        alert("RESERVED 상태의 DN이 없습니다.");
        return;
      }

      const dn_ids = reservedDns.map((row) => row.id);

      const res = await fetch("/api/dn/bulk-confirm-ship", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dn_ids }),
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to bulk confirm shipped");
      }

      const msg = [
        "Bulk Confirm Shipped 완료",
        `target=${json.target_count ?? 0}`,
        `shipped=${json.shipped_count ?? 0}`,
        `errors=${json.error_count ?? 0}`,
        json.error_count > 0 ? JSON.stringify(json.errors ?? [], null, 2) : "",
      ].join("\n");

      alert(msg);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed to bulk confirm shipped");
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
      <h2>Outbound / DN</h2>
      <div style={{ marginBottom: 16, color: "#666" }}>
        DN bulk upload based outbound processing
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>DN Create Upload</h3>
        <div style={{ marginBottom: 8, color: "#666" }}>
          DN No / Ship From / Ship To / Planned GI / Planned Delivery / SKU / Qty 기준 DN 생성 업로드 템플릿
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={downloadDnCreateTemplate} disabled={working}>
            Download Template
          </button>
          <button onClick={openCreateFilePicker} disabled={working}>
            Upload CSV
          </button>
          <input
            ref={createFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCreateUpload(file);
            }}
          />
        </div>

        <div style={previewBox}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>CSV Template Preview</div>
          <pre style={pre}>
{`dn_no,ship_from,ship_to,planned_gi_date,planned_delivery_date,sku,qty_ordered,remarks
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,SKU001,10,Tokyo replenishment
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,SKU002,5,Tokyo replenishment`}
          </pre>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>DN Ship Bulk Upload</h3>
        <div style={{ marginBottom: 8, color: "#666" }}>
          DN No / Ship From / Ship To / Planned GI / Actual GI / Reserved Qty / Qty to Ship / Carrier / Tracking No 기준 일괄 Ship 처리 템플릿
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={downloadDnShipTemplate} disabled={working}>
            Download Template
          </button>
          <button onClick={openShipFilePicker} disabled={working}>
            Upload CSV
          </button>
          <input
            ref={shipFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleShipUpload(file);
            }}
          />
        </div>

        <div style={previewBox}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>CSV Template Preview</div>
          <pre style={pre}>
{`dn_no,ship_from,ship_to,planned_gi_date,planned_delivery_date,actual_gi_date,sku,reserved_qty,qty_to_ship,carrier,tracking_no
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,2026-03-18,SKU001,10,10,YAMATO,YMT123456
DN-20260317-0001,ICN_WH,JP_TOKYO_STORE,2026-03-18,2026-03-20,2026-03-18,SKU002,5,5,YAMATO,YMT123456`}
          </pre>
        </div>
      </div>

      <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        <button onClick={load} disabled={working || loading}>
          Refresh
        </button>

        <button onClick={downloadDnCsv} disabled={working || loading}>
          Download DN CSV
        </button>

        <button onClick={handleBulkConfirmShipped} disabled={working || loading}>
          Bulk Confirm Shipped
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <b>Recent DN | Rows: {rows.length}</b>
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
              <td style={td} colSpan={5}>
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

const card: React.CSSProperties = {
  marginBottom: 24,
  border: "1px solid #ddd",
  padding: 16,
  borderRadius: 8,
};

const previewBox: React.CSSProperties = {
  border: "1px dashed #ccc",
  padding: 12,
  borderRadius: 8,
};

const pre: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "monospace",
  fontSize: 13,
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