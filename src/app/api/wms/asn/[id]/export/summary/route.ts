import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(headers: string[], rows: any[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function n(v: unknown) {
  return Number(v ?? 0);
}

export async function GET(_req: Request, { params }: Params) {
  const { id: asnId } = await params;
  const sb = await createClient();

  const { data: header } = await sb
    .from("asn_header")
    .select("*")
    .eq("id", asnId)
    .single();

  const { data: lines } = await sb
    .from("asn_line")
    .select("*")
    .eq("asn_id", asnId);

  const lineRows = lines || [];

  const cartonMap = new Map<
    string,
    { line_count: number; qty_expected: number; qty_received: number; created_at: string | null }
  >();

  for (const row of lineRows) {
    const cartonNo = row.carton_no || "NO_CARTON";
    const prev = cartonMap.get(cartonNo) || {
      line_count: 0,
      qty_expected: 0,
      qty_received: 0,
      created_at: row.created_at || null,
    };

    prev.line_count += 1;
    prev.qty_expected += n(row.qty_expected ?? row.qty);
    prev.qty_received += n(row.qty_received);
    if (!prev.created_at && row.created_at) prev.created_at = row.created_at;

    cartonMap.set(cartonNo, prev);
  }

  const rows = Array.from(cartonMap.entries()).map(([cartonNo, row]) => [
    header?.asn_no || "",
    cartonNo,
    row.line_count,
    row.qty_expected,
    row.qty_received,
    Math.max(row.qty_expected - row.qty_received, 0),
    row.created_at || "",
  ]);

  const csv = makeCsv(
    ["asn_no", "carton_no", "line_count", "expected_qty", "received_qty", "balance", "created_at"],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${header?.asn_no || "asn"}_summary.csv"`,
    },
  });
}