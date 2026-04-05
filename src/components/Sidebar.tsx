import Link from "next/link";

const items = [
  { href: "/master/products", label: "Master / Products" },
  { href: "/inbound/po", label: "Inbound / PO" },
  { href: "/inbound/asn", label: "Inbound / ASN" },
  { href: "/inbound/asn-v2", label: "Inbound / ASN v2" },
  { href: "/inbound/gr", label: "Inbound / GR" },
  { href: "/outbound/dn", label: "Outbound / DN" },
  { href: "/inventory", label: "Inventory" },
  { href: "/inventory/ledger", label: "Inventory Ledger" },
  { href: "/monitor", label: "Monitor" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen border-r bg-white p-4">
      <div className="mb-4 text-lg font-semibold">SCM System</div>
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded px-3 py-2 text-sm hover:bg-gray-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}