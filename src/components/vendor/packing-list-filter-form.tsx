"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function VendorPackingListFilterForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [plNo, setPlNo] = useState(searchParams.get("pl_no") ?? "");
  const [poNo, setPoNo] = useState(searchParams.get("po_no") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [pageSize, setPageSize] = useState(searchParams.get("page_size") ?? "20");

  function handleSearch() {
    const params = new URLSearchParams();

    if (plNo.trim()) params.set("pl_no", plNo.trim());
    if (poNo.trim()) params.set("po_no", poNo.trim());
    if (status.trim()) params.set("status", status.trim());
    if (pageSize.trim()) params.set("page_size", pageSize.trim());

    router.push(`${pathname}?${params.toString()}`);
  }

  function handleReset() {
    setPlNo("");
    setPoNo("");
    setStatus("");
    setPageSize("20");
    router.push(pathname);
  }

  return (
    <div className="border rounded p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
      <input
        className="border rounded px-3 py-2"
        placeholder="PL No"
        value={plNo}
        onChange={(e) => setPlNo(e.target.value)}
      />

      <input
        className="border rounded px-3 py-2"
        placeholder="PO No"
        value={poNo}
        onChange={(e) => setPoNo(e.target.value)}
      />

      <select
        className="border rounded px-3 py-2"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">All Status</option>
        <option value="DRAFT">DRAFT</option>
        <option value="CONFIRMED">CONFIRMED</option>
        <option value="CANCELED">CANCELED</option>
      </select>

      <select
        className="border rounded px-3 py-2"
        value={pageSize}
        onChange={(e) => setPageSize(e.target.value)}
      >
        <option value="20">20 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </select>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSearch}
          className="border rounded px-4 py-2"
        >
          Search
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="border rounded px-4 py-2"
        >
          Reset
        </button>
      </div>
    </div>
  );
}