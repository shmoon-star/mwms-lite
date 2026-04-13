"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type Settlement = {
  id: string;
  settlement_month: string;
  forwarding_cost: number;
  processing_cost: number;
  other_cost: number;
  total_qty: number;
  status: string;
  note: string | null;
  created_at: string;
  confirmed_at: string | null;
  dn_count: number;
  total_cost: number;
  cost_per_pcs: number;
};

type DnCandidate = {
  id: string;
  dn_no: string;
  status: string;
  ship_to: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
  qty: number;
};

export default function SettlementListPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  // 생성 폼
  const [showCreate, setShowCreate] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dnCandidates, setDnCandidates] = useState<DnCandidate[]>([]);
  const [selectedDns, setSelectedDns] = useState<Set<string>>(new Set());
  const [loadingDns, setLoadingDns] = useState(false);
  const [forwarding, setForwarding] = useState("");
  const [processing, setProcessing] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function loadSettlements() {
    setLoading(true);
    try {
      const res = await fetch("/api/monitor/settlement");
      const json = await res.json();
      if (json.ok) setSettlements(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSettlements(); }, []);

  async function loadDnCandidates() {
    setLoadingDns(true);
    setDnCandidates([]);
    setSelectedDns(new Set());
    try {
      const res = await fetch("/api/monitor/settlement/dns");
      const json = await res.json();
      if (json.ok) {
        setDnCandidates(json.items ?? []);
        setSelectedDns(new Set((json.items ?? []).map((d: DnCandidate) => d.id)));
      }
    } finally {
      setLoadingDns(false);
    }
  }

  function handleMonthChange(m: string) {
    setMonth(m);
  }

  function toggleDn(id: string) {
    setSelectedDns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedDns.size === dnCandidates.length) {
      setSelectedDns(new Set());
    } else {
      setSelectedDns(new Set(dnCandidates.map(d => d.id)));
    }
  }

  const selectedQty = dnCandidates.filter(d => selectedDns.has(d.id)).reduce((s, d) => s + d.qty, 0);
  const fwd = Number(forwarding) || 0;
  const proc = Number(processing) || 0;
  const oth = Number(other) || 0;
  const totalCost = fwd + proc + oth;
  const perPcs = selectedQty > 0 ? totalCost / selectedQty : 0;

  async function handleCreate() {
    if (selectedDns.size === 0) { alert("DN을 선택하세요"); return; }
    setCreating(true);
    setCreateResult(null);
    try {
      const dns = dnCandidates.filter(d => selectedDns.has(d.id)).map(d => ({
        dn_id: d.id, dn_no: d.dn_no, ship_to: d.ship_to || "", shipped_at: d.shipped_at || "", qty: d.qty,
      }));
      const res = await fetch("/api/monitor/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlement_month: month,
          forwarding_cost: fwd,
          processing_cost: proc,
          other_cost: oth,
          note,
          dns,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setCreateResult({ type: "success", msg: `${month} 정산 생성 완료` });
      setShowCreate(false);
      setForwarding(""); setProcessing(""); setOther(""); setNote("");
      await loadSettlements();
    } catch (e: any) {
      setCreateResult({ type: "error", msg: e.message });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Monthly Settlement</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>월별 물류비 정산 (포워딩 + 입고/상품화 + 기타)</p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); if (!showCreate) loadDnCandidates(); setCreateResult(null); }}
          style={{ padding: "8px 18px", border: "1.5px solid #111", borderRadius: 8, background: showCreate ? "#111" : "#fff", color: showCreate ? "#fff" : "#111", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {showCreate ? "Cancel" : "+ New Settlement"}
        </button>
      </div>

      {createResult && (
        <div style={{ marginBottom: 16, padding: "8px 14px", borderRadius: 8, fontSize: 12, background: createResult.type === "success" ? "#dcfce7" : "#fef2f2", color: createResult.type === "success" ? "#166534" : "#991b1b" }}>
          {createResult.msg}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 24, background: "#fafafa" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>New Settlement</h3>

          {/* 월 선택 + 비용 입력 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>정산 월 *</label>
              <input type="month" value={month} onChange={e => handleMonthChange(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>포워딩비 (Forwarding)</label>
              <input type="number" value={forwarding} onChange={e => setForwarding(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>입고/상품화비 (Processing)</label>
              <input type="number" value={processing} onChange={e => setProcessing(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>기타비용 (Other)</label>
              <input type="number" value={other} onChange={e => setOther(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          {/* 안분 미리보기 */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <MiniCard label="선택 DN" value={`${selectedDns.size}건`} />
            <MiniCard label="총 PCS" value={selectedQty.toLocaleString()} />
            <MiniCard label="총 비용" value={`₩${totalCost.toLocaleString()}`} />
            <MiniCard label="PCS당 비용" value={`₩${perPcs.toFixed(2)}`} accent />
            <MiniCard label="PCS당 포워딩" value={`₩${selectedQty > 0 ? (fwd / selectedQty).toFixed(2) : "0"}`} />
            <MiniCard label="PCS당 상품화" value={`₩${selectedQty > 0 ? (proc / selectedQty).toFixed(2) : "0"}`} />
            <MiniCard label="PCS당 기타" value={`₩${selectedQty > 0 ? (oth / selectedQty).toFixed(2) : "0"}`} />
          </div>

          {/* DN 후보 테이블 */}
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            미정산 DN ({dnCandidates.length}건)
            <button onClick={toggleAll} style={{ marginLeft: 12, fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              {selectedDns.size === dnCandidates.length ? "전체 해제" : "전체 선택"}
            </button>
          </div>

          {loadingDns ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
          ) : dnCandidates.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>미정산 DN이 없습니다 (모두 정산 완료)</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: "#f3f4f6" }}>
                  <tr>
                    <th style={th}></th>
                    <th style={th}>DN No</th>
                    <th style={th}>Ship To</th>
                    <th style={th}>Confirmed At</th>
                    <th style={{ ...th, textAlign: "right" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {dnCandidates.map(d => (
                    <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0", background: selectedDns.has(d.id) ? "#eff6ff" : undefined }}>
                      <td style={td}><input type="checkbox" checked={selectedDns.has(d.id)} onChange={() => toggleDn(d.id)} /></td>
                      <td style={{ ...td, fontWeight: 600 }}>{d.dn_no}</td>
                      <td style={td}>{d.ship_to || "-"}</td>
                      <td style={td}>{fmtDate(d.confirmed_at) || fmtDate(d.shipped_at) || "-"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{d.qty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>비고 (Note)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="정산 메모" style={inputStyle} />
          </div>

          <button onClick={handleCreate} disabled={creating || selectedDns.size === 0} style={{ marginTop: 14, padding: "10px 24px", border: "none", borderRadius: 8, background: "#111", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: creating || selectedDns.size === 0 ? 0.4 : 1 }}>
            {creating ? "Creating..." : "Create Settlement"}
          </button>
        </div>
      )}

      {/* 정산 목록 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
      ) : settlements.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>정산 내역이 없습니다</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {settlements.map(s => {
            const sc = s.status === "CONFIRMED" ? { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" } : { bg: "#fef9c3", color: "#854d0e", border: "#fde68a" };
            return (
              <Link key={s.id} href={`/monitor/settlement/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#e5e7eb")}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{s.settlement_month}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      DN {s.dn_count}건 / {s.total_qty.toLocaleString()} PCS
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>Total Cost</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>₩{s.total_cost.toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>PCS당</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#2563eb" }}>₩{s.cost_per_pcs.toFixed(2)}</div>
                    </div>
                    <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {s.status}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: accent ? "#eff6ff" : "#fff", minWidth: 100 }}>
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent ? "#2563eb" : "#111" }}>{value}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 };
const th: React.CSSProperties = { padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#374151" };
const td: React.CSSProperties = { padding: "6px 10px" };
