import Link from "next/link";
import { headers } from "next/headers";
import { fmtDate } from "@/lib/fmt";
import PackingListFilterForm from "@/components/admin/packing-list-filter-form";
import StatusBadge from "@/components/common/status-badge";
import Pagination from "@/components/common/pagination";

type SearchParams = Promise<{
  pl_no?: string;
  po_no?: string;
  asn_no?: string;
  status?: string;
  page?: string;
  page_size?: string;
}>;

type VendorInfo = {
  id: string;
  vendor_code: string;
  vendor_name: string;
  brand_name: string | null;
};

type PackingListItem = {
  id: string;
  pl_no: string;
  po_no: string | null;
  asn_no: string | null;
  invoice_no: string | null;
  total_qty: number;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  vendor: VendorInfo | null;
};

type AdminPackingListResponse = {
  items: PackingListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

async function getPackingLists(searchParamsObj: {
  pl_no?: string;
  po_no?: string;
  asn_no?: string;
  status?: string;
  page?: string;
  page_size?: string;
}): Promise<AdminPackingListResponse> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

  const params = new URLSearchParams();

  if (searchParamsObj.pl_no) params.set("pl_no", searchParamsObj.pl_no);
  if (searchParamsObj.po_no) params.set("po_no", searchParamsObj.po_no);
  if (searchParamsObj.asn_no) params.set("asn_no", searchParamsObj.asn_no);
  if (searchParamsObj.status) params.set("status", searchParamsObj.status);
  if (searchParamsObj.page) params.set("page", searchParamsObj.page);
  if (searchParamsObj.page_size) params.set("page_size", searchParamsObj.page_size);

  const qs = params.toString();
  const url = `${protocol}://${host}/api/admin/packing-lists${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Failed to load admin packing lists");
  }

  return {
    items: json.items ?? [],
    pagination: json.pagination,
  };
}

export default async function AdminPackingListsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const data = await getPackingLists(resolvedSearchParams);

  const items = data.items;
  const pagination = data.pagination;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Packing List Review</h1>
          <div className="text-sm text-gray-500">Total: {pagination.total}</div>
        </div>
      </div>

      <PackingListFilterForm />

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left p-3">PL No</th>
              <th className="text-left p-3">Vendor</th>
              <th className="text-left p-3">Brand</th>
              <th className="text-left p-3">PO No</th>
              <th className="text-left p-3">ASN No</th>
              <th className="text-left p-3">Invoice No</th>
              <th className="text-right p-3">Total Qty</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Submitted At</th>
              <th className="text-left p-3">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  No packing lists found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="p-3">
                    <Link
                      href={`/admin/packing-lists/${item.id}`}
                      className="underline"
                    >
                      {item.pl_no}
                    </Link>
                  </td>
                  <td className="p-3">{item.vendor?.vendor_name ?? "-"}</td>
                  <td className="p-3">{item.vendor?.brand_name ?? "-"}</td>
                  <td className="p-3">{item.po_no ?? "-"}</td>
                  <td className="p-3">{item.asn_no ?? "-"}</td>
                  <td className="p-3">{item.invoice_no ?? "-"}</td>
                  <td className="p-3 text-right">{item.total_qty ?? 0}</td>
                  <td className="p-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="p-3">
                    {fmtDate(item.submitted_at) || "-"}
                  </td>
                  <td className="p-3">
                    {fmtDate(item.updated_at) || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        pageSize={pagination.page_size}
        total={pagination.total}
        totalPages={pagination.total_pages}
      />
    </div>
  );
}