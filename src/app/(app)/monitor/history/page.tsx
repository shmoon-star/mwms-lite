"use client";

import { useEffect, useState, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";

type Summary = {
  total_docs: number;
  po_count: number;
  dn_count: number;
  shipment_count: number;
  gr_count: number;
  total_po_qty: number;
  total_dn_qty: number;
  total_shipment_qty: number;
  total_gr_qty: number;
  total_cost: number;
  date_range: { from: string | null; to: string | null };
};

type Allocation = {
  year_month: string;
  buyer_code: string | null;
  dn_nos?: string[];
  total_cost: number;
  forwarding_cost?: number;
  processing_cost?: number;
  other_cost?: number;
  total_qty: number;
  cost_per_pcs: number;
  dns: { dn_no: string; buyer: string | null; qty: number; item_count: number; ratio: number; allocated_cost: number }[];
  warning?: string;
};

type HistoryData = {
  summary: Summary;
  monthly: { year_month: string; PO: number; DN: number; SHIPMENT: number; GR: number }[];
  buyerMonthly: any[];
  buyerCountTotal: number;
  vendorMonthly: any[];
  leadTime: { year_month: string; avg_days: number }[];
  allocations: Allocation[];
  allMonths: string[];
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n);
}

function fmtKRW(n: number): string {
  return "₩" + new Intl.NumberFormat("ko-KR").format(n);
}

export default function HistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [selectedAllocIdx, setSelectedAllocIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/monitor/history", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e: any) {
      alert(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ok = confirm(
      `이 파일로 기존 History 데이터를 전부 교체합니다.\n\n파일: ${file.name}\n\n진행할까요?`
    );
    if (!ok) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/monitor/history/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");
      setUploadResult(json);
      await load();
      alert(
        `업로드 완료\n\n` +
        `- PO: ${json.summary.po_count}건\n` +
        `- DN: ${json.summary.dn_count}건\n` +
        `- Shipment: ${json.summary.shipment_count}건\n` +
        `- GR: ${json.summary.gr_count}건\n` +
        `- Settlement: ${json.summary.settlement_count}건`
      );
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading && !data) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">No data</div>;

  const s = data.summary;
  const selectedAlloc = selectedAllocIdx !== null ? data.allocations[selectedAllocIdx] : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-sm text-gray-500 mt-1">
            과거 데이터 업로드 및 통계 (현재 운영 데이터와 완전 분리)
          </p>
          {s.date_range.from && (
            <p className="text-xs text-gray-400 mt-1">
              기간: {s.date_range.from} ~ {s.date_range.to}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <a
            href="/api/monitor/history/template"
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
          >
            📥 양식 다운로드
          </a>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
            id="history-upload"
          />
          <label
            htmlFor="history-upload"
            className={`rounded px-4 py-2 text-sm text-white cursor-pointer ${uploading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
          >
            {uploading ? "Uploading..." : "📤 Excel 업로드 (오버라이드)"}
          </label>
        </div>
      </div>

      {/* Summary Cards — 건수는 unique 문서 번호 기준 (line 수 아님) */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">PO (건 / Qty)</div>
          <div className="mt-1 text-xl font-semibold">{fmtNum(s.po_count)} / {fmtNum(s.total_po_qty)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">DN (건 / Qty)</div>
          <div className="mt-1 text-xl font-semibold">{fmtNum(s.dn_count)} / {fmtNum(s.total_dn_qty)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Shipment (건 / Qty)</div>
          <div className="mt-1 text-xl font-semibold">{fmtNum(s.shipment_count)} / {fmtNum(s.total_shipment_qty)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Total Cost</div>
          <div className="mt-1 text-xl font-semibold">{fmtKRW(s.total_cost)}</div>
        </div>
      </div>

      {/* 월별 물동량 — PO(입고) vs SHIPMENT(수출) 두 축만 비교 */}
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold mb-3">월별 물동량 (Qty)</h2>
        <p className="text-xs text-gray-500 mb-2">
          ℹ️ PO(입고 발주) vs SHIPMENT(실 수출) · DN/GR은 PO와 거의 동일하여 제외
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data.monthly} margin={{ top: 24, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year_month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
            <Legend />
            <Bar dataKey="PO" fill="#3b82f6" name="PO (입고)">
              <LabelList
                dataKey="PO"
                position="top"
                style={{ fontSize: 10, fontWeight: 600, fill: "#1e40af" }}
                formatter={(v: any) => (v > 0 ? fmtNum(Number(v)) : "")}
              />
            </Bar>
            <Bar dataKey="SHIPMENT" fill="#f59e0b" name="SHIPMENT (수출)">
              <LabelList
                dataKey="SHIPMENT"
                position="top"
                style={{ fontSize: 10, fontWeight: 600, fill: "#b45309" }}
                formatter={(v: any) => (v > 0 ? fmtNum(Number(v)) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 바이어별 월별 출고 — Top 20 */}
      <div className="rounded-xl border p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">바이어별 월별 출고량 (Shipment Qty)</h2>
          <p className="text-xs text-gray-500">
            Top 20 (총 출고량 기준) · 전체 {fmtNum(data.buyerCountTotal || 0)}개 바이어 중
          </p>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left">Buyer</th>
                {data.allMonths.map(m => <th key={m} className="px-3 py-2 text-right">{m}</th>)}
                <th className="px-3 py-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.buyerMonthly.map((row: any, i: number) => {
                const total = row._total ?? data.allMonths.reduce((s, m) => s + (row[m] || 0), 0);
                return (
                  <tr key={row.buyer_code} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row.buyer_code}</td>
                    {data.allMonths.map(m => (
                      <td key={m} className="px-3 py-2 text-right">{fmtNum(row[m] || 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold">{fmtNum(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shipment Lead Time 섹션은 Export Dashboard와 중복이므로 제거됨 */}

      {/* Settlement 자동 안분 */}
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold mb-3">월별 Settlement 자동 안분 (DN 레벨)</h2>
        {data.allocations.length === 0 ? (
          <div className="text-sm text-gray-500">Settlement 데이터가 없습니다.</div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Year-Month</th>
                    <th className="px-3 py-2 text-left">Buyer</th>
                    <th className="px-3 py-2 text-center">DN 대상</th>
                    <th className="px-3 py-2 text-right">Forwarding</th>
                    <th className="px-3 py-2 text-right">Processing</th>
                    <th className="px-3 py-2 text-right">Other</th>
                    <th className="px-3 py-2 text-right">Total Cost</th>
                    <th className="px-3 py-2 text-right">Total Qty</th>
                    <th className="px-3 py-2 text-right">₩/PCS</th>
                    <th className="px-3 py-2 text-center">DN 상세</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map((a, i) => (
                    <tr key={i} className={`border-t ${selectedAllocIdx === i ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2 font-medium">{a.year_month}</td>
                      <td className="px-3 py-2">{a.buyer_code || "전체"}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {a.dn_nos && a.dn_nos.length > 0
                          ? <span title={a.dn_nos.join(", ")}>{a.dn_nos.length}개</span>
                          : <span className="text-gray-400">전체</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtKRW(a.forwarding_cost || 0)}</td>
                      <td className="px-3 py-2 text-right">{fmtKRW(a.processing_cost || 0)}</td>
                      <td className="px-3 py-2 text-right">{fmtKRW(a.other_cost || 0)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtKRW(a.total_cost)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(a.total_qty)}</td>
                      <td className="px-3 py-2 text-right">{fmtKRW(a.cost_per_pcs)}</td>
                      <td className="px-3 py-2 text-center">
                        {a.warning ? (
                          <span className="text-xs text-red-600">⚠ {a.warning}</span>
                        ) : (
                          <button
                            onClick={() => setSelectedAllocIdx(selectedAllocIdx === i ? null : i)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            {selectedAllocIdx === i ? "접기" : `보기 (${a.dns.length})`}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DN 상세 */}
            {selectedAlloc && selectedAlloc.dns.length > 0 && (
              <div className="rounded border bg-gray-50 p-3">
                <div className="text-sm font-semibold mb-2">
                  {selectedAlloc.year_month} {selectedAlloc.buyer_code ? `(${selectedAlloc.buyer_code})` : "(전체)"} — DN별 안분 결과
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="min-w-full text-xs bg-white">
                    <thead className="bg-white sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">DN No</th>
                        <th className="px-3 py-2 text-left">Buyer</th>
                        <th className="px-3 py-2 text-right">Line Count</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Ratio</th>
                        <th className="px-3 py-2 text-right">Allocated Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAlloc.dns.map((dn, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-mono">{dn.dn_no}</td>
                          <td className="px-3 py-2">{dn.buyer || "-"}</td>
                          <td className="px-3 py-2 text-right">{dn.item_count}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(dn.qty)}</td>
                          <td className="px-3 py-2 text-right">{(dn.ratio * 100).toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtKRW(dn.allocated_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2">
                  <a
                    href={`/api/monitor/history/export?ym=${selectedAlloc.year_month}${selectedAlloc.buyer_code ? `&buyer=${encodeURIComponent(selectedAlloc.buyer_code)}` : ""}`}
                    className="inline-block text-xs text-blue-600 hover:underline"
                  >
                    📥 CSV 다운로드
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Excel 양식 안내 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="font-semibold mb-2">📋 Excel 양식 (5개 시트)</div>
        <div className="space-y-1 text-xs text-gray-700">
          <div><b>PO:</b> po_no, po_date, vendor_code, sku, description, qty, unit_price, amount</div>
          <div><b>DN:</b> dn_no, dn_date, buyer_code, sku, description, qty</div>
          <div><b>Shipment:</b> shipment_no, ship_date, dn_no, bl_no, etd, eta, atd, ata, buyer_gr_date, invoice_no, vessel, container, buyer_code, sku, qty</div>
          <div><b>GR:</b> gr_no, gr_date, vendor_code, sku, qty</div>
          <div><b>Settlement:</b> year_month, buyer_code, forwarding_cost, processing_cost, other_cost, notes, <b>DN_NO</b>
            <div className="ml-4 text-gray-600">
              ↳ 비용이 있는 첫 행 = 정산 그룹 시작, 아래 행에 DN_NO만 채우면 같은 그룹에 포함됨
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-amber-800">
          ⚠️ 업로드 시 기존 History 데이터는 <b>전체 삭제 후 재삽입</b>됩니다 (오버라이드).
        </div>
      </div>
    </div>
  );
}
