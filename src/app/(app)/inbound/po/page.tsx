import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type POHeaderRow = {
  id: string;
  po_no: string | null;
  vendor_id: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
};

type ASNHeaderRow = {
  id: string;
  po_id: string | null;
  asn_no: string | null;
  source_type: string | null;
  created_at?: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type POListItem = {
  id: string;
  po_no: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
  vendor_name: string | null;
  vendor_code: string | null;
  total_qty: number;
  asns: {
    id: string;
    asn_no: string | null;
    source_type: string | null;
  }[];
};

export default async function POListPage() {
  const sb = await createClient();

  const { data: poRows, error: poError } = await sb
    .from("po_header")
    .select("id, po_no, vendor_id, status, eta, created_at")
    .order("created_at", { ascending: false });

  if (poError) {
    return <div style={{ padding: 20 }}>Error: {poError.message}</div>;
  }

  const poIds = Array.from(
    new Set((poRows || []).map((r: any) => r.id).filter(Boolean))
  );

  const vendorIds = Array.from(
    new Set((poRows || []).map((r: any) => r.vendor_id).filter(Boolean))
  );

  let vendorMap = new Map<string, VendorRow>();
  if (vendorIds.length > 0) {
    const { data: vendorRows, error: vendorError } = await sb
      .from("vendor")
      .select("id, vendor_code, vendor_name")
      .in("id", vendorIds);

    if (vendorError) {
      return <div style={{ padding: 20 }}>Error: {vendorError.message}</div>;
    }

    vendorMap = new Map(
      ((vendorRows || []) as VendorRow[]).map((row) => [row.id, row])
    );
  }

  let qtyMap = new Map<string, number>();
  if (poIds.length > 0) {
const { data: poLineRows, error: poLineError } = await sb
  .from("po_line")
  .select("po_id, qty, qty_ordered")
  .in("po_id", poIds);

    if (poLineError) {
      return <div style={{ padding: 20 }}>Error: {poLineError.message}</div>;
    }

qtyMap = (poLineRows || []).reduce((map, row: any) => {
  const key = String(row.po_id || "");
  if (!key) return map;

  const prev = map.get(key) || 0;
  const qty = Number(row.qty_ordered ?? row.qty ?? 0);
  map.set(key, prev + (Number.isFinite(qty) ? qty : 0));
  return map;
}, new Map<string, number>());
  }

  let asnMap = new Map<
    string,
    {
      id: string;
      asn_no: string | null;
      source_type: string | null;
    }[]
  >();

  if (poIds.length > 0) {
    const { data: asnRows, error: asnError } = await sb
      .from("asn_header")
      .select("id, po_id, asn_no, source_type, created_at")
      .in("po_id", poIds)
      .order("created_at", { ascending: false });

    if (asnError) {
      return <div style={{ padding: 20 }}>Error: {asnError.message}</div>;
    }

    asnMap = (asnRows || []).reduce((map, row: ASNHeaderRow) => {
      if (!row.po_id) return map;

      const prev = map.get(row.po_id) || [];
      prev.push({
        id: row.id,
        asn_no: row.asn_no,
        source_type: row.source_type,
      });

      map.set(row.po_id, prev);
      return map;
    }, new Map<string, { id: string; asn_no: string | null; source_type: string | null }[]>());
  }

  const rows: POListItem[] = (poRows || []).map((row: POHeaderRow) => {
    const vendor = row.vendor_id ? vendorMap.get(row.vendor_id) : null;

    return {
      id: row.id,
      po_no: row.po_no,
      status: row.status,
      eta: row.eta,
      created_at: row.created_at,
      vendor_name: vendor?.vendor_name ?? null,
      vendor_code: vendor?.vendor_code ?? null,
      total_qty: qtyMap.get(row.id) || 0,
      asns: asnMap.get(row.id) || [],
    };
  });

  const csvRows = rows.map((row) => ({
    po_no: row.po_no ?? "",
    vendor_code: row.vendor_code ?? "",
    vendor_name: row.vendor_name ?? "",
    eta: row.eta ?? "",
    total_qty: row.total_qty,
    status: row.status ?? "",
    created_at: row.created_at ?? "",
    asn_count: row.asns.length,
    asn_nos: row.asns.map((a) => a.asn_no ?? "").join(" | "),
    asn_source_types: row.asns
      .map((a) => normalizeSourceLabel(a.source_type))
      .join(" | "),
  }));

  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    toCsv(csvRows)
  )}`;

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
          background: "#fafafa",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          PO Upload / Template
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={card}>
            <div style={cardTitle}>PO Header CSV</div>
            <div style={hint}>Header 업로드 먼저 진행</div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              <a href="/api/po/template-header" style={button}>
                Download Header Template
              </a>
            </div>

            <form
              action="/api/po/upload-header"
              method="post"
              encType="multipart/form-data"
              style={{ marginTop: 12 }}
            >
              <input type="file" name="file" accept=".csv" required />
              <button type="submit" style={{ ...button, marginLeft: 8 }}>
                Upload Header CSV
              </button>
            </form>
          </div>

          <div style={card}>
            <div style={cardTitle}>PO Line CSV</div>
            <div style={hint}>Header 생성 후 Line 업로드 진행</div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              <a href="/api/po/template-lines" style={button}>
                Download Line Template
              </a>
            </div>

            <form
              action="/api/po/lines/upload"
              method="post"
              encType="multipart/form-data"
              style={{ marginTop: 12 }}
            >
              <input type="file" name="file" accept=".csv" required />
              <button type="submit" style={{ ...button, marginLeft: 8 }}>
                Upload Line CSV
              </button>
            </form>
          </div>
        </div>

        <div style={hint}>
          순서: Header CSV 업로드 → Line CSV 업로드 → PO 상세 확인
        </div>
      </div>

      <div
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Inbound / PO</h2>
          <div style={{ color: "#666", marginTop: 6 }}>
            PO 목록과 연결된 ASN 현황
          </div>
        </div>

        <a
          href={csvHref}
          download="po_list_with_asn.csv"
          style={button}
        >
          Download CSV
        </a>
      </div>

      {!rows || rows.length === 0 ? (
        <div style={{ color: "#666" }}>No PO found</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>PO No</th>
              <th style={th}>Vendor</th>
              <th style={th}>ETA</th>
              <th style={th}>Qty</th>
              <th style={th}>Status</th>
              <th style={th}>Created At</th>
              <th style={th}>ASN</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={td}>{row.po_no ?? "-"}</td>
                <td style={td}>
                  {row.vendor_name
                    ? `${row.vendor_name}${row.vendor_code ? ` (${row.vendor_code})` : ""}`
                    : "-"}
                </td>
                <td style={td}>{row.eta ?? "-"}</td>
                <td style={td}>{row.total_qty}</td>
                <td style={td}>{row.status ?? "-"}</td>
                <td style={td}>{formatDateTime(row.created_at)}</td>
                <td style={td}>
                  {row.asns.length === 0 ? (
                    <span style={emptyText}>-</span>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {row.asns.map((asn) => (
                        <div
                          key={asn.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <Link href={`/inbound/asn/${asn.id}`} style={asnLink}>
                            {asn.asn_no ?? "-"}
                          </Link>
                          <span
                            style={
                              asn.source_type === "PACKING_LIST"
                                ? badgePL
                                : badgeManual
                            }
                          >
                            {normalizeSourceLabel(asn.source_type)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td style={td}>
                  <Link href={`/inbound/po/${row.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function normalizeSourceLabel(sourceType: string | null) {
  if (sourceType === "PACKING_LIST") return "PL";
  if (sourceType === "MANUAL") return "MANUAL";
  return sourceType ?? "-";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return value;
  }
}

function escapeCsvValue(value: unknown) {
  const str = String(value ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(",")
    ),
  ];

  return lines.join("\n");
}

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  background: "#f5f5f5",
  textAlign: "left",
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 8,
  verticalAlign: "top",
};

const emptyText: React.CSSProperties = {
  color: "#999",
};

const asnLink: React.CSSProperties = {
  color: "#111827",
  textDecoration: "none",
  fontWeight: 500,
};

const badgeBase: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  lineHeight: 1.6,
  border: "1px solid transparent",
};

const badgePL: React.CSSProperties = {
  ...badgeBase,
  background: "#eef2ff",
  color: "#4338ca",
  borderColor: "#c7d2fe",
};

const badgeManual: React.CSSProperties = {
  ...badgeBase,
  background: "#f3f4f6",
  color: "#111827",
  borderColor: "#d1d5db",
};

const button: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#111827",
  textDecoration: "none",
  fontSize: 14,
  cursor: "pointer",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fff",
};

const cardTitle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 6,
};

const hint: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
};