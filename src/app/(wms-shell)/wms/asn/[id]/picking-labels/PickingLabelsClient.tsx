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
      // fallback silent — 잘못된 값이면 빈 svg로 남음
    }
  }, [value]);

  return <svg ref={ref} />;
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

    // Carton별 SKU 종류 수 집계 (MIX 여부 판정용)
    const cartonSkuCount = new Map<string, Set<string>>();
    for (const line of detail.lines) {
      const carton = (line.carton_no || "").trim();
      const s = (line.sku || "").trim();
      if (!carton || !s) continue;
      if (!cartonSkuCount.has(carton)) cartonSkuCount.set(carton, new Set());
      cartonSkuCount.get(carton)!.add(s);
    }

    // 해당 SKU의 location 집계
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

  // 자동 프린트 (바코드 렌더링 후 약간 대기)
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
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .label-page {
            page-break-after: always;
            break-after: page;
          }
          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
        .label-page {
          width: 100mm;
          height: 200mm;
          padding: 6mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 4mm;
          font-family: -apple-system, "Segoe UI", Arial, sans-serif;
          color: #111;
        }
      `}</style>

      {/* 화면 전용 컨트롤바 — 프린트 시 숨김 */}
      <div className="no-print bg-gray-900 text-white px-6 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            Picking Labels — {skuInfo.sku}
          </div>
          <div className="text-xs text-gray-300 mt-0.5">
            {detail?.asn_no} / 총 {skuInfo.locations.length}장 / 합계 {skuInfo.total_qty}개
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-1.5 rounded bg-white text-black text-sm font-medium hover:bg-gray-200"
          >
            🖨️ 다시 프린트
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="px-4 py-1.5 rounded border border-gray-600 text-sm hover:bg-gray-800"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 라벨들 */}
      <div className="bg-gray-200 py-6 flex flex-col items-center gap-4 print:bg-white print:py-0 print:gap-0">
        {skuInfo.locations.map((loc, idx) => (
          <div
            key={loc.carton_no}
            className="label-page bg-white shadow print:shadow-none"
          >
            {/* 바코드 */}
            <div className="flex flex-col items-center border-b border-gray-300 pb-2">
              <Barcode value={skuInfo.barcode} />
              <div className="text-[10pt] font-mono mt-1 tracking-wider">
                {skuInfo.barcode}
              </div>
            </div>

            {/* 상품 정보 */}
            <div className="flex-none">
              <div className="text-[9pt] text-gray-500 uppercase">SKU</div>
              <div className="text-[14pt] font-bold font-mono leading-tight break-all">
                {skuInfo.sku}
              </div>
              {skuInfo.name && (
                <div className="text-[11pt] mt-1 leading-snug">{skuInfo.name}</div>
              )}
              {skuInfo.brand && (
                <div className="text-[9pt] text-gray-600 mt-0.5">{skuInfo.brand}</div>
              )}
            </div>

            <div className="flex-1" />

            {/* Picking 정보 */}
            <div className="border-t-2 border-black pt-2">
              <div className="flex justify-between items-baseline mb-1">
                <div className="text-[9pt] text-gray-500 uppercase">Carton</div>
                <div>
                  {loc.is_mix ? (
                    <span className="text-[9pt] px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300 font-semibold">
                      MIX {loc.sku_count}종
                    </span>
                  ) : (
                    <span className="text-[9pt] px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300 font-semibold">
                      SINGLE
                    </span>
                  )}
                </div>
              </div>
              <div className="text-[16pt] font-bold font-mono leading-tight">
                {loc.carton_no}
              </div>

              <div className="mt-2 flex justify-between items-end">
                <div>
                  <div className="text-[9pt] text-gray-500 uppercase">Pick Qty</div>
                  <div className="text-[28pt] font-black leading-none">
                    {loc.qty}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[8pt] text-gray-500">of {skuInfo.total_qty} total</div>
                  <div className="text-[8pt] text-gray-500 mt-0.5">
                    {idx + 1} / {skuInfo.locations.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[7pt] text-gray-400 text-center border-t border-gray-200 pt-1">
              ASN: {detail?.asn_no || "-"} · PO: {detail?.po_no || "-"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
