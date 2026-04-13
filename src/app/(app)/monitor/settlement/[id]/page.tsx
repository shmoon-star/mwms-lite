"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fmtDate } from "@/lib/fmt";

type SettlementDetail = {
  id: string;
  settlement_month: string;
  forwarding_cost: number;
  processing_cost: number;
  other_cost: number;
  total_qty: number;
  total_cost: number;
  cost_per_pcs: number;
  forwarding_per_pcs: number;
  processing_per_pcs: number;
  other_per_pcs: number;
  status: string;
  note: string | null;
  created_at: string;
  confirmed_at: string | null;
};

type DnRow = { id: string; dn_id: string; dn_no: string; ship_to: string; shipped_at: string; qty: number; invoice_no?: string };

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [settlement, setSettlement] = useState<SettlementDetail | null>(null);
  const [dns, setDns] = useState<DnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [fwd, setFwd] = useState("");
  const [proc, setProc] = useState("");
  const [oth, setOth] = useState("");
  const [noteVal, setNoteVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/monitor/settlement/${id}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSettlement(json.settlement);
      setDns(json.dns ?? []);
      setFwd(String(json.settlement.forwarding_cost ?? 0));
      setProc(String(json.settlement.processing_cost ?? 0));
      setOth(String(json.settlement.other_cost ?? 0));
      setNoteVal(json.settlement.note ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/monitor/settlement/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwarding_cost: Number(fwd), processing_cost: Number(proc), other_cost: Number(oth), note: noteVal }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setEditing(false);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadCsv() {
    if (!settlement || dns.length === 0) return;
    const s = settlement;
    const headers = ["settlement_month", "dn_no", "invoice_no", "ship_to", "shipped_at", "qty", "forwarding", "processing", "other", "total"];
    const rows = dns.map(d => {
      const dnFwd = s.total_qty > 0 ? Math.round((Number(s.forwarding_cost) / s.total_qty) * d.qty) : 0;
      const dnProc = s.total_qty > 0 ? Math.round((Number(s.processing_cost) / s.total_qty) * d.qty) : 0;
      const dnOth = s.total_qty > 0 ? Math.round((Number(s.other_cost) / s.total_qty) * d.qty) : 0;
      return [s.settlement_month, d.dn_no, d.invoice_no || "", d.ship_to, d.shipped_at, d.qty, dnFwd, dnProc, dnOth, dnFwd + dnProc + dnOth].join(",");
    });
    rows.push([s.settlement_month, "TOTAL", "", "", "", s.total_qty, Number(s.forwarding_cost), Number(s.processing_cost), Number(s.other_cost), Number(s.forwarding_cost) + Number(s.processing_cost) + Number(s.other_cost)].join(","));
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement_${s.settlement_month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleConfirm() {
    if (!confirm("정산을 확정하시겠습니까?")) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/monitor/settlement/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading...</div>;
  if (error) return <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>;
  if (!settlement) return null;

  const s = settlement;
  const isDraft = s.status === "DRAFT";

  // 실시간 안분 계산 (편집 중일 때)
  const liveFwd = Number(fwd) || 0;
  const liveProc = Number(proc) || 0;
  const liveOth = Number(oth) || 0;
  const liveTotal = liveFwd + liveProc + liveOth;
  const livePerPcs = s.total_qty > 0 ? liveTotal / s.total_qty : 0;

  return (
    <div style={{ maxWidth: 1000 }}>
      <Link href="/monitor/settlement" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Back to Settlements</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>{s.settlement_month} 정산</h1>
          <span style={{
            padding: "3px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: isDraft ? "#fef9c3" : "#dcfce7",
            color: isDraft ? "#854d0e" : "#166534",
            border: `1px solid ${isDraft ? "#fde68a" : "#bbf7d0"}`,
          }}>{s.status}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDownloadCsv} style={btnStyle}>↓ CSV</button>
          {isDraft && !editing && (
            <button onClick={() => setEditing(true)} style={btnStyle}>Edit</button>
          )}
          {isDraft && (
            <button onClick={handleConfirm} disabled={confirming} style={{ ...btnStyle, background: "#111", color: "#fff" }}>
              {confirming ? "..." : "Confirm"}
            </button>
          )}
        </div>
      </div>

      {/* 비용 요약 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20, background: editing ? "#fffbeb" : "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <CostInput label="포워딩비" value={fwd} onChange={setFwd} editing={editing} perPcs={s.total_qty > 0 ? (liveFwd / s.total_qty) : 0} />
          <CostInput label="입고/상품화비" value={proc} onChange={setProc} editing={editing} perPcs={s.total_qty > 0 ? (liveProc / s.total_qty) : 0} />
          <CostInput label="기타비용" value={oth} onChange={setOth} editing={editing} perPcs={s.total_qty > 0 ? (liveOth / s.total_qty) : 0} />
        </div>

        {editing && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Note</label>
            <input value={noteVal} onChange={e => setNoteVal(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginTop: 4 }} />
          </div>
        )}

        {editing && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: "#111", color: "#fff" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setFwd(String(s.forwarding_cost)); setProc(String(s.processing_cost)); setOth(String(s.other_cost)); setNoteVal(s.note ?? ""); }} style={btnStyle}>Cancel</button>
          </div>
        )}

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 14, display: "flex", gap: 32, flexWrap: "wrap" }}>
          <SummaryItem label="총 PCS" value={s.total_qty.toLocaleString()} />
          <SummaryItem label="총 비용" value={`₩${liveTotal.toLocaleString()}`} />
          <SummaryItem label="PCS당 총비용" value={`₩${livePerPcs.toFixed(2)}`} accent />
          <SummaryItem label="DN 수" value={`${dns.length}건`} />
          {s.note && <SummaryItem label="Note" value={s.note} />}
        </div>
      </div>

      {/* DN 목록 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: "#f9fafb", fontWeight: 700, fontSize: 14 }}>
          정산 대상 DN ({dns.length}건)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f3f4f6" }}>
            <tr>
              <th style={th}>DN No</th>
              <th style={th}>Invoice No</th>
              <th style={th}>Ship To</th>
              <th style={th}>Shipped At</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>포워딩</th>
              <th style={{ ...th, textAlign: "right" }}>상품화</th>
              <th style={{ ...th, textAlign: "right" }}>기타</th>
              <th style={{ ...th, textAlign: "right" }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {dns.map(d => {
              const dnFwd = s.total_qty > 0 ? Math.round((liveFwd / s.total_qty) * d.qty) : 0;
              const dnProc = s.total_qty > 0 ? Math.round((liveProc / s.total_qty) * d.qty) : 0;
              const dnOth = s.total_qty > 0 ? Math.round((liveOth / s.total_qty) * d.qty) : 0;
              return (
                <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{d.dn_no}</td>
                  <td style={td}>{d.invoice_no || "-"}</td>
                  <td style={td}>{d.ship_to || "-"}</td>
                  <td style={td}>{fmtDate(d.shipped_at) || "-"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{d.qty.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>₩{dnFwd.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>₩{dnProc.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>₩{dnOth.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>₩{(dnFwd + dnProc + dnOth).toLocaleString()}</td>
                </tr>
              );
            })}
            <tr style={{ background: "#111", color: "#fff", fontWeight: 700 }}>
              <td style={td} colSpan={4}>합계</td>
              <td style={{ ...td, textAlign: "right" }}>{s.total_qty.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>₩{liveFwd.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>₩{liveProc.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>₩{liveOth.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>₩{liveTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostInput({ label, value, onChange, editing, perPcs }: { label: string; value: string; onChange: (v: string) => void; editing: boolean; perPcs: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      {editing ? (
        <input type="number" value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, fontWeight: 700 }} />
      ) : (
        <div style={{ fontSize: 20, fontWeight: 700 }}>₩{Number(value).toLocaleString()}</div>
      )}
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>PCS당 ₩{perPcs.toFixed(2)}</div>
    </div>
  );
}

function SummaryItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? "#2563eb" : "#111" }}>{value}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: "6px 16px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#374151" };
const th: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#374151" };
const td: React.CSSProperties = { padding: "8px 12px" };
