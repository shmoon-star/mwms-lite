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
        width: 1.8,
        height: 50,
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
    return <div className="p-6 text-sm text-gray-500">Loading labels...</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">❌ {error}</div>;
  }
  if (!sku) {
    return <div className="p-6 text-sm text-gray-500">SKU가 지정되지 않았습니다.</div>;
  }
  if (!skuInfo || skuInfo.locations.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500">
        현재 ASN에서 SKU <b>{sku}</b>를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: 100mm 200mm;
          margin: 0;
        }

        @media print {
          /* 프린트 시 사이드바/헤더 등 모든 것 숨기고 라벨만 표시 */
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
          .label-page {
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
          }
          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
        }

        .label-page {
          width: 100mm;
          height: 200mm;
          box-sizing: border-box;
          padding: 6mm;
          display: flex;
          flex-direction: column;
          gap: 4mm;
          font-family: -apple-system, "Segoe UI", Arial, sans-serif;
          color: #000;
          background: white;
        }

        .label-barcode-row {
          text-align: center;
          padding-bottom: 3mm;
          border-bottom: 1px solid #ccc;
        }
        .label-barcode-row svg {
          max-width: 100%;
          height: 22mm;
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
          min-height: 14mm;
          padding-bottom: 3mm;
          border-bottom: 1px dashed #ddd;
        }
        .label-product-name {
          font-size: 11pt;
          font-weight: 500;
          line-height: 1.25;
        }
        .label-brand {
          font-size: 8pt;
          color: #555;
          margin-top: 1mm;
        }

        .label-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .label-field-label {
          font-size: 7pt;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-weight: 600;
        }

        .label-carton-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 20pt;
          font-weight: 700;
          line-height: 1.1;
          margin-top: 1mm;
          word-break: break-all;
        }

        .label-qty-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 2mm;
          margin-top: 2mm;
        }

        .label-qty-value {
          font-size: 54pt;
          font-weight: 900;
          line-height: 1;
        }

        .label-mix-tag {
          display: inline-block;
          font-size: 9pt;
          padding: 1mm 2.2mm;
          border: 1px solid #9a3412;
          color: #9a3412;
          background: #fff7ed;
          border-radius: 2px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        .label-single-tag {
          display: inline-block;
          font-size: 9pt;
          padding: 1mm 2.2mm;
          border: 1px solid #166534;
          color: #166534;
          background: #f0fdf4;
          border-radius: 2px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }

        .label-footer {
          font-size: 7pt;
          color: #888;
          display: flex;
          justify-content: space-between;
          padding-top: 2mm;
          border-top: 1px solid #eee;
        }
      `}</style>

      {/* 화면 전용 컨트롤바 */}
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
            Picking Labels — {skuInfo.sku}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {detail?.asn_no} / {skuInfo.locations.length}장 / 합계 {skuInfo.total_qty}개
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

      {/* 라벨 영역 (프린트 대상) */}
      <div
        className="picking-labels-root"
        style={{
          background: "#e5e7eb",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {skuInfo.locations.map((loc, idx) => (
          <div
            key={loc.carton_no}
            className="label-page"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
          >
            {/* 상단: 바코드 */}
            <div className="label-barcode-row">
              <Barcode value={skuInfo.barcode} />
              <div className="label-sku-text">{skuInfo.sku}</div>
            </div>

            {/* 상품 정보 (있을 때만) */}
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

            {/* 본문: Carton / Qty */}
            <div className="label-body">
              <div>
                <div className="label-field-label">Carton</div>
                <div className="label-carton-value">{loc.carton_no}</div>
              </div>

              <div>
                <div className="label-qty-row">
                  <div>
                    <div className="label-field-label">Pick Qty</div>
                    <div className="label-qty-value">{loc.qty}</div>
                  </div>
                  <div>
                    {loc.is_mix ? (
                      <span className="label-mix-tag">MIX {loc.sku_count}종</span>
                    ) : (
                      <span className="label-single-tag">SINGLE</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 하단: ASN/페이지 */}
            <div className="label-footer">
              <span>{detail?.asn_no || "-"}</span>
              <span>
                {idx + 1}/{skuInfo.locations.length} · 합계 {skuInfo.total_qty}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
