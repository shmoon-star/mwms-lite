import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyPoCreated, safeNotify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type ParsedRow = {
  po_no: string;
  vendor: string;
  eta: string | null;
  status: string | null;
};

type VendorLookupRow = {
  id: string;
  vendor_code: string | null;
  status?: string | null;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(v: string) {
  return v.trim().toLowerCase();
}

function normalizeVendorCode(v: string | null | undefined) {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeStatus(v: string | null | undefined) {
  const s = String(v ?? "").trim().toUpperCase();
  return s || "CREATED";
}

function parseCsv(content: string): ParsedRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  const poNoIdx = headers.indexOf("po_no");
  const vendorIdx = headers.indexOf("vendor");
  const etaIdx = headers.indexOf("eta");
  const statusIdx = headers.indexOf("status");

  if (poNoIdx < 0 || vendorIdx < 0) {
    throw new Error("CSV must include po_no,vendor columns");
  }

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);

    rows.push({
      po_no: cols[poNoIdx]?.trim() || "",
      vendor: normalizeVendorCode(cols[vendorIdx]),
      eta: etaIdx >= 0 ? cols[etaIdx]?.trim() || null : null,
      status: statusIdx >= 0 ? normalizeStatus(cols[statusIdx]) : "CREATED",
    });
  }

  return rows.filter((row) => row.po_no && row.vendor);
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "file is required" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows in CSV" },
        { status: 400 }
      );
    }

    const vendorCodes = [...new Set(rows.map((r) => r.vendor))];

    const { data: vendorRowsRaw, error: vendorRowsError } = await sb
      .from("vendor")
      .select("id, vendor_code, status")
      .in("vendor_code", vendorCodes);

    if (vendorRowsError) {
      return NextResponse.json(
        { ok: false, error: vendorRowsError.message },
        { status: 500 }
      );
    }

    const vendorRows = (vendorRowsRaw ?? []) as VendorLookupRow[];

    const vendorMap = new Map<string, string>();
    for (const row of vendorRows) {
      const code = normalizeVendorCode(row.vendor_code);
      if (!code || !row.id) continue;

      // 지금은 ACTIVE만 허용
      if (row.status && String(row.status).toUpperCase() !== "ACTIVE") continue;

      vendorMap.set(code, row.id);
    }

    const missingVendors = rows
      .map((row) => row.vendor)
      .filter((vendorCode) => !vendorMap.has(vendorCode));

    if (missingVendors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Vendor code not found or inactive: ${[
            ...new Set(missingVendors),
          ].join(", ")}`,
        },
        { status: 400 }
      );
    }

    const payload = rows.map((row) => ({
      po_no: row.po_no.trim(),
      vendor_id: vendorMap.get(row.vendor)!,
      eta: row.eta,
      status: normalizeStatus(row.status),
    }));

    const { data, error } = await sb
      .from("po_header")
      .upsert(payload, { onConflict: "po_no" })
      .select("id, po_no, vendor_id, status, eta");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    await Promise.allSettled(
      (data ?? []).map((item: any) =>
        safeNotify(`PO_CREATED:${item.po_no}`, async () => {
          await notifyPoCreated({
            poNo: item.po_no,
            vendorId: item.vendor_id,
            eta: item.eta ?? null,
          });
        })
      )
    );

    return NextResponse.json({
      ok: true,
      filename: file.name,
      total_rows: rows.length,
      inserted_count: data?.length ?? 0,
      items: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}