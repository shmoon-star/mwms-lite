"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function Pagination({
  page,
  pageSize,
  total,
  totalPages,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function movePage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    params.set("page_size", String(pageSize));
    router.push(`?${params.toString()}`);
  }

  function changePageSize(nextPageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("page_size", String(nextPageSize));
    router.push(`?${params.toString()}`);
  }

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded p-3 text-sm">
      <div>
        Showing {start}-{end} of {total}
      </div>

      <div className="flex items-center gap-2">
        <span>Rows:</span>
        <select
          className="border rounded px-2 py-1"
          value={String(pageSize)}
          onChange={(e) => changePageSize(Number(e.target.value))}
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>

        <button
          type="button"
          onClick={() => movePage(page - 1)}
          disabled={!canPrev}
          className="border rounded px-3 py-1 disabled:opacity-50"
        >
          Prev
        </button>

        <span>
          Page {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => movePage(page + 1)}
          disabled={!canNext}
          className="border rounded px-3 py-1 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}