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
  status: string | null;
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

      setPo({
        ...poJson.po,
        lines: poJson.po?.lines ?? [],
      });

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
        <b>Status:</b> {statusLabel}
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Created At:</b> {po.created_at ?? "-"}
      </div>

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