"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
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
          <a
            href={`/api/monitor/export-dashboard/raw-dump?season=${season}`}
            className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
            title="현재 DB의 history_export_raw 원본 CSV 다운로드 (Google Sheet와 대조용)"
          >
            📥 Raw CSV
          </a>
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
          {data.syncLogs[0].rows_skipped > 0 && <span title="is_locked=true로 잠긴 row (25fw 등)">Skip(lock) {data.syncLogs[0].rows_skipped}</span>}
          {data.syncLogs[0].rows_filtered_empty > 0 && <span title="오더시즌/Brand/SKU가 모두 비어 매핑에서 제외된 row">Skip(empty) {data.syncLogs[0].rows_filtered_empty}</span>}
          {data.syncLogs[0].error_message && (
            <span className="text-red-600">⚠ {data.syncLogs[0].error_message}</span>
          )}
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
