"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/buyer/po", label: "Purchase Orders" },
  { href: "/buyer/dn", label: "Delivery Notes" },
  { href: "/buyer/shipment", label: "Shipments" },
  { href: "/buyer/monitor", label: "Monitor" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BuyerSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        height: "100vh",
        position: "sticky",
        top: 0,
        borderRight: "1px solid #ddd",
        padding: 16,
        background: "#fff",
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Buyer Portal
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>
        Read-only order visibility
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                textDecoration: "none",
                color: "#111827",
                border: "1px solid #ddd",
                background: active ? "#f3f4f6" : "#fff",
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
