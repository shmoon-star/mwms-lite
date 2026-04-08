"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  { href: "/wms/asn", label: "Open ASN" },
  { href: "/wms/dn", label: "Open DN" },
  { href: "/wms/shipment", label: "Open Shipment" },
  { href: "/wms/monitor", label: "Monitor" },
];

export default function WmsSidebar() {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
      <div>
        <div className="text-2xl font-semibold">WMS Console</div>
        <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
          Execution Menu
        </div>
      </div>

      <nav className="space-y-2">
        {menus.map((menu) => {
          const active =
            pathname === menu.href || pathname.startsWith(`${menu.href}/`);

          return (
            <Link
              key={menu.href}
              href={menu.href}
              className={[
                "block rounded-lg border px-4 py-3 text-sm",
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-900 hover:bg-gray-50",
              ].join(" ")}
            >
              {menu.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}