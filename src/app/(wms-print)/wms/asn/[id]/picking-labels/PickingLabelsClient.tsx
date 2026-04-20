"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

type AsnLine = {
  asn_line_id: string;
  line_no: number | null;
  carton_no: string | null;
  sku: string | null;
  sku_name?: string | null;
  brand?: string | null;
  barcode?: string | null;
  asn_qty: number;
};

type AsnDetail = {
  id: string;
  asn_no: string | null;
  po_no: string | null;
  vendor_name: string | null;
  lines: AsnLine[];
};

type Location = {
  carton_no: string;
  qty: number;
  is_mix: boolean;
  sku_count: number;
};

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 0,
      });
    } catch {
      /* silent fallback */
    }
  }, [value]);

  return <svg ref={ref} style={{ maxWidth: "100%", height: "auto" }} />;
}

export default function PickingLabelsClient({
  asnId,
  sku,
}: {
  asnId: string;
  sku: string;
}) {
  const [detail, setDetail] = useState<AsnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/wms/asn/${asnId}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load ASN");
        }
        if (!cancelled) setDetail(json.asn as AsnDetail);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asnId]);

  const skuInfo = useMemo(() => {
    if (!detail || !sku) return null;

    const cartonSkuCount = new Map<string, Set<string>>();
    for (const line of detail.lines) {
      const carton = (line.carton_no || "").trim();
      const s = (line.sku || "").trim();
      if (!carton || !s) continue;
      if (!cartonSkuCount.has(carton)) cartonSkuCount.set(carton, new Set());
      cartonSkuCount.get(carton)!.add(s);
    }

    const locMap = new Map<string, number>();
    let totalQty = 0;
    let skuName: string | null = null;
    let brand: string | null = null;
    let barcodeValue: string | null = null;

    for (const line of detail.lines) {
      if ((line.sku || "").trim() !== sku) continue;
      const carton = (line.carton_no || "").trim();
      if (!carton) continue;
      const qty = safeNum(line.asn_qty);
      locMap.set(carton, (locMap.get(carton) || 0) + qty);
      totalQty += qty;
      if (!skuName && line.sku_name) skuName = line.sku_name;
      if (!brand && line.brand) brand = line.brand;
      if (!barcodeValue && line.barcode) barcodeValue = line.barcode;
    }

    const locations: Location[] = Array.from(locMap.entries())
      .map(([carton_no, qty]) => {
        const skuSet = cartonSkuCount.get(carton_no);
        const sku_count = skuSet ? skuSet.size : 1;
        return {
          carton_no,
          qty,
          sku_count,
          is_mix: sku_count > 1,
        };
      })
      .sort((a, b) => b.qty - a.qty);

    return {
      sku,
      name: skuName,
      brand,
      barcode: barcodeValue || sku,
      total_qty: totalQty,
      locations,
    };
  }, [detail, sku]);

  useEffect(() => {
    if (loading || !skuInfo || skuInfo.locations.length === 0) return;
    const t = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(t);
  }, [loading, skuInfo]);

  if (loading) {
    return <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Loading labels...</div>;
  }
  if (error) {
    return <div style={{ padding: 24, fontSize: 13, color: "#b91c1c" }}>❌ {error}</div>;
  }
  if (!sku) {
    return <div style={{ padding: 24, fontSize: 13, color: "#666" }}>SKU가 지정되지 않았습니다.</div>;
  }
  if (!skuInfo || skuInfo.locations.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "#666" }}>
        현재 ASN에서 SKU <b>{sku}</b>를 찾을 수 없습니다.
      </div>
    );
  }

  // 박스 수에 따라 테이블 행 폰트 크기 조정 (많으면 작게)
  const rowCount = skuInfo.locations.length;
  const rowFontPt = rowCount <= 6 ? 14 : rowCount <= 10 ? 12 : rowCount <= 16 ? 10 : 9;
  const rowQtyPt = rowCount <= 6 ? 18 : rowCount <= 10 ? 15 : rowCount <= 16 ? 12 : 10;

  return (
    <>
      <style jsx global>{`
        @page {
          size: 100mm 200mm;
          margin: 0;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }
          .picking-labels-root,
          .picking-labels-root * {
            visibility: visible !important;
          }
          .picking-labels-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .label-page {
            box-shadow: none !important;
          }
        }

        .label-page {
          width: 100mm;
          height: 200mm;
          box-sizing: border-box;
          padding: 6mm;
          display: flex;
          flex-direction: column;
          gap: 3mm;
          font-family: -apple-system, "Segoe UI", Arial, sans-serif;
          color: #000;
          background: white;
        }

        .label-barcode-row {
          text-align: center;
          padding-bottom: 3mm;
          border-bottom: 1px solid #999;
        }
        .label-barcode-row svg {
          max-width: 100%;
          height: 18mm;
        }
        .label-sku-text {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 9pt;
          letter-spacing: 0.5px;
          margin-top: 1.5mm;
          word-break: break-all;
          line-height: 1.1;
        }

        .label-product-row {
          padding-bottom: 2mm;
          border-bottom: 1px dashed #ccc;
        }
        .label-product-name {
          font-size: 11pt;
          font-weight: 600;
          line-height: 1.25;
        }
        .label-brand {
          font-size: 8pt;
          color: #555;
          margin-top: 0.8mm;
        }

        .label-section-title {
          font-size: 8pt;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          font-weight: 700;
          margin-bottom: 1.5mm;
        }

        .label-carton-list {
          flex: 1;
          overflow: hidden;
          border: 1px solid #222;
        }
        .label-carton-list table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .label-carton-list th,
        .label-carton-list td {
          padding: 1.8mm 2mm;
          border-bottom: 1px solid #ddd;
          text-align: left;
        }
        .label-carton-list th {
          background: #f3f4f6;
          font-size: 7pt;
          text-transform: uppercase;
          color: #444;
          letter-spacing: 0.4px;
          border-bottom: 1px solid #222;
        }
        .label-carton-list td.col-carton {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 700;
          word-break: break-all;
        }
        .label-carton-list td.col-qty {
          text-align: right;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .label-carton-list td.col-type {
          text-align: right;
          white-space: nowrap;
          color: #666;
          font-size: 7pt;
        }
        .label-carton-list .mix-mark {
          display: inline-block;
          padding: 0.4mm 1.4mm;
          border: 1px solid #9a3412;
          color: #9a3412;
          background: #fff7ed;
          border-radius: 2px;
          font-weight: 700;
          font-size: 7pt;
        }
        .label-carton-list .single-mark {
          display: inline-block;
          padding: 0.4mm 1.4mm;
          border: 1px solid #166534;
          color: #166534;
          background: #f0fdf4;
          border-radius: 2px;
          font-weight: 700;
          font-size: 7pt;
        }

        .label-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2mm 3mm;
          border: 2px solid #000;
          background: #fafafa;
        }
        .label-summary .summary-label {
          font-size: 7pt;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }
        .label-summary .summary-value-big {
          font-size: 24pt;
          font-weight: 900;
          line-height: 1;
        }
        .label-summary .summary-value {
          font-size: 13pt;
          font-weight: 700;
        }

        .label-footer {
          font-size: 7pt;
          color: #888;
          display: flex;
          justify-content: space-between;
          padding-top: 1.5mm;
        }
      `}</style>

      {/* 화면 전용 컨트롤바 (프린트 시 숨김) */}
      <div
        className="no-print"
        style={{
          background: "#111",
          color: "#fff",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Picking Label — {skuInfo.sku}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {detail?.asn_no} / {skuInfo.locations.length}박스 / 합계 {skuInfo.total_qty}개
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              background: "#fff",
              color: "#000",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            🖨️ 다시 프린트
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              background: "transparent",
              color: "#fff",
              fontSize: 13,
              border: "1px solid #555",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </div>

      {/* 라벨 (한 장) */}
      <div
        className="picking-labels-root"
        style={{
          background: "#e5e7eb",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div className="label-page" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          {/* 상단: 바코드 */}
          <div className="label-barcode-row">
            <Barcode value={skuInfo.barcode} />
            <div className="label-sku-text">{skuInfo.sku}</div>
          </div>

          {/* 상품 정보 */}
          {(skuInfo.name || skuInfo.brand) && (
            <div className="label-product-row">
              {skuInfo.name && (
                <div className="label-product-name">{skuInfo.name}</div>
              )}
              {skuInfo.brand && (
                <div className="label-brand">{skuInfo.brand}</div>
              )}
            </div>
          )}

          {/* 박스별 Picking 목록 */}
          <div className="label-section-title">
            📦 박스별 피킹 ({skuInfo.locations.length}박스)
          </div>

          <div className="label-carton-list">
            <table style={{ fontSize: `${rowFontPt}pt` }}>
              <colgroup>
                <col style={{ width: "50%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Carton</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {skuInfo.locations.map((loc) => (
                  <tr key={loc.carton_no}>
                    <td className="col-carton">{loc.carton_no}</td>
                    <td className="col-qty" style={{ fontSize: `${rowQtyPt}pt` }}>
                      {loc.qty}
                    </td>
                    <td className="col-type">
                      {loc.is_mix ? (
                        <span className="mix-mark">MIX {loc.sku_count}</span>
                      ) : (
                        <span className="single-mark">SINGLE</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div className="label-summary">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="summary-label">박스</span>
              <span className="summary-value">{skuInfo.locations.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
              <span className="summary-label">Total Pick Qty</span>
              <span className="summary-value-big">{skuInfo.total_qty}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="label-footer">
            <span>{detail?.asn_no || "-"}</span>
            <span>PO: {detail?.po_no || "-"}</span>
          </div>
        </div>
      </div>
    </>
  );
}
