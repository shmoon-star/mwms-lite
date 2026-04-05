import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNotify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type ParsedRow = {
  po_no: string;
  vendor: string | null; // CSV input: vendor_code or vendor_name or UUID
  eta: string | null;
  status: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type PoResultRow = {
  id: string;
  po_no: string;
  vendor_id: string;
  vendor_code: string | null;
  vendor_name: string | null;
  eta: string | null;
  status: string | null;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((x) => x.trim());
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

  const poNoIdx = headers.indexOf("po_no");
  const vendorIdx = headers.indexOf("vendor");
  const etaIdx = headers.indexOf("eta");
  const statusIdx = headers.indexOf("status");

  if (poNoIdx === -1) {
    throw new Error("CSV must include 'po_no' header");
  }
  if (vendorIdx === -1) {
    throw new Error("CSV must include 'vendor' header");
  }
  if (etaIdx === -1) {
    throw new Error("CSV must include 'eta' header");
  }

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const po_no = String(cols[poNoIdx] ?? "").trim();
    const vendor = String(cols[vendorIdx] ?? "").trim();
    const eta = String(cols[etaIdx] ?? "").trim();
    const status =
      statusIdx >= 0 ? String(cols[statusIdx] ?? "").trim() : "CREATED";

    if (!po_no) continue;

    rows.push({
      po_no,
      vendor: vendor || null,
      eta: eta || null,
      status: status || "CREATED",
    });
  }

  return rows;
}

function normalizeKey(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const sb = await createClient();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "CSV file is required" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows found in CSV" },
        { status: 400 }
      );
    }

    const vendorInputs = [
      ...new Set(
        parsed.map((row) => row.vendor).filter((v): v is string => !!v?.trim())
      ),
    ];

    const { data: vendorRowsRaw, error: vendorRowsError } = await sb
      .from("vendor")
      .select("id, vendor_code, vendor_name");

    if (vendorRowsError) {
      return NextResponse.json(
        { ok: false, error: vendorRowsError.message },
        { status: 500 }
      );
    }

    const vendorRows = (vendorRowsRaw ?? []) as VendorRow[];
    const vendorMap = new Map<string, VendorRow>();

    for (const v of vendorRows) {
      if (v.id) vendorMap.set(normalizeKey(v.id), v);
      if (v.vendor_code) vendorMap.set(normalizeKey(v.vendor_code), v);
      if (v.vendor_name) vendorMap.set(normalizeKey(v.vendor_name), v);
    }

    const inserted: PoResultRow[] = [];
    const updated: PoResultRow[] = [];
    const errors: Array<{ po_no: string; vendor: string | null; error: string }> = [];

    for (const row of parsed) {
      try {
        const vendorInput = row.vendor?.trim() ?? "";

        if (!vendorInput) {
          throw new Error("vendor is required");
        }

        const matchedVendor = vendorMap.get(normalizeKey(vendorInput));

        if (!matchedVendor?.id) {
          throw new Error(`Vendor not found for input: ${vendorInput}`);
        }

        const payload = {
          po_no: row.po_no,
          vendor_id: matchedVendor.id,
          eta: row.eta,
          status: row.status ?? "CREATED",
        };

        const { data: existing, error: existingErr } = await sb
          .from("po_header")
          .select("id, po_no")
          .eq("po_no", row.po_no)
          .maybeSingle();

        if (existingErr) throw existingErr;

        if (existing?.id) {
          const { data: updatedRow, error: updateErr } = await sb
            .from("po_header")
            .update(payload)
            .eq("id", existing.id)
            .select("id, po_no, vendor_id, eta, status")
            .single();

          if (updateErr) throw updateErr;

          updated.push({
            id: updatedRow.id,
            po_no: updatedRow.po_no,
            vendor_id: updatedRow.vendor_id,
            vendor_code: matchedVendor.vendor_code,
            vendor_name: matchedVendor.vendor_name,
            eta: updatedRow.eta,
            status: updatedRow.status,
          });
        } else {
          const { data: insertedRow, error: insertErr } = await sb
            .from("po_header")
            .insert(payload)
            .select("id, po_no, vendor_id, eta, status")
            .single();

          if (insertErr) throw insertErr;

          inserted.push({
            id: insertedRow.id,
            po_no: insertedRow.po_no,
            vendor_id: insertedRow.vendor_id,
            vendor_code: matchedVendor.vendor_code,
            vendor_name: matchedVendor.vendor_name,
            eta: insertedRow.eta,
            status: insertedRow.status,
          });
        }
      } catch (e: any) {
        errors.push({
          po_no: row.po_no,
          vendor: row.vendor,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      total_rows: parsed.length,
      vendor_inputs: vendorInputs,
      inserted_count: inserted.length,
      updated_count: updated.length,
      error_count: errors.length,
      inserted,
      updated,
      errors,
    });
  } catch (e: any) {
    console.error("[PO_UPLOAD_HEADER_ERROR]", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}