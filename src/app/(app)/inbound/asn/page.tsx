"use client";

import { useEffect, useMemo, useState } from "react";
import PageToolbar from "@/components/PageToolbar";
import CsvUploadButton from "@/components/CsvUploadButton";
import { downloadCsv } from "@/lib/csv";
import UploadTemplateCard from "@/components/upload/UploadTemplateCard";

type ASNRow = {
  id: string;
  asn_no: string | null;
  po_no?: string | null;
  status: string | null;
  eta?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_ref_no?: string | null;
  created_at: string | null;
};

export default function ASNPage() {
  const [rows, setRows] = useState<ASNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source_type", sourceFilter);
    return params.toString();
  }, [statusFilter, sourceFilter]);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const url = `/api/asn/list${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to load ASN");
      }

      const items = Array.isArray(json)
        ? json
        : json.items ?? json.data ?? json.asns ?? [];

      setRows(items);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [queryString]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) =>
      [
        r.asn_no,
        r.po_no,
        r.status,
        r.source_type,
        r.source_ref_no,
      ].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [rows, keyword]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Inbound / ASN</h2>

      <ASNUploadSection reload={load} />

      <PageToolbar
        onRefresh={load}
        onDownloadCsv={() =>
          downloadCsv(
            "asn.csv",
            filtered.map((r) => ({
              id: r.id,
              asn_no: r.asn_no,
              po_no: r.po_no ?? null,
              status: r.status,
              eta: r.eta ?? null,
              source_type: r.source_type ?? null,
              source_id: r.source_id ?? null,
              source_ref_no: r.source_ref_no ?? null,
              created_at: r.created_at,
            }))
          )
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          placeholder="Search ASN / PO / Status / Source..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{
            width: 360,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 4,
            minWidth: 140,
          }}
        >
          <option value="">All Status</option>
          <option value="CREATED">CREATED</option>
          <option value="OPEN">OPEN</option>
          <option value="RECEIVED">RECEIVED</option>
          <option value="CLOSED">CLOSED</option>
          <option value="CONFIRMED">CONFIRMED</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 4,
            minWidth: 160,
          }}
        >
          <option value="">All Source</option>
          <option value="PACKING_LIST">PACKING_LIST</option>
          <option value="MANUAL">MANUAL</option>
        </select>
      </div>

      <div style={{ marginBottom: 12, color: "#666" }}>
        Rows: {filtered.length}
      </div>

      {loading && <div>Loading...</div>}
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      {!loading && !error && filtered.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>ASN No</th>
              <th style={th}>PO No</th>
              <th style={th}>Status</th>
              <th style={th}>Source Type</th>
              <th style={th}>Source Ref</th>
              <th style={th}>ETA</th>
              <th style={th}>Created At</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.asn_no ?? "-"}</td>
                <td style={td}>{r.po_no ?? "-"}</td>
                <td style={td}>{r.status ?? "-"}</td>
                <td style={td}>{r.source_type ?? "-"}</td>
                <td style={td}>{r.source_ref_no ?? "-"}</td>
                <td style={td}>{r.eta ?? "-"}</td>
                <td style={td}>{r.created_at ?? "-"}</td>
                <td style={td}>
                  <a href={`/inbound/asn/${r.id}`}>Open</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ color: "#666" }}>No ASN found</div>
      )}
    </div>
  );
}

function ASNUploadSection({ reload }: { reload: () => void }) {
  return (
    <div className="upload-page-section">
      <UploadTemplateCard
        title="ASN Upload"
        description="ASN 생성용 업로드 템플릿"
        headers={["po_no", "asn_no", "sku", "qty_expected", "eta", "remark"]}
        sampleRows={[
          [
            "PO-20260314-0001",
            "ASN-20260314-0001",
            "SKU001",
            100,
            "2026-03-20",
            "partial inbound",
          ],
          [
            "PO-20260314-0001",
            "ASN-20260314-0001",
            "SKU002",
            50,
            "2026-03-20",
            "partial inbound",
          ],
        ]}
        onDownloadTemplate={() => window.open("/api/asn/template", "_blank")}
        uploadSlot={
          <CsvUploadButton uploadUrl="/api/asn/upload" onUploaded={reload} />
        }
      />
    </div>
  );
}

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f5f5f5",
  textAlign: "left",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
};