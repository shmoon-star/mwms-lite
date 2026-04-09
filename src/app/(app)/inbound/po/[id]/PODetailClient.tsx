"use client";

import { useEffect, useMemo, useState } from "react";

type POLine = {
  id: string;
  po_id: string;
  sku: string;
  qty: number;
  qty_ordered: number | null;
  created_at: string | null;
};

type POData = {
  id: string;
  po_no: string | null;
  vendor: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
  lines: POLine[];
};

type AsnLookup = {
  id: string;
  asn_no: string | null;
  status: string | null;
};

export default function PODetailClient({ id }: { id: string }) {
  const [po, setPo] = useState<POData | null>(null);
  const [existingAsn, setExistingAsn] = useState<AsnLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  // ETA 수정 상태
  const [etaEditing, setEtaEditing] = useState(false);
  const [etaInput, setEtaInput] = useState("");
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaResult, setEtaResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [poRes, asnRes] = await Promise.all([
        fetch(`/api/po/${id}`, { cache: "no-store" }),
        fetch(`/api/asn/by-po/${id}`, { cache: "no-store" }),
      ]);

      const poText = await poRes.text();
      const asnText = await asnRes.text();

      let poJson: any;
      let asnJson: any;

      try {
        poJson = JSON.parse(poText);
      } catch {
        throw new Error(`Invalid PO JSON response: ${poText}`);
      }

      try {
        asnJson = JSON.parse(asnText);
      } catch {
        throw new Error(`Invalid ASN JSON response: ${asnText}`);
      }

      if (!poRes.ok || !poJson?.ok) {
        throw new Error(poJson?.error || "Failed to load PO detail");
      }

      const poData = { ...poJson.po, lines: poJson.po?.lines ?? [] };
      setPo(poData);
      // ETA 초기값 세팅
      setEtaInput(poData.eta ?? "");

      if (asnRes.ok && asnJson?.ok && asnJson?.asn) {
        setExistingAsn(asnJson.asn);
      } else {
        setExistingAsn(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const statusLabel = useMemo(() => {
    const s = po?.status ?? "";
    if (s === "DRAFT") return "Draft";
    if (s === "ASN_CREATED") return "ASN Created";
    if (s === "RECEIVED") return "Received";
    return s || "-";
  }, [po?.status]);

  async function handleCreateOrOpenASN() {
    try {
      if (!po) return;

      if (po.status === "RECEIVED") {
        alert("이미 입고 완료된 PO입니다.");
        return;
      }

      if (existingAsn?.id) {
        window.location.href = `/inbound/asn/${existingAsn.id}`;
        return;
      }

      setWorking(true);

      const res = await fetch(`/api/asn/from-po/${id}`, {
        method: "POST",
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      // 새로 생성 성공
      if (res.ok && json?.ok && json?.asn?.id) {
        await load();
        window.location.href = `/inbound/asn/${json.asn.id}`;
        return;
      }

      // 이미 ASN 있음
      if (res.status === 409 && json?.existing_asn_id) {
        await load();
        alert("이미 ASN이 있어 해당 ASN으로 이동합니다.");
        window.location.href = `/inbound/asn/${json.existing_asn_id}`;
        return;
      }

      throw new Error(json?.error || "Failed to create ASN");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create ASN");
    } finally {
      setWorking(false);
    }
  }

  async function handleEtaSave() {
    if (!po || !etaInput) return;

    setEtaSaving(true);
    setEtaResult(null);

    try {
      const res = await fetch(`/api/po/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eta: etaInput }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.ok === false) {
        setEtaResult({ type: "error", message: json?.error ?? "수정 실패" });
        return;
      }

      setPo((prev) => prev ? { ...prev, eta: json.new_eta } : prev);
      setEtaEditing(false);
      setEtaResult({
        type: "success",
        message: `ETA 변경 완료: ${json.old_eta ?? "-"} → ${json.new_eta}${po.vendor_id ? " (벤더 이메일 발송됨)" : ""}`,
      });
    } catch (e: unknown) {
      setEtaResult({ type: "error", message: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setEtaSaving(false);
    }
  }

  function renderEtaSection() {
    if (!po) return null;

    return (
      <div style={etaBox}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span style={etaLabel}>ETA (납기예정일)</span>
            {!etaEditing && (
              <span style={etaValue}>{po.eta ?? "미설정"}</span>
            )}
          </div>

          {!etaEditing ? (
            <button
              type="button"
              onClick={() => {
                setEtaInput(po.eta ?? "");
                setEtaEditing(true);
                setEtaResult(null);
              }}
              style={editBtn}
            >
              ✏️ ETA 수정
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input
                type="date"
                value={etaInput}
                onChange={(e) => setEtaInput(e.target.value)}
                style={dateInput}
              />
              <button
                type="button"
                onClick={handleEtaSave}
                disabled={etaSaving || !etaInput}
                style={{
                  ...saveBtn,
                  opacity: etaSaving || !etaInput ? 0.4 : 1,
                  cursor: etaSaving || !etaInput ? "not-allowed" : "pointer",
                }}
              >
                {etaSaving ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEtaEditing(false);
                  setEtaResult(null);
                  setEtaInput(po.eta ?? "");
                }}
                style={cancelBtn}
              >
                취소
              </button>
            </div>
          )}
        </div>

        {etaEditing && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>
            저장 시 벤더에게 ETA 변경 이메일이 자동으로 발송됩니다.
          </div>
        )}

        {etaResult && (
          <div style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 13,
            background: etaResult.type === "success" ? "#f0fdf4" : "#fef2f2",
            color: etaResult.type === "success" ? "#166534" : "#991b1b",
            border: `1px solid ${etaResult.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {etaResult.type === "success" ? "✅ " : "❌ "}{etaResult.message}
          </div>
        )}
      </div>
    );
  }

  function renderActionArea() {
    if (!po) return null;

    if (po.status === "RECEIVED") {
      return (
        <div style={{ marginBottom: 16 }}>
          <button disabled>Received Complete</button>
          <span style={{ marginLeft: 8, color: "#666" }}>
            이 PO는 입고 완료되었습니다.
          </span>
        </div>
      );
    }

    if (po.status === "ASN_CREATED" && existingAsn?.id) {
      return (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCreateOrOpenASN} disabled={working}>
            {working ? "Working..." : "Open ASN"}
          </button>
          <span style={{ marginLeft: 8, color: "#666" }}>
            생성된 ASN: {existingAsn.asn_no ?? existingAsn.id}
          </span>
        </div>
      );
    }

    if (po.status === "DRAFT") {
      return (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCreateOrOpenASN} disabled={working}>
            {working ? "Creating ASN..." : "Create ASN"}
          </button>
          {existingAsn?.id ? (
            <span style={{ marginLeft: 8, color: "#666" }}>
              기존 ASN 발견: {existingAsn.asn_no ?? existingAsn.id}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleCreateOrOpenASN} disabled={working}>
          {working
            ? "Working..."
            : existingAsn?.id
            ? "Open ASN"
            : "Create ASN"}
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        Error: {error}
      </div>
    );
  }

  if (!po) {
    return <div style={{ padding: 20 }}>PO not found</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>PO Detail</h2>

      <div style={{ marginBottom: 4 }}>
        <b>PO ID:</b> {po.id}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>PO No:</b> {po.po_no ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Vendor:</b> {po.vendor ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Vendor:</b> {po.vendor_name ?? po.vendor ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Status:</b> {statusLabel}
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Created At:</b> {po.created_at ?? "-"}
      </div>

      {renderEtaSection()}

      {renderActionArea()}

      <div style={{ marginBottom: 8 }}>
        <b>Lines</b>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>Qty</th>
            <th style={th}>Qty Ordered</th>
            <th style={th}>Created At</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((line) => (
            <tr key={line.id}>
              <td style={td}>{line.sku}</td>
              <td style={td}>{line.qty}</td>
              <td style={td}>{line.qty_ordered ?? 0}</td>
              <td style={td}>{line.created_at ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const etaBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "14px 16px",
  marginBottom: 20,
  background: "#fff",
};

const etaLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  display: "block",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const etaValue: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "#111",
};

const editBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#374151",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const dateInput: React.CSSProperties = {
  padding: "7px 10px",
  border: "1.5px solid #6b7280",
  borderRadius: 6,
  fontSize: 14,
  color: "#111",
};

const saveBtn: React.CSSProperties = {
  padding: "7px 16px",
  border: "none",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
};

const cancelBtn: React.CSSProperties = {
  padding: "7px 14px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#6b7280",
  fontSize: 13,
  cursor: "pointer",
};

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  textAlign: "left",
  background: "#f5f5f5",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
};