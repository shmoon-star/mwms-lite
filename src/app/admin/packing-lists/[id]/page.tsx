import { headers } from "next/headers";
import AdminPackingListActions from "./status-actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function getDetail(id: string) {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

  const res = await fetch(`${protocol}://${host}/api/admin/packing-lists/${id}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Failed to load detail");
  }

  return json;
}

export default async function AdminPackingListDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getDetail(id);

  const { header, lines, attachments } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Packing List Review Detail</h1>
        <AdminPackingListActions
          packingListId={header.id}
          status={header.status}
        />
      </div>

      <div className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><strong>PL No:</strong> {header.pl_no}</div>
          <div><strong>Status:</strong> {header.status}</div>
          <div><strong>Vendor:</strong> {header.vendor?.vendor_name ?? "-"}</div>
          <div><strong>Brand:</strong> {header.vendor?.brand_name ?? "-"}</div>
          <div><strong>PO No:</strong> {header.po_no ?? "-"}</div>
          <div><strong>ASN No:</strong> {header.asn_no ?? "-"}</div>
          <div><strong>Invoice No:</strong> {header.invoice_no ?? "-"}</div>
          <div><strong>Shipment No:</strong> {header.shipment_no ?? "-"}</div>
          <div><strong>Ship From:</strong> {header.ship_from ?? "-"}</div>
          <div><strong>Ship To:</strong> {header.ship_to ?? "-"}</div>
          <div><strong>Total Cartons:</strong> {header.total_cartons ?? 0}</div>
          <div><strong>Total Qty:</strong> {header.total_qty ?? 0}</div>
          <div><strong>Gross Weight:</strong> {header.gross_weight ?? 0}</div>
          <div><strong>Net Weight:</strong> {header.net_weight ?? 0}</div>
          <div><strong>CBM:</strong> {header.cbm ?? 0}</div>
          <div>
            <strong>Submitted At:</strong>{" "}
            {header.submitted_at ? new Date(header.submitted_at).toLocaleString() : "-"}
          </div>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <div className="p-4 border-b font-medium">Lines</div>
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left p-3">Line</th>
              <th className="text-left p-3">SKU</th>
              <th className="text-left p-3">Style</th>
              <th className="text-left p-3">Color</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Carton</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-left p-3">PO</th>
              <th className="text-left p-3">PO Line</th>
              <th className="text-left p-3">ASN</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any) => (
              <tr key={line.id} className="border-b last:border-b-0">
                <td className="p-3">{line.line_no}</td>
                <td className="p-3">{line.sku}</td>
                <td className="p-3">{line.style_code ?? "-"}</td>
                <td className="p-3">{line.color ?? "-"}</td>
                <td className="p-3">{line.size ?? "-"}</td>
                <td className="p-3">{line.carton_no ?? "-"}</td>
                <td className="p-3 text-right">{line.qty ?? 0}</td>
                <td className="p-3">{line.po_no ?? "-"}</td>
                <td className="p-3">{line.po_line_no ?? "-"}</td>
                <td className="p-3">{line.asn_no ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border rounded p-4">
        <div className="font-medium mb-2">Attachments</div>
        {attachments.length === 0 ? (
          <div className="text-sm text-gray-500">No attachments.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {attachments.map((file: any) => (
              <li key={file.id}>{file.file_name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}