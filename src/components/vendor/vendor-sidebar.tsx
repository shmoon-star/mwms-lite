"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/vendor/packing-lists",
    label: "Packing Lists",
  },
  {
    href: "/vendor/packing-lists/new",
    label: "Create Packing List",
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/vendor/packing-lists") {
    return pathname === href || pathname.startsWith("/vendor/packing-lists/");
  }
  return pathname === href;
}

export default function VendorSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 260,
        minHeight: "100vh",
        borderRight: "1px solid #ddd",
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
        Vendor Portal
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