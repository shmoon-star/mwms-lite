import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeView(view: string) {
  const v = String(view || "all").toLowerCase();
  if (v === "open" || v === "closed" || v === "all") return v;
  return "all";
}

function inferExpected(row: Record<string, any>) {
  return Number(
    row.qty_expected ??
      row.expected_qty ??
      row.qty ??
      row.qty_ordered ??
      row.planned_qty ??
      0
  );
}

function inferReceived(row: Record<string, any>) {
  return Number(
    row.qty_received ??
      row.received_qty ??
      row.qty_done ??
      0
  );
}

function deriveAsnStatus(expected: number, received: number) {
  if (received <= 0) return "OPEN";
  if (expected > 0 && received < expected) return "PARTIAL_RECEIVED";
  return "FULL_RECEIVED";
}

function isClosedStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return ["FULL_RECEIVED", "CONFIRMED", "CLOSED", "RECEIVED"].includes(s);
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
}

async function loadAsnLines(sb: any, asnIds: string[]) {
  if (!asnIds.length) return [];

  const { data, error } = await sb
    .from("asn_line")
    .select("*")
    .in("asn_id", asnIds);

  if (error) {
    throw new Error(error.message || "Failed to load ASN lines");
  }

  return data || [];
}

export async function GET(req: Request) {
  try {
    const sb = await createClient();
    const url = new URL(req.url);
    const view = normalizeView(url.searchParams.get("view") || "all");

    const { data: headers, error: headerError } = await sb
      .from("asn_header")
      .select("*")
      .order("created_at", { ascending: false });

    if (headerError) {
      return NextResponse.json(
        { ok: false, error: headerError.message },
        { status: 500 }
      );
    }

    const headerRows = (headers || []) as Record<string, any>[];
    const asnIds = headerRows.map((row) => row.id).filter(Boolean);

    const lines = await loadAsnLines(sb, asnIds);

    const filteredHeaderIds = new Set(
      (
        view === "open"
          ? headerRows.filter((row) => !isClosedStatus(row.status))
          : view === "closed"
          ? headerRows.filter((row) => isClosedStatus(row.status))
          : headerRows
      ).map((row) => row.id)
    );

    const filteredLines = lines.filter((row: any) => filteredHeaderIds.has(row.asn_id));

    const skuList = Array.from(
      new Set(filteredLines.map((row: any) => row.sku).filter(Boolean))
    );

    let products: Record<string, any>[] = [];
    if (skuList.length > 0) {
      const { data: productData, error: productError } = await sb
        .from("products")
        .select("sku, name, brand")
        .in("sku", skuList);

      if (productError) {
        return NextResponse.json(
          { ok: false, error: productError.message },
          { status: 500 }
        );
      }

      products = productData || [];
    }

    const productMap = new Map<string, Record<string, any>>();
    for (const row of products) {
      if (row.sku) productMap.set(row.sku, row);
    }

    const headerMap = new Map<string, Record<string, any>>();
    for (const row of headerRows) {
      if (row.id) headerMap.set(row.id, row);
    }

    const rows = filteredLines.map((row: any) => {
      const header = headerMap.get(row.asn_id);
      const product = productMap.get(row.sku);

      const expected = inferExpected(row);
      const received = inferReceived(row);
      const status = deriveAsnStatus(expected, received);

      return [
        header?.asn_no || "",
        row.line_no ?? "",
        row.carton_no || "",
        row.sku || "",
        product?.brand || "",
        product?.name || "",
        expected,
        received,
        Math.max(expected - received, 0),
        status,
        row.created_at || "",
      ];
    });

    const csv = makeCsv(
      [
        "asn_no",
        "line_no",
        "carton_no",
        "sku",
        "brand",
        "description",
        "expected_qty",
        "received_qty",
        "balance",
        "line_status",
        "created_at",
      ],
      rows
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="asn_detail_${view}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}