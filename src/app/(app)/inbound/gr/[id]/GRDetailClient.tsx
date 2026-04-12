"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type GRLine = {
  id: string;
  line_no: number;
  sku: string | null;
  qty_expected: number;
  qty_received: number;
};

type GRData = {
  id: string;
  asn_id: string | null;
  asn_no: string | null;
  gr_no: string | null;
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  vendor_name: string | null;
  lines: GRLine[];
};

export default function GRDetailClient({ id }: { id: string }) {
  const [gr, setGr] = useState<GRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/gr/${id}`, { cache: "no-store" });
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load GR detail");
      }

      setGr(json.item ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmGR() {
    if (!confirm("GR을 Confirm 하시겠습니까? 재고가 반영됩니다.")) return;

    try {
      setConfirming(true);
      setError("");

      const res = await fetch(`/api/gr/${id}/confirm`, {
        method: "POST",
      });

      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response: ${text}`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to confirm GR");
      }

      await load();
      alert(json?.already_confirmed ? "이미 Confirm 된 GR입니다." : "GR Confirm 완료");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const summary = useMemo(() => {
    const rows = gr?.lines ?? [];
    const expected = rows.reduce((acc, row) => acc + Number(row.qty_expected || 0), 0);
    const received = rows.reduce((acc, row) => acc + Number(row.qty_received || 0), 0);
    const shortage = Math.max(0, expected - received);
    const over = Math.max(0, received - expected);

    return {
      expected,
      received,
      shortage,
      over,
      result:
        received <= 0
          ? "NOT RECEIVED"
          : received < expected
          ? "PARTIAL"
          : received === expected
          ? "FULL"
          : "OVER",
    };
  }, [gr]);

  function resultLabel(expected: number, received: number) {
    if (received === expected) return "MATCH";
    if (received < expected) return "SHORT";
    return "OVER";
  }

  function resultColor(expected: number, received: number) {
    const label = resultLabel(expected, received);
    if (label === "MATCH") return "#166534";
    if (label === "SHORT") return "#92400e";
    return "#b91c1c";
  }

  function deltaColor(delta: number) {
    if (delta === 0) return "#166534";
    if (delta < 0) return "#92400e";
    return "#b91c1c";
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

  if (!gr) {
    return <div style={{ padding: 20 }}>GR not found</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 8, fontSize: 14, color: "#666" }}>
        <Link href="/inbound/gr">Inbound / GR</Link>
        <span> / </span>
        <span>{gr.gr_no ?? gr.id}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {gr.gr_no ?? "-"}{" "}
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                padding: "4px 8px",
                borderRadius: 8,
                background: gr.status === "CONFIRMED" ? "#dcfce7" : "#fef3c7",
                color: gr.status === "CONFIRMED" ? "#166534" : "#92400e",
                verticalAlign: "middle",
              }}
            >
              {gr.status ?? "-"}
            </span>
          </h2>

          <div style={{ marginTop: 12, lineHeight: 1.8 }}>
            <div>
              <b>ASN:</b>{" "}
              {gr.asn_id ? (
                <Link href={`/inbound/asn/${gr.asn_id}`}>
                  {gr.asn_no ?? gr.asn_id}
                </Link>
              ) : (
                "-"
              )}
            </div>
            <div>
              <b>Vendor:</b> {gr.vendor_name ?? "-"}
            </div>
            <div>
              <b>Created:</b> {fmtDate(gr.created_at) || "-"}
            </div>
            <div>
              <b>Confirmed:</b> {fmtDate(gr.confirmed_at) || "-"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button onClick={load}>Refresh</button>
          <button
            onClick={confirmGR}
            disabled={confirming || gr.status === "CONFIRMED"}
          >
            {gr.status === "CONFIRMED"
              ? "Completed"
              : confirming
              ? "Confirming..."
              : "Confirm GR"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <SummaryCard title="Expected Total" value={summary.expected} />
        <SummaryCard title="Received Total" value={summary.received} />
        <SummaryCard title="Shortage" value={summary.shortage} />
        <SummaryCard title="Over Receipt" value={summary.over} />
        <SummaryCard title="Receipt Result" value={summary.result} />
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #ddd", background: "#fafafa" }}>
          <div style={{ fontWeight: 700 }}>GR Lines</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            CSV 업로드 결과 기준으로 qty_received를 확인하고 Confirm 하면 된다.
          </div>
        </div>

        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Line</th>
              <th style={th}>SKU</th>
              <th style={th}>Expected</th>
              <th style={th}>Received</th>
              <th style={th}>Delta</th>
              <th style={th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {gr.lines.length === 0 ? (
              <tr>
                <td style={td} colSpan={6}>
                  No lines
                </td>
              </tr>
            ) : (
              gr.lines.map((line, idx) => {
                const expected = Number(line.qty_expected || 0);
                const received = Number(line.qty_received || 0);
                const delta = received - expected;

                return (
                  <tr key={line.id}>
                    <td style={td}>{line.line_no || idx + 1}</td>
                    <td style={td}>{line.sku ?? "-"}</td>
                    <td style={td}>{expected}</td>
                    <td style={td}>{received}</td>
                    <td style={{ ...td, color: deltaColor(delta), fontWeight: 600 }}>{delta}</td>
                    <td style={{ ...td, color: resultColor(expected, received), fontWeight: 600 }}>
                      {resultLabel(expected, received)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  textAlign: "left",
  background: "#fff",
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 12,
};