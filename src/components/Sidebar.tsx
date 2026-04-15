"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    label: "Master",
    items: [
      { href: "/master/products", label: "Products", sub: "" },
    ],
  },
  {
    label: "Inbound",
    items: [
      { href: "/inbound/po", label: "PO", sub: "" },
      { href: "/inbound/asn", label: "ASN", sub: "for Upload" },
      { href: "/inbound/asn-v2", label: "ASN v2", sub: "from Vendor PL" },
      { href: "/inbound/gr", label: "GR", sub: "from WMS" },
    ],
  },
  {
    label: "Outbound",
    items: [
      { href: "/outbound/dn", label: "DN", sub: "" },
      { href: "/scm/shipment", label: "Shipment", sub: "" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Stock", sub: "" },
      { href: "/inventory/ledger", label: "Ledger", sub: "" },
      { href: "/inventory/adjustment", label: "Adjustment", sub: "" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { href: "/monitor", label: "Monitor", sub: "" },
      { href: "/monitor/analytics", label: "Analytics", sub: "성과 시각화" },
      { href: "/monitor/buyer-trend", label: "Buyer Trend", sub: "바이어별 입출고" },
      { href: "/monitor/settlement", label: "Settlement", sub: "월정산" },
      { href: "/monitor/history", label: "History", sub: "과거 데이터 통계" },
      { href: "/monitor/export-dashboard", label: "Export Dashboard", sub: "수출 원장 (Google Sheets 연동)" },
      { href: "/dashboard", label: "Upcoming", sub: "60일 일정 한눈에" },
    ],
  },
  {
    label: "Extra",
    items: [
      { href: "/analytics/wms-dashboard", label: "WMS Daily", sub: "입출고 대시보드" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users", sub: "" },
    ],
  },
];

const externalLinks = [
  { href: "/vendor/packing-lists", label: "Vendor Portal", icon: "📦" },
  { href: "/buyer/po", label: "Buyer Portal", icon: "🛒" },
  { href: "/wms/asn", label: "WMS", icon: "🏭" },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    // /monitor와 /monitor/analytics가 동시에 활성화되지 않도록
    // 더 구체적인 경로가 있으면 정확히 매칭된 것만 활성화
    const allHrefs = groups.flatMap(g => g.items.map(i => i.href));
    const exactMatch = allHrefs.some(h => h !== href && h.startsWith(href + "/") && pathname.startsWith(h));
    if (exactMatch) return false;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="w-56 border-r flex flex-col" style={{ width: 220, minWidth: 220, height: "100vh", position: "sticky", top: 0, background: "#f9fafb", overflowY: "auto" }}>
      {/* 로고 */}
      <div style={{ padding: "18px 16px 10px", fontSize: 15, fontWeight: 800, color: "#111", letterSpacing: "-0.3px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        SCM System
      </div>

      {/* 메인 메뉴 */}
      <nav style={{ flex: 1, padding: "8px 8px" }}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 2 }}>
            {/* 그룹 레이블 — 진하게, 배경 강조 */}
            <div style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "10px 10px 4px",
            }}>
              {group.label}
            </div>

            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "6px 10px 6px 18px",
                    borderRadius: 7,
                    textDecoration: "none",
                    marginBottom: 1,
                    borderLeft: active ? "3px solid #111827" : "3px solid transparent",
                    background: active ? "#e5e7eb" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f0f0f0"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#111827" : "#374151",
                    lineHeight: 1.3,
                  }}>
                    {item.label}
                  </span>
                  {item.sub && (
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 400,
                      color: active ? "#6b7280" : "#9ca3af",
                      lineHeight: 1.3,
                      marginTop: 1,
                    }}>
                      {item.sub}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 포탈 바로가기 */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 8px 16px", background: "#f9fafb" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "4px 10px 6px",
        }}>
          Portals
        </div>
        {externalLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 10px 7px 18px",
              borderRadius: 7,
              fontSize: 13.5,
              fontWeight: 500,
              color: "#4b5563",
              textDecoration: "none",
              marginBottom: 1,
              borderLeft: "3px solid transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f0f0f0")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>↗</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
