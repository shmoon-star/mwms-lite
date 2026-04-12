"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { href: "/wms/asn", label: "Open ASN" },
  { href: "/wms/dn", label: "Open DN" },
  { href: "/wms/shipment", label: "Open Shipment" },
  { href: "/wms/monitor", label: "Monitor" },
  { href: "/wms/dashboard", label: "Upcoming" },
];

export default function WmsSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        height: "100vh",
        position: "sticky",
        top: 0,
        padding: 16,
        borderRight: "1px solid #e5e7eb",
        background: "#fff",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>WMS Console</div>
        <div style={{ marginTop: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>
          Execution Menu
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {menus.map((menu) => {
          const active =
            pathname === menu.href || pathname.startsWith(`${menu.href}/`);

          return (
            <Link
              key={menu.href}
              href={menu.href}
              style={{
                display: "block",
                borderRadius: 8,
                border: active ? "1px solid #000" : "1px solid #e5e7eb",
                padding: "10px 16px",
                fontSize: 14,
                textDecoration: "none",
                background: active ? "#000" : "#fff",
                color: active ? "#fff" : "#111827",
                fontWeight: active ? 600 : 400,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "#fff"; }}
            >
              {menu.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
