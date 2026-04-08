import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRow = {
  sku: string;
  brand: string | null;
  name: string | null;
  barcode: string | null;
  uom: string | null;
  category: string | null;
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

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  const skuIdx = headers.indexOf("sku");
  const brandIdx = headers.indexOf("brand");
  const nameIdx = headers.indexOf("name");
  const productNameIdx = headers.indexOf("product_name");
  const barcodeIdx = headers.indexOf("barcode");
  const uomIdx = headers.indexOf("uom");
  const categoryIdx = headers.indexOf("category");
  const statusIdx = headers.indexOf("status");

  if (skuIdx === -1) {
    throw new Error("CSV must include 'sku' header");
  }

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const sku = String(cols[skuIdx] ?? "").trim();
    const brand = brandIdx >= 0 ? String(cols[brandIdx] ?? "").trim() : "";
    const name =
      nameIdx >= 0
        ? String(cols[nameIdx] ?? "").trim()
        : productNameIdx >= 0
        ? String(cols[productNameIdx] ?? "").trim()
        : "";
    const barcode = barcodeIdx >= 0 ? String(cols[barcodeIdx] ?? "").trim() : "";
    const uom = uomIdx >= 0 ? String(cols[uomIdx] ?? "").trim() : "";
    const category = categoryIdx >= 0 ? String(cols[categoryIdx] ?? "").trim() : "";
    const status = statusIdx >= 0 ? String(cols[statusIdx] ?? "").trim() : "";

    if (!sku) continue;

    rows.push({
      sku,
      brand: brand || null,
      name: name || null,
      barcode: barcode || null,
      uom: uom || null,
      category: category || null,
      status: status || null,
    });
  }

  return rows;
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

    const inserted: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ sku: string; error: string }> = [];

    for (const row of parsed) {
      try {
        if (!row.sku) {
          skipped.push("(empty sku)");
          continue;
        }

        const { data: existing, error: existingErr } = await sb
          .from("products")
          .select("id, sku")
          .eq("sku", row.sku)
          .maybeSingle();

        if (existingErr) throw existingErr;

        const payload = {
          sku: row.sku,
          brand: row.brand,
          name: row.name,
          barcode: row.barcode,
          uom: row.uom,
          category: row.category,
          status: row.status ?? "ACTIVE",
        };

        if (existing?.id) {
          const { error: updateErr } = await sb
            .from("products")
            .update(payload)
            .eq("id", existing.id);

          if (updateErr) throw updateErr;
          updated.push(row.sku);
        } else {
          const { error: insertErr } = await sb
            .from("products")
            .insert(payload);

          if (insertErr) throw insertErr;
          inserted.push(row.sku);
        }
      } catch (e: any) {
        errors.push({
          sku: row.sku,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      total_rows: parsed.length,
      inserted_count: inserted.length,
      updated_count: updated.length,
      skipped_count: skipped.length,
      error_count: errors.length,
      inserted,
      updated,
      skipped,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}