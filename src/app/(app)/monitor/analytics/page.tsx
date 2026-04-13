"use client";

import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import Link from "next/link";

type Compliance = { on_time: number; late: number; total: number };
type LeadSegment = { segment: string; avg_days: number; qty: number };
type LeadTimeData = { segments: LeadSegment[]; total_days: number; total_qty: number };

type AnalyticsData = {
  tolerance_days: number;
  inbound_compliance: Compliance;
  outbound_compliance: Compliance;
  inbound_lead_time: LeadTimeData;
  outbound_lead_time: LeadTimeData;
};

const GREEN = "#22c55e";
const RED = "#ef4444";
const BLUE = "#3b82f6";
const ORANGE = "#f97316";

function pct(a: number, total: number): string {
  if (total === 0) return "0";
  return Math.round((a / total) * 100).toString();
}

/* ─── Donut Chart ─── */
function ComplianceDonut({
  title, subtitle, data, colors,
}: {
  title: string; subtitle: string; data: Compliance; colors: [string, string];
}) {
  const { on_time, late, total } = data;
  const percent = pct(on_time, total);
  const pieData = [
    { name: "On-time", value: on_time },
    { name: "Late", value: late },
  ];

  if (total === 0) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>{title}</div>
        <div style={subtitleStyle}>{subtitle}</div>
        <div style={{ textAlign: "center", padding: 50, color: "#9ca3af", fontSize: 13 }}>No data</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      <div style={subtitleStyle}>{subtitle}</div>
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {pieData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
            <Tooltip formatter={(v: any, n: any) => [`${Number(v).toLocaleString()} qty`, n]} />
            <Legend verticalAlign="bottom" height={28} formatter={(v: any) => <span style={{ fontSize: 11, color: "#555" }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{percent}%</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>on-time</div>
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
        On-time {on_time.toLocaleString()} / Late {late.toLocaleString()} (총 {total.toLocaleString()} qty)
      </div>
    </div>
  );
}

/* ─── Waterfall Lead Time Chart ─── */
function WaterfallLeadTime({
  title, subtitle, data, colors,
}: {
  title: string; subtitle: string; data: LeadTimeData; colors: string[];
}) {
  const { segments, total_days } = data;

  // 데이터 있는 구간만 (qty > 0 또는 days > 0)
  const activeSegs = segments.filter(s => s.qty > 0 || s.avg_days > 0);

  if (activeSegs.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>{title}</div>
        <div style={subtitleStyle}>{subtitle}</div>
        <div style={{ textAlign: "center", padding: 50, color: "#9ca3af", fontSize: 13 }}>No data</div>
      </div>
    );
  }

  // 워터폴 데이터: offset(투명) + days(컬러)
  // 데이터 없는 구간도 행은 유지 (빈 막대로 표시)
  const chartData: { segment: string; offset: number; days: number; color: string; qty: number }[] = [];
  let cumulative = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    chartData.push({
      segment: seg.segment,
      offset: cumulative,
      days: seg.avg_days,
      color: seg.avg_days > 0 ? colors[i % colors.length] : "#e5e7eb",
      qty: seg.qty,
    });
    cumulative += seg.avg_days;
  }

  // Total 행 추가
  chartData.push({
    segment: "Total",
    offset: 0,
    days: total_days,
    color: "#374151",
    qty: data.total_qty,
  });

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      <div style={subtitleStyle}>{subtitle}</div>

      <ResponsiveContainer width="100%" height={chartData.length * 48 + 35}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 65, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            unit="일"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={{ stroke: "#e5e7eb" }}
            domain={[0, Math.ceil(total_days * 1.15)]}
          />
          <YAxis
            type="category"
            dataKey="segment"
            tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={100}
          />
          <Tooltip
            formatter={(v: any, name: any, props: any) => {
              if (name === "offset") return ["", ""];
              return [`${v}일 (${(props?.payload?.qty ?? 0).toLocaleString()} qty)`, props?.payload?.segment];
            }}
            itemStyle={{ padding: 0 }}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          {/* 투명 offset (완전히 안 보임) */}
          <Bar dataKey="offset" stackId="waterfall" fill="rgba(0,0,0,0)" stroke="none" barSize={24} isAnimationActive={false} />
          {/* 실제 구간 막대 */}
          <Bar dataKey="days" stackId="waterfall" barSize={24} radius={[0, 6, 6, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
            <LabelList
              dataKey="days"
              position="right"
              formatter={(v: any) => `${v}일`}
              style={{ fontSize: 12, fontWeight: 700, fill: "#374151" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        {chartData.filter(d => d.segment !== "Total").map((d) => (
          <span key={d.segment} style={{ fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            {d.segment} <span style={{ color: "#9ca3af" }}>({d.qty.toLocaleString()} qty)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Settlement Summary ─── */
type SettlementSummary = {
  id: string;
  settlement_month: string;
  forwarding_cost: number;
  processing_cost: number;
  other_cost: number;
  total_qty: number;
  status: string;
  dns: { dn_no: string; ship_to: string; qty: number }[];
};

function SettlementSection({ settlement }: { settlement: SettlementSummary | null }) {
  if (!settlement) return null;

  const s = settlement;
  const totalCost = Number(s.forwarding_cost) + Number(s.processing_cost) + Number(s.other_cost);
  const perPcs = s.total_qty > 0 ? totalCost / s.total_qty : 0;

  // 바이어별 집계
  const byBuyer: Record<string, number> = {};
  for (const dn of s.dns) {
    const buyer = dn.ship_to || "Unknown";
    byBuyer[buyer] = (byBuyer[buyer] || 0) + dn.qty;
  }
  const buyerRows = Object.entries(byBuyer).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Monthly Settlement — {s.settlement_month}</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>바이어별 물류비 안분</div>
        </div>
        <Link href={`/monitor/settlement/${s.id}`} style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}>
          상세 보기 →
        </Link>
      </div>

      {/* 요약 한 줄 */}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        <MiniStat label="Total Cost" value={`₩${totalCost.toLocaleString()}`} />
        <MiniStat label="Total PCS" value={s.total_qty.toLocaleString()} />
        <MiniStat label="PCS당 비용" value={`₩${perPcs.toFixed(2)}`} accent />
        <MiniStat label="포워딩" value={`₩${Number(s.forwarding_cost).toLocaleString()}`} />
        <MiniStat label="상품화" value={`₩${Number(s.processing_cost).toLocaleString()}`} />
        <MiniStat label="기타" value={`₩${Number(s.other_cost).toLocaleString()}`} />
      </div>

      {/* 바이어별 테이블 */}
      {buyerRows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700 }}>Buyer (Ship To)</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>PCS</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>포워딩</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>상품화</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>기타</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {buyerRows.map(([buyer, qty]) => {
              const bFwd = s.total_qty > 0 ? Math.round((Number(s.forwarding_cost) / s.total_qty) * qty) : 0;
              const bProc = s.total_qty > 0 ? Math.round((Number(s.processing_cost) / s.total_qty) * qty) : 0;
              const bOth = s.total_qty > 0 ? Math.round((Number(s.other_cost) / s.total_qty) * qty) : 0;
              return (
                <tr key={buyer} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 10px", fontWeight: 600 }}>{buyer}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>{qty.toLocaleString()}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>₩{bFwd.toLocaleString()}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>₩{bProc.toLocaleString()}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>₩{bOth.toLocaleString()}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>₩{(bFwd + bProc + bOth).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent ? "#2563eb" : "#111" }}>{value}</div>
    </div>
  );
}

/* ─── Page ─── */
export default function MonitorAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [settlement, setSettlement] = useState<SettlementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Analytics + 최신 정산 동시 조회
    Promise.all([
      fetch("/api/monitor/analytics", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/monitor/settlement", { cache: "no-store" }).then(r => r.json()),
    ])
      .then(([analyticsJson, settlementJson]) => {
        if (!analyticsJson.ok) throw new Error(analyticsJson.error);
        setData(analyticsJson);

        // 최신 정산의 상세 가져오기
        if (settlementJson.ok && settlementJson.items?.length > 0) {
          const latest = settlementJson.items[0];
          fetch(`/api/monitor/settlement/${latest.id}`, { cache: "no-store" })
            .then(r => r.json())
            .then(json => {
              if (json.ok) {
                setSettlement({
                  ...json.settlement,
                  dns: json.dns ?? [],
                });
              }
            });
        }
      })
      .catch((e) => setError(e?.message ?? "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Performance Analytics</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Compliance (ETA ±{data?.tolerance_days ?? 2}일 허용, Qty 기준) &amp; Lead Time 구간별 평균
          </p>
        </div>
        <Link href="/monitor" style={{ padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#374151", textDecoration: "none" }}>
          ← Monitor
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
      ) : error ? (
        <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>
      ) : data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <ComplianceDonut title="Inbound Compliance" subtitle="ETA 대비 GR Confirmed (±2일 허용, Qty 기준)" data={data.inbound_compliance} colors={[GREEN, RED]} />
            <ComplianceDonut title="Outbound Compliance" subtitle="Planned GI Date 대비 DN Confirmed (±2일 허용, Qty 기준)" data={data.outbound_compliance} colors={[BLUE, ORANGE]} />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <WaterfallLeadTime
              title="Inbound Lead Time"
              subtitle="PO → ASN → GR 구간별 평균 소요일"
              data={data.inbound_lead_time}
              colors={["#6366f1", "#818cf8"]}
            />
            <WaterfallLeadTime
              title="Outbound Lead Time"
              subtitle="DN → Ship → ATD → ATA → GR 구간별 평균 소요일"
              data={data.outbound_lead_time}
              colors={["#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4"]}
            />
          </div>

          {/* 월정산 요약 */}
          <SettlementSection settlement={settlement} />
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = { flex: "1 1 400px", minWidth: 380, border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff" };
const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#111" };
const subtitleStyle: React.CSSProperties = { fontSize: 12, color: "#9ca3af", marginBottom: 12 };
