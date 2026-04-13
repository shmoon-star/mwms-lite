"use client";

import { useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, LabelList,
} from "recharts";

type DailyRow = { date: string; IN: number; OUT: number };
type NameValue = { name: string; value: number };
type AnalyticsData = {
  totalRows: number;
  dates: string[];
  daily: DailyRow[];
  inoutType: NameValue[];
  brands: NameValue[];
  pivot: Record<string, Record<string, number>>;
  stores: Record<string, Record<string, number>>;
  summary: { totalIN: number; totalOUT: number; days: number };
};

const COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#f97316", "#ef4444", "#8b5cf6", "#ec4899", "#84cc16"];
const STORE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"];

export default function WmsDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/buyer/analytics/wms-upload", { method: "POST", body: formData });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse Excel");
    } finally {
      setLoading(false);
    }
  }

  // 누적 계산
  const cumulative = data?.daily.reduce((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : { cumIN: 0, cumOUT: 0 };
    acc.push({ date: d.date, cumIN: prev.cumIN + d.IN, cumOUT: prev.cumOUT + d.OUT });
    return acc;
  }, [] as { date: string; cumIN: number; cumOUT: number }[]) ?? [];

  // 매장별 차트 데이터
  const storeChartData = data ? (() => {
    const storeNames = Object.keys(data.stores);
    if (storeNames.length === 0) return [];
    return data.dates.map(date => {
      const row: Record<string, any> = { date };
      for (const store of storeNames) {
        row[store] = data.stores[store][date] || 0;
      }
      return row;
    });
  })() : [];

  const storeNames = data ? Object.keys(data.stores) : [];
  const storeTotals = data ? storeNames.map(s => ({
    name: s,
    total: Object.values(data.stores[s]).reduce((sum, v) => sum + v, 0),
  })) : [];

  // 피벗 행 구성
  const pivotRows = data ? Object.entries(data.pivot).sort((a, b) => {
    const [aType] = a[0].split("|");
    const [bType] = b[0].split("|");
    if (aType !== bType) return aType === "IN" ? -1 : 1;
    return a[0].localeCompare(b[0]);
  }) : [];

  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>MUSINSA JP - WMS Daily Dashboard</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Excel 업로드 → 입출고 대시보드 자동 생성 (Type + InOut Type 빈칸 행 제외)
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <div style={{ border: "2px dashed #d1d5db", borderRadius: 12, padding: 24, marginBottom: 24, background: "#fafafa", textAlign: "center" }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{ display: "none" }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{ padding: "10px 24px", border: "1.5px solid #111", borderRadius: 8, background: "#111", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "분석 중..." : "Excel 파일 업로드"}
        </button>
        {fileName && <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>{fileName} {data ? `(${data.totalRows.toLocaleString()}건 분석 완료)` : ""}</div>}
        {error && <div style={{ marginTop: 8, fontSize: 13, color: "#dc2626" }}>{error}</div>}
      </div>

      {!data ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          WMS Excel 파일을 업로드하면 대시보드가 자동으로 생성됩니다.
          <br />Contents 시트의 Type, InOut Type, Date, PCS 컬럼이 필요합니다.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <SummaryCard label="Total IN" value={data.summary.totalIN.toLocaleString()} sub="PCS" color="#6366f1" />
            <SummaryCard label="Total OUT" value={data.summary.totalOUT.toLocaleString()} sub="PCS" color="#ef4444" />
            <SummaryCard label="Net" value={(data.summary.totalIN - data.summary.totalOUT).toLocaleString()} sub="PCS" color={data.summary.totalIN >= data.summary.totalOUT ? "#22c55e" : "#ef4444"} />
            <SummaryCard label="Days" value={String(data.summary.days)} sub="일" color="#3b82f6" />
            <SummaryCard label="Avg IN/Day" value={Math.round(data.summary.totalIN / Math.max(data.summary.days, 1)).toLocaleString()} sub="PCS" color="#6366f1" />
            <SummaryCard label="Avg OUT/Day" value={Math.round(data.summary.totalOUT / Math.max(data.summary.days, 1)).toLocaleString()} sub="PCS" color="#ef4444" />
          </div>

          {/* Chart 1: 일별 IN/OUT */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={cardTitle}>일별 입출고 PCS</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} PCS`} />
                <Legend />
                <Bar dataKey="IN" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} name="입고 (IN)" />
                <Bar dataKey="OUT" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} name="출고 (OUT)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2 + 3 */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ ...cardStyle, flex: "2 1 500px" }}>
              <div style={cardTitle}>누적 입출고 추이</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={cumulative} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} PCS`} />
                  <Legend />
                  <Line type="monotone" dataKey="cumIN" stroke="#6366f1" strokeWidth={2.5} dot={false} name="누적 입고" />
                  <Line type="monotone" dataKey="cumOUT" stroke="#ef4444" strokeWidth={2.5} dot={false} name="누적 출고" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...cardStyle, flex: "1 1 320px" }}>
              <div style={cardTitle}>입출고 유형별 비중</div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={data.inoutType} cx="50%" cy="45%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {data.inoutType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} PCS`} />
                  <Legend verticalAlign="bottom" height={50} formatter={(v: any) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: 매장별 출고 */}
          {storeNames.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 24 }}>
              <div style={cardTitle}>B2B 매장별 일별 출고</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
                B2C 제외, Vender 기준 |
                {storeTotals.map((s, i) => (
                  <span key={s.name} style={{ marginLeft: 12 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: STORE_COLORS[i % STORE_COLORS.length], marginRight: 4 }} />
                    {s.name}: {s.total.toLocaleString()} PCS
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={storeChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} PCS`} />
                  <Legend />
                  {storeNames.map((store, i) => (
                    <Bar key={store} dataKey={store} fill={STORE_COLORS[i % STORE_COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 5: 브랜드별 */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={cardTitle}>브랜드별 판매 물량 (Top 10, OUT Only)</div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.brands} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={110} />
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} PCS`} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24} name="PCS">
                  {data.brands.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  <LabelList dataKey="value" position="right" formatter={(v: any) => Number(v).toLocaleString()} style={{ fontSize: 11, fontWeight: 700, fill: "#374151" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 피벗 테이블 */}
          <div style={cardStyle}>
            <div style={cardTitle}>일별 피벗 (Type x InOut Type x Date)</div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={th}>Type</th>
                    <th style={th}>InOut Type</th>
                    {data.dates.map(d => <th key={d} style={{ ...th, minWidth: 52, textAlign: "right" }}>{d}</th>)}
                    <th style={{ ...th, textAlign: "right", fontWeight: 800 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pivotRows.map(([key, dateMap]) => {
                    const [type, inout] = key.split("|");
                    const total = Object.values(dateMap).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={key}>
                        <td style={{ ...td, fontWeight: 700 }}>{type}</td>
                        <td style={td}>{inout}</td>
                        {data.dates.map(d => {
                          const v = dateMap[d] || 0;
                          return <td key={d} style={{ ...td, textAlign: "right", color: v ? "#111" : "#d1d5db" }}>{v || "-"}</td>;
                        })}
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#111", color: "#fff", fontWeight: 700 }}>
                    <td style={td} colSpan={2}>Total</td>
                    {data.dates.map(d => {
                      const dayTotal = data.daily.find(dd => dd.date === d);
                      return <td key={d} style={{ ...td, textAlign: "right" }}>{((dayTotal?.IN ?? 0) + (dayTotal?.OUT ?? 0)).toLocaleString()}</td>;
                    })}
                    <td style={{ ...td, textAlign: "right" }}>{(data.summary.totalIN + data.summary.totalOUT).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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

const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 };
const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "2px solid #e5e7eb", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#374151" };
const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #f0f0f0", fontSize: 11 };
