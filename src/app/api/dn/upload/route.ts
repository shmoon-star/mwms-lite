import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRow = {
  dn_no: string;
  ship_from: string | null;
  ship_to: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
  sku: string;
  qty_ordered: number;
  remarks: string | null;
  description: string | null; // ✅ 추가
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

  const getIdx = (name: string) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`CSV must include '${name}'`);
    return i;
  };

  const dnNoIdx = getIdx("dn_no");
  const shipFromIdx = getIdx("ship_from");
  const shipToIdx = getIdx("ship_to");
  const plannedGiIdx = getIdx("planned_gi_date");
  const plannedDeliveryIdx = getIdx("planned_delivery_date");
  const skuIdx = getIdx("sku");
  const qtyOrderedIdx = getIdx("qty_ordered");
  const remarksIdx = headers.indexOf("remarks");
  const descriptionIdx = headers.indexOf("description"); // ✅ 추가

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const dn_no = String(cols[dnNoIdx] ?? "").trim();
    const ship_from = String(cols[shipFromIdx] ?? "").trim() || null;
    const ship_to = String(cols[shipToIdx] ?? "").trim() || null;
    const planned_gi_date = String(cols[plannedGiIdx] ?? "").trim() || null;
    const planned_delivery_date = String(cols[plannedDeliveryIdx] ?? "").trim() || null;
    const sku = String(cols[skuIdx] ?? "").trim();
    const qty_ordered = Number(cols[qtyOrderedIdx] ?? 0);
    const remarks = remarksIdx >= 0 ? String(cols[remarksIdx] ?? "").trim() || null : null;

    const description =
      descriptionIdx >= 0
        ? String(cols[descriptionIdx] ?? "").trim() || null
        : null;

    if (!dn_no || !sku) continue;
    if (!Number.isFinite(qty_ordered) || qty_ordered <= 0) continue;

    rows.push({
      dn_no,
      ship_from,
      ship_to,
      planned_gi_date,
      planned_delivery_date,
      sku,
      qty_ordered,
      remarks,
      description, // ✅ 추가
    });
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "CSV file is required" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseCsv(text);

    if (parsed.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid rows" }, { status: 400 });
    }

    const headerCache = new Map<string, string>();

    for (const row of parsed) {
      let dnId = headerCache.get(row.dn_no);

      if (!dnId) {
        const { data: existingHeader } = await supabase
          .from("dn_header")
          .select("id")
          .eq("dn_no", row.dn_no)
          .maybeSingle();

        if (existingHeader?.id) {
          dnId = existingHeader.id;

          await supabase
            .from("dn_header")
            .update({
              ship_from: row.ship_from,
              ship_to: row.ship_to,
              planned_gi_date: row.planned_gi_date,
              planned_delivery_date: row.planned_delivery_date,
            })
            .eq("id", dnId);
        } else {
          const { data: createdHeader } = await supabase
            .from("dn_header")
            .insert({
              dn_no: row.dn_no,
              status: "PENDING",
              ship_from: row.ship_from,
              ship_to: row.ship_to,
              planned_gi_date: row.planned_gi_date,
              planned_delivery_date: row.planned_delivery_date,
            })
            .select("*")
            .single();

          if (!createdHeader?.id) throw new Error("Header create fail");

          dnId = createdHeader.id;
        }
   if (!dnId) {
          throw new Error(`dnId not resolved for dn_no: ${row.dn_no}`);
        }

        headerCache.set(row.dn_no, dnId);
      }

      if (!dnId) {
        throw new Error(`dnId not resolved for dn_no: ${row.dn_no}`);
      }

      const { data: existingLine } = await supabase
        .from("dn_lines")
        .select("id")
        .eq("dn_id", dnId)
        .eq("sku", row.sku)
        .maybeSingle();

      if (existingLine?.id) {
        await supabase
          .from("dn_lines")
          .update({
            qty: row.qty_ordered,
            qty_ordered: row.qty_ordered,
            qty_shipped: 0,
            description: row.description, // ✅ 추가
          })
          .eq("id", existingLine.id);
      } else {
        await supabase
          .from("dn_lines")
          .insert({
            dn_id: dnId,
            sku: row.sku,
            qty: row.qty_ordered,
            qty_ordered: row.qty_ordered,
            qty_shipped: 0,
            description: row.description, // ✅ 추가
          });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}