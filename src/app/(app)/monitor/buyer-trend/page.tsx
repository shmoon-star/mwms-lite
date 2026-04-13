"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, LabelList,
} from "recharts";
import Link from "next/link";

type DailyRow = { date: string; IN: number; OUT: number };
type BuyerTotal = { buyer: string; total: number };

type TrendData = {
  dates: string[];
  daily: DailyRow[];
  buyers: Record<string, Record<string, number>>;
  buyerTotals: BuyerTotal[];
  summary: { totalIN: number; totalOUT: number; days: number; buyerCount: number };
};

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#ec4899", "#14b8a6", "#f97316"];

export default function BuyerTrendPage() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/monitor/buyer-trend", { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error);
        setData(json);
      })
      .catch(e => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div>;
  if (error) return <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>;
  if (!data) return null;

  const { daily, dates, buyers, buyerTotals, summary } = data;

  // 누적
  const cumulative = daily.reduce((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : { cumIN: 0, cumOUT: 0 };
    acc.push({ date: d.date, cumIN: prev.cumIN + d.IN, cumOUT: prev.cumOUT + d.OUT });
    return acc;
  }, [] as { date: string; cumIN: number; cumOUT: number }[]);

  // 바이어별 차트 데이터 (top 8)
  const topBuyers = buyerTotals.slice(0, 8);
  const buyerNames = topBuyers.map(b => b.buyer);

  const buyerChartData = dates.map(date => {
    const row: Record<string, any> = { date };
    for (const name of buyerNames) {
      row[name] = buyers[name]?.[date] || 0;
    }
    return row;
  });

  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Buyer Trend (DB 기반)</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            DN ship_to(바이어/목적지)별 입출고 트렌드 | GR(입고) + DN(출고) 데이터
          </p>
        </div>
        <Link href="/monitor" style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#374151", textDecoration: "none" }}>
          ← Monitor
        </Link>
      </div>

      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <SummaryCard label="Total IN (GR)" value={summary.totalIN.toLocaleString()} sub="qty" color="#6366f1" />
        <SummaryCard label="Total OUT (DN)" value={summary.totalOUT.toLocaleString()} sub="qty" color="#ef4444" />
        <SummaryCard label="Buyers" value={String(summary.buyerCount)} sub="곳" color="#2563eb" />
        <SummaryCard label="Days" value={String(summary.days)} sub="일" color="#3b82f6" />
      </div>

      {/* 일별 IN/OUT */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={cardTitle}>일별 입출고 (DB 기준)</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} qty`} />
            <Legend />
            <Bar dataKey="IN" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} name="입고 (GR)" />
            <Bar dataKey="OUT" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} name="출고 (DN)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 누적 추이 */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={cardTitle}>누적 입출고 추이</div>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={cumulative} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} qty`} />
            <Legend />
            <Line type="monotone" dataKey="cumIN" stroke="#6366f1" strokeWidth={2.5} dot={false} name="누적 입고" />
            <Line type="monotone" dataKey="cumOUT" stroke="#ef4444" strokeWidth={2.5} dot={false} name="누적 출고" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 바이어별 일별 출고 */}
      {buyerNames.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={cardTitle}>바이어(목적지)별 일별 출고</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
            DN ship_to 기준 Top {buyerNames.length} |
            {topBuyers.map((b, i) => (
              <span key={b.buyer} style={{ marginLeft: 12 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], marginRight: 4 }} />
                {b.buyer}: {b.total.toLocaleString()} qty
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buyerChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} qty`} />
              <Legend />
              {buyerNames.map((name, i) => (
                <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={28} stackId="buyers" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 바이어별 합계 */}
      <div style={cardStyle}>
        <div style={cardTitle}>바이어별 출고 합계</div>
        <ResponsiveContainer width="100%" height={Math.max(buyerTotals.length * 40 + 30, 200)}>
          <BarChart data={buyerTotals} layout="vertical" margin={{ top: 5, right: 70, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="buyer" tick={{ fontSize: 12, fontWeight: 600 }} width={120} />
            <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} qty`} />
            <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={24} name="qty">
              {buyerTotals.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
              <LabelList dataKey="total" position="right" formatter={(v: any) => Number(v).toLocaleString()} style={{ fontSize: 11, fontWeight: 700, fill: "#374151" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 140, border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px", background: "#fff", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#111", marginTop: 4 }}>{value} <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 400 }}>{sub}</span></div>
    </div>
  );
}

// Cell import for individual bar colors
import { Cell } from "recharts";

const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 };
