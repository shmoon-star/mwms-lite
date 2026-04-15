"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
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
  };
  logisticsList: string[];
  brandLogistics: any[];
  logisticsSummary: { status: string; qty: number; brand_count: number }[];
  masterTotal: number;
  syncLogs: any[];
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function fmtNum(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
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

      {/* 월별 DC 출고 */}
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold mb-3">월별 DC 출고량</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.monthly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year_month" />
            <YAxis />
            <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
            <Bar dataKey="qty_shipped" fill="#3b82f6" name="실 선적 수량" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 브랜드 Top 20 */}
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold mb-3">브랜드별 Top 20 (실 선적)</h2>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={data.brands} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="brand" width={140} />
            <Tooltip formatter={(v: any) => fmtNum(Number(v))} />
            <Legend />
            <Bar dataKey="qty_ordered" fill="#d1d5db" name="발주" />
            <Bar dataKey="qty_shipped" fill="#3b82f6" name="실 선적" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 시즌 × 상태 */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-3">시즌 × Shipment Status</h2>
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
          <h2 className="text-lg font-semibold mb-3">평균 Lead Time (일수)</h2>
          <div className="space-y-3">
            <LtRow label="DC 입고 → DC 출고" value={data.leadTime.dc_in_to_dc_out} />
            <LtRow label="DC 출고 → 선적일자" value={data.leadTime.dc_out_to_shipment} />
            <LtRow label="DC 출고 → CN 입고" value={data.leadTime.dc_out_to_cn_in} />
            <LtRow label="평균 총 LT" value={data.leadTime.total_avg} highlight />
          </div>
        </div>
      </div>

      {/* 물류 현황 × 브랜드 (상품 Master 기반) */}
      {data.brandLogistics && data.brandLogistics.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border p-4 bg-blue-50">
              <div className="text-xs text-gray-600">Master 총 발주</div>
              <div className="mt-1 text-xl font-semibold">{fmtNum(data.masterTotal)}</div>
            </div>
            {data.logisticsSummary.map((ls, i) => (
              <div key={i} className="rounded-xl border p-4">
                <div className="text-xs text-gray-500">{ls.status}</div>
                <div className="mt-1 text-xl font-semibold">{fmtNum(ls.qty)}</div>
                <div className="text-xs text-gray-400">{ls.brand_count}개 브랜드</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="text-lg font-semibold mb-3">물류 현황 × 브랜드 (발주 수량)</h2>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">브랜드명</th>
                    {data.logisticsList.map(ls => (
                      <th key={ls} className="px-3 py-2 text-right whitespace-nowrap">{ls}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold bg-gray-100">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.brandLogistics.map((row: any, i: number) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{row.brand}</td>
                      {data.logisticsList.map(ls => (
                        <td key={ls} className="px-3 py-2 text-right">
                          {row[ls] ? fmtNum(row[ls]) : <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold bg-gray-50">{fmtNum(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sync 로그 */}
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold mb-3">최근 Sync 이력</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">시작</th>
              <th className="px-3 py-2 text-left">종료</th>
              <th className="px-3 py-2 text-center">상태</th>
              <th className="px-3 py-2 text-right">읽음</th>
              <th className="px-3 py-2 text-right">UPSERT</th>
              <th className="px-3 py-2 text-right">Skip</th>
              <th className="px-3 py-2 text-left">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.syncLogs.map((log, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 text-xs">{fmtDateTime(log.started_at)}</td>
                <td className="px-3 py-2 text-xs">{fmtDateTime(log.finished_at)}</td>
                <td className="px-3 py-2 text-center">
                  {log.status === "success" ? "✅" : log.status === "running" ? "⏳" : "❌"}
                </td>
                <td className="px-3 py-2 text-right">{log.rows_read}</td>
                <td className="px-3 py-2 text-right">{log.rows_upserted}</td>
                <td className="px-3 py-2 text-right text-gray-400">{log.rows_skipped}</td>
                <td className="px-3 py-2 text-xs text-red-600">{log.error_message || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function LtRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${highlight ? "font-semibold text-blue-600" : ""}`}>
      <span className="text-sm">{label}</span>
      <span className="text-lg">{value} 일</span>
    </div>
  );
}
