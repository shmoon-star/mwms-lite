"use client";

import { useEffect, useMemo, useState } from "react";
import PageToolbar from "@/components/PageToolbar";
import CsvUploadButton from "@/components/CsvUploadButton";
import { downloadCsv } from "@/lib/csv";
import UploadTemplateCard from "@/components/upload/UploadTemplateCard";
import { fmtDate } from "@/lib/fmt";

type ProductRow = {
  id: string;
  sku: string;
  brand: string | null;
  name: string | null;
  barcode: string | null;
  created_at: string | null;
};

export default function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/products", { cache: "no-store" });
      const text = await res.text();

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok) {
        const message =
          typeof json === "object" &&
          json !== null &&
          "error" in json &&
          typeof (json as any).error === "string"
            ? (json as any).error
            : "Failed to load products";
        throw new Error(message);
      }

      const items = Array.isArray(json)
        ? json
        : typeof json === "object" && json !== null
        ? (json as any).data ?? (json as any).items ?? []
        : [];

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
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) =>
      [r.sku, r.brand, r.name, r.barcode].some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, keyword]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Master / Products</h2>

      <ProductsUploadSection reload={load} />

      <PageToolbar
        onRefresh={load}
        onDownloadCsv={() =>
          downloadCsv(
            "products.csv",
            filtered.map((r) => ({
              id: r.id,
              sku: r.sku,
              brand: r.brand,
              name: r.name,
              barcode: r.barcode,
              created_at: r.created_at,
            }))
          )
        }
      />

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Search SKU / Brand / Name / Barcode..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{
            width: 360,
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
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
              <th style={th}>SKU</th>
              <th style={th}>Brand</th>
              <th style={th}>Name</th>
              <th style={th}>Barcode</th>
              <th style={th}>Created At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.sku}</td>
                <td style={td}>{r.brand ?? "-"}</td>
                <td style={td}>{r.name ?? "-"}</td>
                <td style={td}>{r.barcode ?? "-"}</td>
                <td style={td}>{fmtDate(r.created_at) || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProductsUploadSection({ reload }: { reload: () => void }) {
  return (
    <div className="upload-page-section">
      <UploadTemplateCard
        title="Products Upload"
        description="상품 마스터 업로드 템플릿 (UPC/barcode는 Excel Template 사용 권장)"
        headers={[
          "sku",
          "product_name",
          "barcode",
          "uom",
          "brand",
          "category",
          "status",
        ]}
        sampleRows={[
          ["SKU001", "Basic Tee", "0880000000001", "EA", "MUSINSA", "TOP", "ACTIVE"],
          ["SKU002", "Denim Pants", "0880000000002", "EA", "MUSINSA", "BOTTOM", "ACTIVE"],
        ]}
        onDownloadTemplate={() => window.open("/api/products/template", "_blank")}
        uploadSlot={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="upload-btn"
              onClick={() => window.open("/api/products/template-excel", "_blank")}
            >
              Download Excel Template
            </button>

            <CsvUploadButton
              uploadUrl="/api/products/upload"
              onUploaded={reload}
            />
          </div>
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