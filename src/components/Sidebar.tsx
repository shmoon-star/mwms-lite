"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    label: "Master",
    items: [
      { href: "/master/products", label: "Products" },
    ],
  },
  {
    label: "Inbound",
    items: [
      { href: "/inbound/po", label: "PO" },
      { href: "/inbound/asn", label: "ASN" },
      { href: "/inbound/asn-v2", label: "ASN v2" },
      { href: "/inbound/gr", label: "GR" },
    ],
  },
  {
    label: "Outbound",
    items: [
      { href: "/outbound/dn", label: "DN" },
      { href: "/scm/shipment", label: "Shipment" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Stock" },
      { href: "/inventory/ledger", label: "Ledger" },
      { href: "/inventory/adjustment", label: "Adjustment" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { href: "/monitor", label: "Monitor" },
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
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="w-56 min-h-screen border-r bg-white flex flex-col" style={{ width: 220 }}>
      <div style={{ padding: "16px 16px 8px", fontSize: 15, fontWeight: 700, color: "#111" }}>
        SCM System
      </div>

      {/* 메인 메뉴 */}
      <nav style={{ flex: 1, padding: "4px 8px" }}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#9ca3af",
              textTransform: "uppercase", letterSpacing: "0.07em",
              padding: "6px 8px 3px",
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
                    display: "block",
                    padding: "7px 10px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? "#111" : "#374151",
                    background: active ? "#f3f4f6" : "transparent",
                    textDecoration: "none",
                    marginBottom: 1,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 포탈 바로가기 */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 8px 16px" }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#9ca3af",
          textTransform: "uppercase", letterSpacing: "0.07em",
          padding: "4px 8px 6px",
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
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: "#374151",
              textDecoration: "none",
              marginBottom: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
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
