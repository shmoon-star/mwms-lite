"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DNHeader = {
  id: string;
  dn_no: string | null;
  status: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  qty_total?: number | null;
  buyer_id?: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  shipped_at?: string | null;
};

type Buyer = {
  id: string;
  buyer_code: string;
  buyer_name: string | null;
  country: string | null;
};

const STATUS_META: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:        { label: "Pending",        bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  RESERVED:       { label: "Reserved",       bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  PICKED:         { label: "Picked",         bg: "#e0e7ff", color: "#3730a3", border: "#c7d2fe" },
  PACKED:         { label: "Packed",         bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  PARTIAL_SHIPPED:{ label: "Partial",        bg: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
  SHIPPED:        { label: "Shipped",        bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  CONFIRMED:      { label: "Confirmed",      bg: "#f0fdf4", color: "#14532d", border: "#86efac" },
  CANCELLED:      { label: "Cancelled",      bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = String(status || "").toUpperCase();
  const m = STATUS_META[s] ?? { label: s || "-", bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  return (
    <span style={{
      display: "inline-flex", padding: "2px 10px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  );
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("ko-KR");
}

export default function DNPage() {
  const router = useRouter();

  const [dns, setDns] = useState<DNHeader[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [keyword, setKeyword] = useState("");

  const createFileRef = useRef<HTMLInputElement | null>(null);
  const shipFileRef = useRef<HTMLInputElement | null>(null);

  // Upload card states
  const [createFile, setCreateFile] = useState("");
  const [shipFile, setShipFile] = useState("");
  const [createResult, setCreateResult] = useState<{ type: "success"|"error"; msg: string } | null>(null);
  const [shipResult, setShipResult] = useState<{ type: "success"|"error"; msg: string } | null>(null);

  useEffect(() => {
    load();
    fetch("/api/buyers").then(r => r.json()).then(j => { if (j.ok) setBuyers(j.data ?? []); }).catch(() => {});
  }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/dn", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed");
      setDns(json.dns ?? []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUpload(file: File) {
    try {
      setWorking(true);
      setCreateResult(null);
      const fd = new FormData();
      fd.append("file", file);
      if (buyerId) fd.append("buyer_id", buyerId);

      const res = await fetch("/api/dn/upload", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok || !json?.ok) throw new Error(json?.error || "Upload failed");

      setCreateResult({
        type: "success",
        msg: `완료 — DN ${json.inserted_header_count ?? 0}건 생성, 라인 ${(json.inserted_line_count ?? 0) + (json.updated_line_count ?? 0)}건`,
      });
      setCreateFile("");
      if (createFileRef.current) createFileRef.current.value = "";
      await load();
    } catch (e: any) {
      setCreateResult({ type: "error", msg: e.message });
    } finally {
      setWorking(false);
    }
  }

  async function handleShipUpload(file: File) {
    try {
      setWorking(true);
      setShipResult(null);
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/dn/ship-upload", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok || !json?.ok) throw new Error(json?.error || "Upload failed");

      setShipResult({
        type: "success",
        msg: `완료 — ${json.updated_header_count ?? 0}건 업데이트, 출하 ${json.reserved_count ?? 0}건`,
      });
      setShipFile("");
      if (shipFileRef.current) shipFileRef.current.value = "";
      await load();
    } catch (e: any) {
      setShipResult({ type: "error", msg: e.message });
    } finally {
      setWorking(false);
    }
  }

  async function handleBulkShip() {
    const targets = rows.filter(r => ["PENDING","RESERVED","PICKED","PACKED"].includes(String(r.status || "").toUpperCase()));
    if (targets.length === 0) { alert("출하 가능한 DN이 없습니다."); return; }
    if (!confirm(`${targets.length}건을 일괄 SHIPPED 처리하시겠습니까?`)) return;

    setWorking(true);
    try {
      const res = await fetch("/api/dn/bulk-confirm-ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dn_ids: targets.map(r => r.id) }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed");
      alert(`Bulk Ship 완료 — ${json.shipped_count ?? 0}건`);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWorking(false);
    }
  }

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return dns;
    return dns.filter(r =>
      [r.dn_no, r.ship_from, r.ship_to, r.status].join(" ").toLowerCase().includes(q)
    );
  }, [dns, keyword]);

  return (
    <div style={{ padding: 28 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Outbound / DN</h1>
        <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>DN 생성 업로드 및 출하 처리</p>
      </div>

      {/* Buyer 선택 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, marginBottom: 20, background: "#fafafa" }}>
        <div style={sectionLabel}>Buyer 지정 (DN Create 업로드 시 적용)</div>
        <select
          value={buyerId}
          onChange={e => setBuyerId(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, background: "#fff", minWidth: 260 }}
        >
          <option value="">— Buyer 선택 (없으면 CSV의 buyer_code 컬럼 사용) —</option>
          {buyers.map(b => (
            <option key={b.id} value={b.id}>
              {b.buyer_code}{b.buyer_name ? ` · ${b.buyer_name}` : ""}{b.country ? ` (${b.country})` : ""}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
          * CSV에 buyer_code 컬럼이 있으면 행별 자동 매핑됩니다.
        </div>
      </div>

      {/* 업로드 카드 2열 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* DN Create Upload */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={stepBadge}>1</span>
            <div>
              <div style={cardTitle}>DN Create Upload</div>
              <div style={hintText}>DN No / Ship From / Ship To / SKU / Qty 기준 생성</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 14 }} />

          <div style={{ marginBottom: 14 }}>
            <div style={sectionLabel}>템플릿</div>
            <a href="/api/dn/template" download style={downloadBtn}>⬇ DN Create 템플릿</a>
          </div>

          <div style={sectionLabel}>업로드</div>
          <input ref={createFileRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { setCreateFile(f.name); handleCreateUpload(f); } }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => createFileRef.current?.click()} style={fileSelectBtn}>📎 파일 선택</button>
            <span style={{ fontSize: 13, color: createFile ? "#111" : "#9ca3af", fontStyle: createFile ? "normal" : "italic" }}>
              {createFile || "선택된 파일 없음"}
            </span>
          </div>
          {createResult && (
            <div style={resultBox(createResult.type)}>
              {createResult.type === "success" ? "✅ " : "❌ "}{createResult.msg}
            </div>
          )}
        </div>

        {/* DN Ship Upload */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={stepBadge}>2</span>
            <div>
              <div style={cardTitle}>DN Ship Bulk Upload</div>
              <div style={hintText}>Actual GI / Qty to Ship / Carrier / Tracking 기준 일괄 출하</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: 14 }} />

          <div style={{ marginBottom: 14 }}>
            <div style={sectionLabel}>템플릿</div>
            <a href="/api/dn/template-ship" download style={downloadBtn}>⬇ DN Ship 템플릿</a>
          </div>

          <div style={sectionLabel}>업로드</div>
          <input ref={shipFileRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { setShipFile(f.name); handleShipUpload(f); } }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => shipFileRef.current?.click()} style={fileSelectBtn}>📎 파일 선택</button>
            <span style={{ fontSize: 13, color: shipFile ? "#111" : "#9ca3af", fontStyle: shipFile ? "normal" : "italic" }}>
              {shipFile || "선택된 파일 없음"}
            </span>
          </div>
          {shipResult && (
            <div style={resultBox(shipResult.type)}>
              {shipResult.type === "success" ? "✅ " : "❌ "}{shipResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* 액션 바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="Search DN No / Ship From / Ship To / Status..."
          style={{ padding: "9px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, width: 300, outline: "none" }}
        />
        <div style={{ flex: 1 }} />
        <button onClick={load} disabled={working || loading} style={outlineBtn}>Refresh</button>
        <a href="/api/dn/export" style={{ ...outlineBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          ⬇ Export CSV
        </a>
        <button onClick={handleBulkShip} disabled={working || loading}
          style={{ ...outlineBtn, background: "#111", color: "#fff", border: "none" }}>
          Bulk Ship
        </button>
      </div>

      {/* DN 목록 테이블 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              <th style={th}>DN No</th>
              <th style={th}>Ship From</th>
              <th style={th}>Ship To</th>
              <th style={th}>Qty</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Shipped</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No DN records</td></tr>
            ) : rows.map(row => {
              const s = String(row.status || "").toUpperCase();
              const canShip = ["PENDING","RESERVED","PICKED","PACKED"].includes(s);
              return (
                <tr key={row.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={td}><span style={{ fontWeight: 600 }}>{row.dn_no ?? "-"}</span></td>
                  <td style={td}>{row.ship_from ?? "-"}</td>
                  <td style={td}>{row.ship_to ?? "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{row.qty_total ?? 0}</td>
                  <td style={td}><StatusBadge status={row.status} /></td>
                  <td style={td}>{fmtDate(row.created_at)}</td>
                  <td style={td}>{fmtDate(row.shipped_at)}</td>
                  <td style={{ ...td, display: "flex", gap: 6 }}>
                    <button onClick={() => router.push(`/outbound/dn/${row.id}`)} style={actionBtn}>
                      Open
                    </button>
                    {canShip && (
                      <button
                        onClick={async () => {
                          if (!confirm(`DN ${row.dn_no} 을 출하 처리하시겠습니까?`)) return;
                          setWorking(true);
                          try {
                            const res = await fetch(`/api/dn/${row.id}/ship`, { method: "POST" });
                            const json = await res.json();
                            if (!json?.ok) throw new Error(json?.error || "Failed");
                            await load();
                          } catch (e: any) { alert(e.message); }
                          finally { setWorking(false); }
                        }}
                        disabled={working}
                        style={{ ...actionBtn, background: "#111", color: "#fff", border: "none" }}
                      >
                        Ship
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── styles ── */
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: "0.05em",
};
const card: React.CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, background: "#fff",
};
const stepBadge: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 26, height: 26, borderRadius: 999, background: "#111", color: "#fff",
  fontSize: 13, fontWeight: 700, flexShrink: 0,
};
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#111" };
const hintText: React.CSSProperties = { fontSize: 12, color: "#888", marginTop: 2 };
const downloadBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", border: "1px solid #d1d5db", borderRadius: 6,
  background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500,
  textDecoration: "none", cursor: "pointer",
};
const fileSelectBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "7px 14px", border: "1.5px solid #6b7280", borderRadius: 6,
  background: "#fff", color: "#111827", fontSize: 13, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
};
const outlineBtn: React.CSSProperties = {
  padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 8,
  background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const actionBtn: React.CSSProperties = {
  padding: "5px 12px", border: "1px solid #d1d5db", borderRadius: 6,
  background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer",
};
const th: React.CSSProperties = {
  padding: "12px 14px", textAlign: "left", fontWeight: 600, fontSize: 13, color: "#374151",
};
const td: React.CSSProperties = { padding: "11px 14px", verticalAlign: "middle" };
function resultBox(type: "success" | "error"): React.CSSProperties {
  return {
    marginTop: 8, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: type === "success" ? "#f0fdf4" : "#fef2f2",
    color: type === "success" ? "#166534" : "#991b1b",
    border: `1px solid ${type === "success" ? "#bbf7d0" : "#fecaca"}`,
  };
}
