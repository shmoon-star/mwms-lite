"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type ASNLine = {
  id: string;
  asn_id: string;
  po_line_id: string | null;
  sku: string;
  qty_expected: number;
  created_at: string | null;
};

type ASNData = {
  id: string;
  po_id: string | null;
  asn_no: string | null;
  status: string | null;
  created_at: string | null;
  lines: ASNLine[];
};

type GrLookup = {
  id: string;
  gr_no: string | null;
  status: string | null;
};

export default function ASNDetailClient({ id }: { id: string }) {
  const [asn, setAsn] = useState<ASNData | null>(null);
  const [existingGr, setExistingGr] = useState<GrLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [asnRes, grRes] = await Promise.all([
        fetch(`/api/asn/${id}`, { cache: "no-store" }),
        fetch(`/api/gr/by-asn/${id}`, { cache: "no-store" }),
      ]);

      const asnText = await asnRes.text();
      const grText = await grRes.text();

      let asnJson: any;
      let grJson: any;

      try {
        asnJson = JSON.parse(asnText);
      } catch {
        throw new Error(`Invalid ASN JSON response: ${asnText}`);
      }

      try {
        grJson = JSON.parse(grText);
      } catch {
        throw new Error(`Invalid GR JSON response: ${grText}`);
      }

      if (!asnRes.ok || !asnJson?.ok) {
        throw new Error(asnJson?.error || "Failed to load ASN detail");
      }

      setAsn({
        ...asnJson.asn,
        lines: asnJson.asn?.lines ?? [],
      });

      if (grRes.ok && grJson?.ok && grJson?.gr) {
        setExistingGr(grJson.gr);
      } else {
        setExistingGr(null);
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
    const s = asn?.status ?? "";
    if (s === "CREATED") return "Created";
    if (s === "GR_CREATED") return "GR Created";
    if (s === "CONFIRMED") return "Confirmed";
    return s || "-";
  }, [asn?.status]);

  async function handleCreateOrOpenGR() {
    try {
      if (!asn) return;

      if (asn.status === "CONFIRMED") {
        alert("이미 완료된 ASN입니다.");
        return;
      }

      if (existingGr?.id) {
        window.location.href = `/inbound/gr/${existingGr.id}`;
        return;
      }

      setWorking(true);

      const res = await fetch(`/api/gr/from-asn/${id}`, {
        method: "POST",
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (res.ok && json?.ok && json?.gr?.id) {
        await load();
        window.location.href = `/inbound/gr/${json.gr.id}`;
        return;
      }

      if (res.status === 409 && json?.existing_gr_id) {
        await load();
        alert("이미 GR이 있어 해당 GR로 이동합니다.");
        window.location.href = `/inbound/gr/${json.existing_gr_id}`;
        return;
      }

      throw new Error(json?.error || "Failed to create GR");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create GR");
    } finally {
      setWorking(false);
    }
  }

  function renderActionArea() {
    if (!asn) return null;

    if (asn.status === "CONFIRMED") {
      return (
        <div style={{ marginBottom: 16 }}>
          <button disabled>Completed</button>
          <span style={{ marginLeft: 8, color: "#666" }}>
            이 ASN은 처리 완료되었습니다.
          </span>
        </div>
      );
    }

    if (asn.status === "GR_CREATED" && existingGr?.id) {
      return (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCreateOrOpenGR} disabled={working}>
            {working ? "Working..." : "Open GR"}
          </button>
          <span style={{ marginLeft: 8, color: "#666" }}>
            생성된 GR: {existingGr.gr_no ?? existingGr.id}
          </span>
        </div>
      );
    }

    if (asn.status === "CREATED") {
      return (
        <div style={{ marginBottom: 16 }}>
          <button onClick={handleCreateOrOpenGR} disabled={working}>
            {working ? "Creating GR..." : "Create GR"}
          </button>
          {existingGr?.id ? (
            <span style={{ marginLeft: 8, color: "#666" }}>
              기존 GR 발견: {existingGr.gr_no ?? existingGr.id}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleCreateOrOpenGR} disabled={working}>
          {working ? "Working..." : existingGr?.id ? "Open GR" : "Create GR"}
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

  if (!asn) {
    return <div style={{ padding: 20 }}>ASN not found</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>ASN Detail</h2>

      <div style={{ marginBottom: 4 }}>
        <b>ASN ID:</b> {asn.id}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>ASN No:</b> {asn.asn_no ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>PO ID:</b> {asn.po_id ?? "-"}
      </div>
      <div style={{ marginBottom: 4 }}>
        <b>Status:</b> {statusLabel}
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Created At:</b> {fmtDate(asn.created_at) || "-"}
      </div>

      {renderActionArea()}

      <div style={{ marginBottom: 8 }}>
        <b>Lines</b>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>Qty Expected</th>
            <th style={th}>Created At</th>
          </tr>
        </thead>
        <tbody>
          {asn.lines.map((line) => (
            <tr key={line.id}>
              <td style={td}>{line.sku}</td>
              <td style={td}>{line.qty_expected}</td>
              <td style={td}>{fmtDate(line.created_at) || "-"}</td>
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