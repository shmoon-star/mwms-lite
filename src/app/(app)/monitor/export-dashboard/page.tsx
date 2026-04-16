"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
} from "recharts";

type DashData = {
  summary: {
    total_rows: number;
    total_ordered: number;
    total_shipped: number;
    total_amount: number;
    unique_brands: number;
    unique_bl: number;
  };
  monthly: { year_month: string; qty_shipped: number; row_count: number }[];
  brands: { brand: string; qty_shipped: number; qty_ordered: number }[];
  status: { season: string; status: string; qty: number; brand_count: number }[];
  leadTime: {
    dc_in_to_dc_out: number;
    dc_out_to_shipment: number;
    dc_out_to_cn_in: number;
    total_avg: number;
    counts?: { stage1: number; stage2: number; stage3: number; total: number };
  };
  logisticsList: string[];
  brandLogistics: any[];
  logisticsSummary: { status: string; qty: number; brand_count: number }[];
  masterTotal: number;
  categories: { category: string; unique_styles: number; unique_barcodes: number; total_qty: number }[];
  productSamples?: {
    uid: string;
    brand: string;
    style_color_code: string;
    product_name: string;
    category: string;
    qty: number;
    musinsa_url: string;
  }[];
  syncLogs: any[];
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function fmtNum(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

/** CSV 다운로드 헬퍼 */
function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.map(escape).join(","),
    ...rows.map(r => r.map(escape).join(",")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV 다운로드 버튼 */
function CsvButton({ onClick, label = "📥 CSV" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
      type="button"
    >
      {label}
    </button>
  );
}

function fmtDateTime(v: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("ko-KR");
  } catch {
    return v;
  }
}

export default function ExportDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState("26ss");
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/monitor/export-dashboard?season=${season}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [season]);

  async function handleManualSync() {
    if (!confirm("지금 즉시 Google Sheets에서 데이터를 동기화할까요?")) return;
    setSyncing(true);
    try {
      const secret = prompt("SYNC_SECRET 입력:");
      if (!secret) { setSyncing(false); return; }
      const res = await fetch(`/api/cron/sync-export-ledger?secret=${encodeURIComponent(secret)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Sync failed");
      alert(`Sync 완료\n- 읽음: ${json.log.rows_read}\n- UPSERT: ${json.log.rows_upserted}\n- Skip(locked): ${json.log.rows_skipped}`);
      await load();
    } catch (e: any) {
      alert(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading && !data) return <div className="p-6">Loading...</div>;
  if (!data) return <div className="p-6">No data</div>;

  const s = data.summary;
  const lastSync = data.syncLogs?.[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">수출 대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">
            Google Sheets에서 매일 09:00 자동 동기화 (KST)
          </p>
          {lastSync && (
            <p className="text-xs text-gray-400 mt-1">
              최근 sync: {fmtDateTime(lastSync.started_at)} ·
              {" "}{lastSync.status === "success" ? "✅" : "❌"}
              {" "}(업데이트 {lastSync.rows_upserted || 0}건)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="26ss">현재 시즌만 (26SS)</option>
            <option value="all">전체</option>
            <option value="25fw">25FW (아카이브)</option>
          </select>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {syncing ? "Syncing..." : "🔄 Sync Now"}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-6 gap-3">
        <Card label="Rows" value={fmtNum(s.total_rows)} />
        <Card label="Ordered Qty" value={fmtNum(s.total_ordered)} />
        <Card label="Shipped Qty" value={fmtNum(s.total_shipped)} />
        <Card label="Invoice 금액" value={"¥" + fmtNum(Math.round(s.total_amount))} />
        <Card label="Brands" value={fmtNum(s.unique_brands)} />
        <Card label="BL 수" value={fmtNum(s.unique_bl)} />
      </div>

      {/* ⚠️ 입고 전 현황 (최상단 강조) */}
      {(() => {
        const pendingBrands = data.brandLogistics
          ?.filter((r: any) => r["0. 입고 전"] > 0)
          .map((r: any) => ({ brand: r.brand, qty: r["0. 입고 전"] }))
          .sort((a: any, b: any) => b.qty - a.qty) || [];
        const pendingTotal = pendingBrands.reduce((s: number, b: any) => s + b.qty, 0);

        if (pendingBrands.length === 0) return null;

        return (
          <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-orange-700">
                  ⚠️ 입고 전 브랜드 — 처리 대기
                </h2>
                <p className="text-sm text-orange-600 mt-1">
                  DC 미입고 상태로 물류 처리가 필요한 상품
                </p>
              </div>
              <div className="text-right flex items-start gap-3">
                <div>
                  <div className="text-xs text-orange-600">총 미처리 수량</div>
                  <div className="text-3xl font-bold text-orange-700">{fmtNum(pendingTotal)}</div>
                  <div className="text-xs text-orange-500">{pendingBrands.length}개 브랜드</div>
                </div>
                <CsvButton
                  onClick={() =>
                    downloadCSV(
                      "입고전_브랜드.csv",
                      ["순위", "브랜드", "수량", "비중_%"],
                      pendingBrands.map((b: any, i: number) => [
                        i + 1,
                        b.brand,
                        b.qty,
                        ((b.qty / pendingTotal) * 100).toFixed(2),
                      ])
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 바 차트 */}
              <div className="bg-white rounded-lg p-3">
                <ResponsiveContainer width="100%" height={Math.max(300, pendingBrands.length * 28)}>
                  <BarChart data={pendingBrands} layout="vertical" margin={{ left: 10, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="brand"
                      width={150}
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />
                    <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
                    <Bar dataKey="qty" fill="#f59e0b" name="입고 전 수량">
                      <LabelList
                        dataKey="qty"
                        position="right"
                        style={{ fontSize: 11, fontWeight: 600, fill: "#c2410c" }}
                        formatter={(v: any) => fmtNum(Number(v))}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 테이블 */}
              <div className="bg-white rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-orange-100">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">브랜드</th>
                        <th className="px-3 py-2 text-right">수량</th>
                        <th className="px-3 py-2 text-right">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBrands.map((b: any, i: number) => (
                        <tr key={i} className="border-t hover:bg-orange-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{b.brand}</td>
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">
                            {fmtNum(b.qty)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500">
                            {((b.qty / pendingTotal) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 월별 DC 출고 + 브랜드 Top 20 — 2단 레이아웃 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 월별 DC 출고 */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-3">월별 DC 출고량</h2>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={data.monthly} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year_month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
              <Bar dataKey="qty_shipped" fill="#3b82f6" name="실 선적 수량">
                <LabelList
                  dataKey="qty_shipped"
                  position="top"
                  style={{ fontSize: 11, fontWeight: 600, fill: "#1f2937" }}
                  formatter={(v: any) => fmtNum(Number(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 브랜드 Top 20 — 리스트 테이블 */}
        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">브랜드별 Top 20 (실 선적)</h2>
            <CsvButton
              onClick={() => {
                const total = (data.brands || []).reduce((s: number, b: any) => s + (b.qty_shipped || 0), 0);
                downloadCSV(
                  "브랜드_Top20.csv",
                  ["순위", "브랜드", "발주", "실선적", "비중_%"],
                  (data.brands || []).map((b: any, i: number) => [
                    i + 1,
                    b.brand,
                    b.qty_ordered || 0,
                    b.qty_shipped || 0,
                    total > 0 ? ((b.qty_shipped / total) * 100).toFixed(2) : "0",
                  ])
                );
              }}
            />
          </div>
          {(() => {
            const total = (data.brands || []).reduce((s: number, b: any) => s + (b.qty_shipped || 0), 0);
            return (
              <div className="overflow-hidden rounded-lg border max-h-[560px] overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">브랜드</th>
                      <th className="px-2 py-2 text-right">발주</th>
                      <th className="px-2 py-2 text-right">실 선적</th>
                      <th className="px-2 py-2 text-right w-14">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.brands || []).map((b: any, i: number) => {
                      const ratio = total > 0 ? (b.qty_shipped / total) * 100 : 0;
                      return (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                          <td className="px-2 py-1.5 font-medium truncate max-w-[140px]">{b.brand}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{fmtNum(b.qty_ordered || 0)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-blue-700">{fmtNum(b.qty_shipped || 0)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{ratio.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold sticky bottom-0">
                    <tr className="border-t">
                      <td colSpan={3} className="px-2 py-2 text-right">Top 20 합계</td>
                      <td className="px-2 py-2 text-right">{fmtNum(total)}</td>
                      <td className="px-2 py-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 시즌 × 상태 */}
        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">시즌 × Shipment Status</h2>
            <CsvButton
              onClick={() =>
                downloadCSV(
                  "시즌x상태.csv",
                  ["시즌", "Status", "수량", "브랜드수"],
                  data.status.map(r => [r.season, r.status, r.qty, r.brand_count])
                )
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">시즌</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">수량</th>
                  <th className="px-3 py-2 text-right">브랜드</th>
                </tr>
              </thead>
              <tbody>
                {data.status.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{row.season}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtNum(row.qty)}</td>
                    <td className="px-3 py-2 text-right">{row.brand_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Time */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold">평균 Lead Time (일수)</h2>
          <p className="text-xs text-gray-500 mb-3">
            ℹ️ 실제 날짜 기준 재계산 · 이상치(음수/90일 초과) 및 미도착 건 제외
          </p>
          <div className="space-y-3">
            <LtRow label="DC 입고 → DC 출고" value={data.leadTime.dc_in_to_dc_out} count={data.leadTime.counts?.stage1} />
            <LtRow label="DC 출고 → 선적일자" value={data.leadTime.dc_out_to_shipment} count={data.leadTime.counts?.stage2} />
            <LtRow label="선적 → CN 도착" value={data.leadTime.dc_out_to_cn_in} count={data.leadTime.counts?.stage3} />
            <LtRow label="평균 총 LT (입고 → CN 도착)" value={data.leadTime.total_avg} count={data.leadTime.counts?.total} highlight />
          </div>
        </div>
      </div>

      {/* 물류 현황 × 브랜드 + 카테고리 Top 20 — 2단 레이아웃 */}
      {data.brandLogistics && data.brandLogistics.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* 왼쪽: 물류 현황 (작업 진행중/진행 예정) */}
            <div className="rounded-xl border p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-lg font-semibold">물류 현황 (작업 진행중 / 진행 예정)</h2>
                  <p className="text-xs text-gray-500">
                    ℹ️ Master 기준 · 입고 전 / 행택 부착 단계만
                  </p>
                </div>
                <CsvButton
                  onClick={() =>
                    downloadCSV(
                      "물류현황x브랜드.csv",
                      ["브랜드명", ...data.logisticsList, "합계"],
                      data.brandLogistics.map((row: any) => [
                        row.brand,
                        ...data.logisticsList.map(ls => row[ls] || 0),
                        row.total,
                      ])
                    )
                  }
                />
              </div>

              {/* 요약 카드를 섹션 헤더 안에 삽입 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg border p-2 bg-blue-50">
                  <div className="text-[10px] text-gray-600">미처리 합계</div>
                  <div className="text-base font-semibold">{fmtNum(data.masterTotal)}</div>
                </div>
                {data.logisticsSummary.map((ls, i) => (
                  <div key={i} className="rounded-lg border p-2">
                    <div className="text-[10px] text-gray-500 truncate" title={ls.status}>{ls.status}</div>
                    <div className="text-base font-semibold">
                      {fmtNum(ls.qty)}
                      <span className="text-[10px] text-gray-400 ml-1">· {ls.brand_count}브랜드</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left whitespace-nowrap">브랜드명</th>
                      {data.logisticsList.map(ls => (
                        <th key={ls} className="px-2 py-2 text-right whitespace-nowrap">{ls.replace(/^\d+\.\s*/, "")}</th>
                      ))}
                      <th className="px-2 py-2 text-right font-bold bg-gray-100">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.brandLogistics.map((row: any, i: number) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-2 py-1.5 font-medium truncate max-w-[140px]">{row.brand}</td>
                        {data.logisticsList.map(ls => {
                          const isPending = ls.includes("입고 전");
                          return (
                            <td
                              key={ls}
                              className={`px-2 py-1.5 text-right whitespace-nowrap ${isPending && row[ls] > 0 ? "bg-orange-50 text-orange-700 font-semibold" : ""}`}
                            >
                              {row[ls] ? fmtNum(row[ls]) : <span className="text-gray-300">-</span>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-semibold bg-gray-50">{fmtNum(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 오른쪽: 카테고리 Top 20 */}
            {data.categories && data.categories.length > 0 && (() => {
              const topCategories = data.categories.slice(0, 20);
              const totalQty = data.categories.reduce((s, c) => s + c.total_qty, 0);
              const top20Qty = topCategories.reduce((s, c) => s + c.total_qty, 0);
              return (
                <div className="rounded-xl border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">카테고리별 Top 20</h2>
                      <p className="text-xs text-gray-500 mb-3">
                        ℹ️ 전체 {data.categories.length}개 중 상위 20 · 스타일 / 바코드 / 발주
                      </p>
                    </div>
                    <CsvButton
                      onClick={() =>
                        downloadCSV(
                          "카테고리_전체.csv",
                          ["순위", "카테고리", "스타일수_고유", "바코드수_고유", "발주수량", "비중_%"],
                          data.categories.map((c, i) => [
                            i + 1,
                            c.category,
                            c.unique_styles,
                            c.unique_barcodes,
                            c.total_qty,
                            totalQty > 0 ? ((c.total_qty / totalQty) * 100).toFixed(2) : "0",
                          ])
                        )
                      }
                      label="📥 CSV (전체)"
                    />
                  </div>
                  <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr>
                          <th className="px-2 py-2 text-left w-8">#</th>
                          <th className="px-2 py-2 text-left">카테고리</th>
                          <th className="px-2 py-2 text-right">스타일</th>
                          <th className="px-2 py-2 text-right">바코드</th>
                          <th className="px-2 py-2 text-right">발주</th>
                          <th className="px-2 py-2 text-right w-12">비중</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCategories.map((c, i) => {
                          const ratio = totalQty > 0 ? (c.total_qty / totalQty) * 100 : 0;
                          return (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="px-2 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                              <td className="px-2 py-1.5 font-medium truncate max-w-[180px]" title={c.category}>{c.category}</td>
                              <td className="px-2 py-1.5 text-right">{fmtNum(c.unique_styles)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtNum(c.unique_barcodes)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-blue-700">{fmtNum(c.total_qty)}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{ratio.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold sticky bottom-0">
                        <tr className="border-t">
                          <td colSpan={4} className="px-2 py-2 text-right">Top 20 합계</td>
                          <td className="px-2 py-2 text-right">{fmtNum(top20Qty)}</td>
                          <td className="px-2 py-2 text-right">
                            {totalQty > 0 ? ((top20Qty / totalQty) * 100).toFixed(1) : "0"}%
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* 상품 검색 + 샘플 갤러리 */}
      <ProductSearchSection defaultSamples={data.productSamples || []} />


      {/* Sync 로그 — 최근 1건만 Compact */}
      {data.syncLogs[0] && (
        <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-600 flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-gray-700">최근 Sync</span>
          <span>
            {data.syncLogs[0].status === "success" ? "✅" : data.syncLogs[0].status === "running" ? "⏳" : "❌"}
            {" "}{data.syncLogs[0].status}
          </span>
          <span>📅 {fmtDateTime(data.syncLogs[0].started_at)}</span>
          <span>읽음 {data.syncLogs[0].rows_read || 0}</span>
          <span>UPSERT {data.syncLogs[0].rows_upserted || 0}</span>
          {data.syncLogs[0].rows_skipped > 0 && <span>Skip {data.syncLogs[0].rows_skipped}</span>}
          {data.syncLogs[0].error_message && (
            <span className="text-red-600">⚠ {data.syncLogs[0].error_message}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ p }: { p: any }) {
  const hasUid = !!p.uid;
  const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e5e7eb'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='9'%3ENo Image%3C/text%3E%3C/svg%3E";
  const href = p.musinsa_url || (p.uid ? `https://www.musinsa.com/products/${p.uid}` : p.zsangmall_url);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border hover:shadow-md overflow-hidden bg-white"
    >
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {hasUid ? (
          <img
            src={`/api/monitor/musinsa-og?uid=${p.uid}`}
            alt={p.product_name || p.brand}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackSvg;
            }}
          />
        ) : (
          <img src={fallbackSvg} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-semibold truncate">{p.brand}</div>
        <div className="text-[10px] text-gray-500 truncate">{p.product_name || p.style_color_code}</div>
        <div className="text-[10px] text-gray-400 mt-0.5 flex justify-between">
          <span className="truncate">{p.style_color_code}</span>
          <span>발주 {fmtNum(p.qty || 0)}</span>
        </div>
      </div>
    </a>
  );
}

function ProductCardLarge({ p }: { p: any }) {
  if (!p) return null;
  const hasUid = !!p.uid;
  const fallbackSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23e5e7eb'/%3E%3Ctext x='100' y='100' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='16'%3ENo Image%3C/text%3E%3C/svg%3E";
  const href = p.musinsa_url || (p.uid ? `https://www.musinsa.com/products/${p.uid}` : p.zsangmall_url);

  return (
    <div className="rounded-lg border overflow-hidden bg-white">
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {hasUid ? (
          <img
            src={`/api/monitor/musinsa-og?uid=${p.uid}`}
            alt={p.product_name || p.brand}
            loading="eager"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = fallbackSvg; }}
          />
        ) : (
          <img src={fallbackSvg} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-semibold truncate">{p.brand}</div>
        <div className="text-xs text-gray-600 truncate" title={p.product_name}>{p.product_name || "-"}</div>
        <div className="text-[11px] text-gray-500 font-mono truncate">{p.style_color_code}</div>
        {p.category && (
          <div className="text-[10px] text-gray-400 truncate" title={p.category}>{p.category}</div>
        )}
        <div className="flex items-center justify-between pt-1 text-[11px]">
          <span className="text-gray-500">발주 {fmtNum(p.qty || 0)}</span>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              무신사 🔗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductSearchSection({ defaultSamples }: { defaultSamples: any[] }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  async function handleSearch(q: string) {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/monitor/history-search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.ok) setSearchResults(json.items);
    } catch (e: any) {
      alert(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const items = searchResults ?? defaultSamples;
  const isSearchMode = searchResults !== null;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {isSearchMode ? `검색 결과 (${items.length}건)` : "상품 샘플 (브랜드별)"}
          </h2>
          <p className="text-xs text-gray-500">
            ℹ️ 무신사 UID 기반 썸네일 · 클릭 시 상품 페이지 · 스타일넘버/SKU/상품명/바코드/카테고리/브랜드명 검색 가능
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(query); }}
            placeholder="검색어 입력 후 Enter"
            className="w-[260px] rounded border px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => handleSearch(query)}
            disabled={searching}
            className="rounded bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {searching ? "검색중..." : "검색"}
          </button>
          {isSearchMode && (
            <button
              type="button"
              onClick={() => { setQuery(""); setSearchResults(null); }}
              className="rounded border px-2 py-1.5 text-xs hover:bg-gray-50"
            >
              ✕ 초기화
            </button>
          )}
          {items.length > 0 && (
            <CsvButton
              onClick={() =>
                downloadCSV(
                  isSearchMode ? `검색결과_${query}.csv` : "상품샘플.csv",
                  ["브랜드", "스타일넘버", "SKU", "상품명", "카테고리", "바코드", "UID", "수량", "무신사URL"],
                  items.map((p: any) => [
                    p.brand || "",
                    p.style_number || "",
                    p.style_color_code || "",
                    p.product_name || "",
                    p.category || "",
                    p.barcode || "",
                    p.uid || "",
                    p.qty || 0,
                    p.musinsa_url || (p.uid ? `https://www.musinsa.com/products/${p.uid}` : ""),
                  ])
                )
              }
            />
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          {isSearchMode ? "검색 결과 없음" : "샘플 없음"}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {/* 좌측: 대표 이미지 1개 (큰 미리보기) */}
          <div className="col-span-1">
            <ProductCardLarge p={items[0]} />
          </div>

          {/* 우측: 나머지 결과 리스트 (텍스트만) */}
          <div className="col-span-3">
            <div className="rounded-lg border overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">#</th>
                    <th className="px-3 py-2 text-left">브랜드</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">상품명</th>
                    <th className="px-3 py-2 text-left">카테고리</th>
                    <th className="px-3 py-2 text-right">수량</th>
                    <th className="px-3 py-2 text-center w-16">링크</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 30).map((p: any, i: number) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium truncate max-w-[100px]">{p.brand}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-600 truncate max-w-[120px]">{p.style_color_code}</td>
                      <td className="px-3 py-1.5 truncate max-w-[180px]" title={p.product_name}>{p.product_name || "-"}</td>
                      <td className="px-3 py-1.5 text-gray-500 truncate max-w-[140px]">{p.category || "-"}</td>
                      <td className="px-3 py-1.5 text-right">{fmtNum(p.qty || 0)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {p.uid ? (
                          <a
                            href={`https://www.musinsa.com/products/${p.uid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            🔗
                          </a>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {items.length > 30 && (
              <div className="mt-2 text-xs text-gray-500 text-center">
                총 {items.length}건 중 상위 30건 · 전체는 CSV 다운로드
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function LtRow({ label, value, count, highlight }: { label: string; value: number; count?: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${highlight ? "font-semibold text-blue-600" : ""}`}>
      <div className="flex flex-col">
        <span className="text-sm">{label}</span>
        {count !== undefined && (
          <span className="text-[10px] text-gray-400">N = {fmtNum(count)}</span>
        )}
      </div>
      <span className="text-lg">{value} 일</span>
    </div>
  );
}
