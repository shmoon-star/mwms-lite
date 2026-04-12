"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Inventory = {
  sku: string;
  qty_onhand: number;
  qty_reserved: number;
};

type ReservationDn = {
  dn_id: string;
  dn_no: string | null;
  qty: number;
  status: string | null;
};

export default function InventoryPage() {
  const [rows, setRows] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  // Reserved 클릭 시 표시할 DN 목록
  const [activeSku, setActiveSku] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationDn[]>([]);
  const [resLoading, setResLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/inventory", { cache: "no-store" });
    const json = await res.json();
    setRows(json.rows ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleReservedClick(sku: string) {
    if (activeSku === sku) {
      setActiveSku(null);
      setReservations([]);
      return;
    }
    setActiveSku(sku);
    setResLoading(true);
    try {
      const res = await fetch(`/api/inventory/reservations?sku=${encodeURIComponent(sku)}`, { cache: "no-store" });
      const json = await res.json();
      setReservations(json.reservations ?? []);
    } finally {
      setResLoading(false);
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Inventory</h2>

      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <button onClick={load}>Refresh</button>
        <button onClick={() => window.location.href = "/api/inventory/export"}>
          Download CSV
        </button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>On Hand</th>
            <th style={th}>Reserved</th>
            <th style={th}>Available</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const available = (r.qty_onhand ?? 0) - (r.qty_reserved ?? 0);
            const isActive = activeSku === r.sku;

            return (
              <>
                <tr key={r.sku}>
                  <td style={td}>{r.sku}</td>
                  <td style={td}>{r.qty_onhand}</td>
                  <td style={td}>
                    {r.qty_reserved > 0 ? (
                      <button
                        onClick={() => handleReservedClick(r.sku)}
                        style={{
                          background: isActive ? "#dbeafe" : "#fef9c3",
                          border: "1px solid " + (isActive ? "#93c5fd" : "#fde68a"),
                          borderRadius: 6,
                          padding: "2px 10px",
                          cursor: "pointer",
                          fontWeight: 600,
                          color: isActive ? "#1d4ed8" : "#92400e",
                          fontSize: 13,
                        }}
                        title="클릭하면 예약된 DN 목록 확인"
                      >
                        {r.qty_reserved} 🔍
                      </button>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>0</span>
                    )}
                  </td>
                  <td style={td}><b>{available}</b></td>
                </tr>

                {/* Reserved DN 목록 펼치기 */}
                {isActive && (
                  <tr key={`${r.sku}-res`}>
                    <td colSpan={4} style={{ padding: "0 8px 12px 24px", background: "#f8fafc" }}>
                      {resLoading ? (
                        <div style={{ padding: "8px 0", color: "#6b7280", fontSize: 13 }}>로딩 중...</div>
                      ) : reservations.length === 0 ? (
                        <div style={{ padding: "8px 0", color: "#9ca3af", fontSize: 13 }}>예약된 DN 없음</div>
                      ) : (
                        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 6 }}>
                          <thead>
                            <tr style={{ background: "#f1f5f9" }}>
                              <th style={{ ...th, fontSize: 12, padding: "4px 10px" }}>DN No</th>
                              <th style={{ ...th, fontSize: 12, padding: "4px 10px" }}>Status</th>
                              <th style={{ ...th, fontSize: 12, padding: "4px 10px" }}>Reserved Qty</th>
                              <th style={{ ...th, fontSize: 12, padding: "4px 10px" }}>Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reservations.map((dn) => (
                              <tr key={dn.dn_id}>
                                <td style={{ ...td, fontSize: 12, padding: "4px 10px", fontWeight: 600 }}>
                                  {dn.dn_no ?? dn.dn_id}
                                </td>
                                <td style={{ ...td, fontSize: 12, padding: "4px 10px" }}>
                                  <span style={{
                                    background: "#dbeafe",
                                    color: "#1d4ed8",
                                    border: "1px solid #93c5fd",
                                    borderRadius: 9999,
                                    padding: "1px 8px",
                                    fontSize: 11,
                                  }}>
                                    {dn.status ?? "-"}
                                  </span>
                                </td>
                                <td style={{ ...td, fontSize: 12, padding: "4px 10px" }}>{dn.qty}</td>
                                <td style={{ ...td, fontSize: 12, padding: "4px 10px" }}>
                                  <Link
                                    href={`/outbound/dn/${dn.dn_id}`}
                                    style={{ color: "#2563eb", textDecoration: "underline", fontSize: 12 }}
                                  >
                                    Open DN →
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const th = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5" };
const td = { border: "1px solid #ddd", padding: 8 };
