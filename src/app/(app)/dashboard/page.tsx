"use client";

import UpcomingRadar from "@/components/UpcomingRadar";

export default function DashboardPage() {
  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>SCM / Dashboard</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          PO ETA · DN GI/Delivery · Shipment ETA/ETD 일정을 날짜별로 확인합니다.
        </p>
      </div>

      <UpcomingRadar />
    </div>
  );
}
