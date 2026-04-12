"use client";

import { useEffect, useState } from "react";

type UpcomingEvent = {
  type: "PO" | "DN" | "SHIPMENT";
  event_type: "ETA" | "GI_DATE" | "DELIVERY_DATE" | "ETD";
  id: string;
  ref_no: string;
  date: string;
  status: string;
  qty: number;
};

const META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  "PO/ETA":           { label: "PO ETA",     bg: "#ede9fe", color: "#5b21b6", border: "#c4b5fd" },
  "DN/GI_DATE":       { label: "DN GI",       bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  "DN/DELIVERY_DATE": { label: "DN Delivery", bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  "SHIPMENT/ETA":     { label: "Ship ETA",    bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  "SHIPMENT/ETD":     { label: "Ship ETD",    bg: "#f3f4f6", color: "#374151", border: "#d1d5db" },
};
const ORDER = ["PO/ETA", "DN/GI_DATE", "DN/DELIVERY_DATE", "SHIPMENT/ETA", "SHIPMENT/ETD"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Returns days grid for a month: array of 6 weeks × 7 days (null = padding)
function buildCalendar(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  // Monday = 0 … Sunday = 6
  let startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {ORDER.map(k => {
        const m = META[k];
        return (
          <span key={k} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600,
            background: m.bg, color: m.color, border: `1px solid ${m.border}`,
          }}>{m.label}</span>
        );
      })}
    </div>
  );
}

export default function UpcomingRadar() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);

  useEffect(() => {
    const now = new Date();
    const t = now.toISOString().slice(0, 10);
    setToday(t);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);

    const ctrl = new AbortController();
    fetch("/api/monitor/upcoming", { cache: "no-store", signal: ctrl.signal })
      .then(r => r.json())
      .then(j => {
        if (j?.ok) setEvents(j.events ?? []);
        else setError(j?.error || "로드 실패");
      })
      .catch(e => { if (e?.name !== "AbortError") setError("일정 로드 실패"); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, []);

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  }

  // Map date → events
  const eventMap = new Map<string, UpcomingEvent[]>();
  for (const ev of events) {
    const list = eventMap.get(ev.date) ?? [];
    list.push(ev);
    eventMap.set(ev.date, list);
  }

  const monthLabel = viewYear && viewMonth
    ? new Date(viewYear, viewMonth - 1, 1).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : "";

  const weeks = viewYear && viewMonth ? buildCalendar(viewYear, viewMonth) : [];

  // Count total events in current view month
  const monthEvents = events.filter(ev => ev.date.startsWith(toYM(viewYear, viewMonth)));

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={prevMonth} style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14, color: "#374151" }}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", minWidth: 160, textAlign: "center" }}>{monthLabel}</span>
            <button onClick={nextMonth} style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14, color: "#374151" }}>›</button>
          </div>
          {/* Summary badge */}
          {!loading && monthEvents.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" }}>
              이번 달 {monthEvents.length}건
            </span>
          )}
        </div>
        <Legend />
      </div>

      {/* Calendar body */}
      <div style={{ padding: "12px 16px 16px" }}>
        {loading ? (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: "20px 0", textAlign: "center" }}>일정 로딩 중...</div>
        ) : error ? (
          <div style={{ color: "#ef4444", fontSize: 13, padding: "20px 0", textAlign: "center" }}>⚠ {error}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {WEEKDAYS.map(wd => (
                  <th key={wd} style={{
                    padding: "4px 6px", fontSize: 10, fontWeight: 700,
                    color: wd === "Sat" ? "#2563eb" : wd === "Sun" ? "#dc2626" : "#9ca3af",
                    textAlign: "center", borderBottom: "1px solid #f3f4f6",
                  }}>{wd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((dateStr, di) => {
                    if (!dateStr) {
                      return <td key={di} style={{ padding: "6px 4px", verticalAlign: "top", minHeight: 72 }} />;
                    }

                    const dayEvents = eventMap.get(dateStr) ?? [];
                    const isToday = dateStr === today;
                    const isPast = dateStr < today;
                    const dayNum = parseInt(dateStr.slice(8), 10);
                    const dow = di; // 0=Mon … 6=Sun
                    const isSat = dow === 5;
                    const isSun = dow === 6;

                    // Aggregate by event key
                    const slotMap = new Map<string, { count: number; qty: number }>();
                    for (const ev of dayEvents) {
                      const k = `${ev.type}/${ev.event_type}`;
                      const p = slotMap.get(k) ?? { count: 0, qty: 0 };
                      slotMap.set(k, { count: p.count + 1, qty: p.qty + (ev.qty || 0) });
                    }
                    const slots = ORDER.filter(k => slotMap.has(k));

                    return (
                      <td key={di} style={{
                        padding: "4px 4px",
                        verticalAlign: "top",
                        borderTop: wi > 0 ? "1px solid #f3f4f6" : "none",
                      }}>
                        <div style={{
                          minHeight: 72,
                          borderRadius: 8,
                          padding: "5px 6px",
                          background: isToday ? "#eff6ff" : "transparent",
                          border: isToday ? "1.5px solid #93c5fd" : "1px solid transparent",
                        }}>
                          {/* Day number */}
                          <div style={{
                            fontSize: 12, fontWeight: isToday ? 800 : 500,
                            color: isToday ? "#1d4ed8" : isPast ? "#d1d5db" : isSat ? "#2563eb" : isSun ? "#dc2626" : "#374151",
                            marginBottom: 4,
                          }}>
                            {dayNum}
                            {isToday && <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 700, color: "#1d4ed8" }}>TODAY</span>}
                          </div>

                          {/* Event badges */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {slots.map(k => {
                              const m = META[k];
                              const s = slotMap.get(k)!;
                              return (
                                <div key={k} style={{
                                  padding: "3px 6px", borderRadius: 5,
                                  background: m.bg, border: `1px solid ${m.border}`,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                    <span style={{ fontSize: 9, fontWeight: 600, color: m.color, lineHeight: 1 }}>{m.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: m.color, lineHeight: 1 }}>{s.count}건</span>
                                  </div>
                                  {s.qty > 0 && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: m.color, opacity: 0.8, marginTop: 1 }}>
                                      {s.qty.toLocaleString()} qty
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
