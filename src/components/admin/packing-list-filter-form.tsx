"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function PackingListFilterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [plNo, setPlNo] = useState(searchParams.get("pl_no") ?? "");
  const [poNo, setPoNo] = useState(searchParams.get("po_no") ?? "");
  const [asnNo, setAsnNo] = useState(searchParams.get("asn_no") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [pageSize, setPageSize] = useState(searchParams.get("page_size") ?? "20");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const params = new URLSearchParams();

    if (plNo.trim()) params.set("pl_no", plNo.trim());
    if (poNo.trim()) params.set("po_no", poNo.trim());
    if (asnNo.trim()) params.set("asn_no", asnNo.trim());
    if (status.trim()) params.set("status", status.trim());

    params.set("page", "1");
    params.set("page_size", pageSize);

    router.push(`/admin/packing-lists?${params.toString()}`);
  }

  function handleReset() {
    setPlNo("");
    setPoNo("");
    setAsnNo("");
    setStatus("");
    setPageSize("20");
    router.push("/admin/packing-lists?page=1&page_size=20");
  }

  return (
    <form
      onSubmit={handleSearch}
      className="border rounded p-4 grid grid-cols-1 md:grid-cols-6 gap-3"
    >
      <input
        className="border rounded px-3 py-2 text-sm"
        placeholder="PL No"
        value={plNo}
        onChange={(e) => setPlNo(e.target.value)}
      />

      <input
        className="border rounded px-3 py-2 text-sm"
        placeholder="PO No"
        value={poNo}
        onChange={(e) => setPoNo(e.target.value)}
      />

      <input
        className="border rounded px-3 py-2 text-sm"
        placeholder="ASN No"
        value={asnNo}
        onChange={(e) => setAsnNo(e.target.value)}
      />

      <select
        className="border rounded px-3 py-2 text-sm"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">All Status</option>
        <option value="DRAFT">DRAFT</option>
        <option value="SUBMITTED">SUBMITTED</option>
        <option value="REVIEWED">REVIEWED</option>
        <option value="CONFIRMED">CONFIRMED</option>
        <option value="CANCELED">CANCELED</option>
      </select>

      <select
        className="border rounded px-3 py-2 text-sm"
        value={pageSize}
        onChange={(e) => setPageSize(e.target.value)}
      >
        <option value="20">20 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </select>

      <div className="flex gap-2">
        <button type="submit" className="border rounded px-4 py-2 text-sm">
          Search
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="border rounded px-4 py-2 text-sm"
        >
          Reset
        </button>
      </div>
    </form>
  );
}