import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRow = {
  po_no: string;
  sku: string;
  qty_ordered: number;
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
  const skuIdx = headers.indexOf("sku");
  const qtyOrderedIdx = headers.indexOf("qty_ordered");

  if (poNoIdx === -1) throw new Error("CSV must include 'po_no' header");
  if (skuIdx === -1) throw new Error("CSV must include 'sku' header");
  if (qtyOrderedIdx === -1) throw new Error("CSV must include 'qty_ordered' header");

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const po_no = String(cols[poNoIdx] ?? "").trim();
    const sku = String(cols[skuIdx] ?? "").trim();
    const qty_ordered = Number(cols[qtyOrderedIdx] ?? 0);

    if (!po_no || !sku) continue;

    rows.push({
      po_no,
      sku,
      qty_ordered: Number.isFinite(qty_ordered) ? qty_ordered : 0,
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

    const inserted: Array<{ po_no: string; sku: string }> = [];
    const updated: Array<{ po_no: string; sku: string }> = [];
    const errors: Array<{ po_no: string; sku: string; error: string }> = [];

    for (const row of parsed) {
      try {
        const { data: poHeader, error: poErr } = await sb
          .from("po_header")
          .select("id, po_no")
          .eq("po_no", row.po_no)
          .maybeSingle();

        if (poErr) throw poErr;
        if (!poHeader?.id) {
          throw new Error(`PO header not found: ${row.po_no}`);
        }

        const { data: existing, error: existingErr } = await sb
          .from("po_line")
          .select("id")
          .eq("po_id", poHeader.id)
          .eq("sku", row.sku)
          .maybeSingle();

        if (existingErr) throw existingErr;

        if (existing?.id) {
          const { error: updateErr } = await sb
            .from("po_line")
            .update({
              qty_ordered: row.qty_ordered,
            })
            .eq("id", existing.id);

          if (updateErr) throw updateErr;
          updated.push({ po_no: row.po_no, sku: row.sku });
        } else {
          const { error: insertErr } = await sb
            .from("po_line")
            .insert({
              po_id: poHeader.id,
              sku: row.sku,
              qty: 0,
              qty_ordered: row.qty_ordered,
            });

          if (insertErr) throw insertErr;
          inserted.push({ po_no: row.po_no, sku: row.sku });
        }
      } catch (e: any) {
        errors.push({
          po_no: row.po_no,
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
      error_count: errors.length,
      inserted,
      updated,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}