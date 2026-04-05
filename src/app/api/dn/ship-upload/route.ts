import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRow = {
  dn_no: string;
  ship_from: string | null;
  ship_to: string | null;
  planned_gi_date: string | null;
  planned_delivery_date: string | null;
  actual_gi_date: string | null;
  sku: string;
  reserved_qty: number;
  qty_to_ship: number;
  carrier: string | null;
  tracking_no: string | null;
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
    const idx = headers.indexOf(name);
    if (idx === -1) throw new Error(`CSV must include '${name}'`);
    return idx;
  };

  const dnNoIdx = getIdx("dn_no");
  const shipFromIdx = getIdx("ship_from");
  const shipToIdx = getIdx("ship_to");
  const plannedGiIdx = getIdx("planned_gi_date");
  const plannedDeliveryIdx = getIdx("planned_delivery_date");
  const actualGiIdx = getIdx("actual_gi_date");
  const skuIdx = getIdx("sku");
  const reservedQtyIdx = getIdx("reserved_qty");
  const qtyToShipIdx = getIdx("qty_to_ship");
  const carrierIdx = getIdx("carrier");
  const trackingNoIdx = getIdx("tracking_no");

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const dn_no = String(cols[dnNoIdx] ?? "").trim();
    const ship_from = String(cols[shipFromIdx] ?? "").trim() || null;
    const ship_to = String(cols[shipToIdx] ?? "").trim() || null;
    const planned_gi_date = String(cols[plannedGiIdx] ?? "").trim() || null;
    const planned_delivery_date = String(cols[plannedDeliveryIdx] ?? "").trim() || null;
    const actual_gi_date = String(cols[actualGiIdx] ?? "").trim() || null;
    const sku = String(cols[skuIdx] ?? "").trim();
    const reserved_qty = Number(cols[reservedQtyIdx] ?? 0);
    const qty_to_ship = Number(cols[qtyToShipIdx] ?? 0);
    const carrier = String(cols[carrierIdx] ?? "").trim() || null;
    const tracking_no = String(cols[trackingNoIdx] ?? "").trim() || null;

    if (!dn_no || !sku) continue;
    if (!Number.isFinite(reserved_qty) || reserved_qty < 0) continue;
    if (!Number.isFinite(qty_to_ship) || qty_to_ship < 0) continue;

    rows.push({
      dn_no,
      ship_from,
      ship_to,
      planned_gi_date,
      planned_delivery_date,
      actual_gi_date,
      sku,
      reserved_qty,
      qty_to_ship,
      carrier,
      tracking_no,
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

    const updatedHeaders: any[] = [];
    const updatedLines: any[] = [];
    const reservedRows: any[] = [];
    const errors: Array<{ dn_no: string; sku: string; error: string }> = [];

    const touchedHeaders = new Set<string>();
    const touchedReserveKeys = new Set<string>();

    for (const row of parsed) {
      try {
        const { data: dnHeader, error: dnHeaderErr } = await supabase
          .from("dn_header")
          .select("*")
          .eq("dn_no", row.dn_no)
          .maybeSingle();

        if (dnHeaderErr) throw dnHeaderErr;
        if (!dnHeader?.id) throw new Error(`DN not found: ${row.dn_no}`);

        if (!touchedHeaders.has(dnHeader.id)) {
          const nextStatus =
            row.reserved_qty > 0 && dnHeader.status === "PENDING"
              ? "RESERVED"
              : dnHeader.status;

          const reserveAt =
            row.reserved_qty > 0
              ? new Date().toISOString()
              : dnHeader.reserved_at ?? null;

          const { data: updatedHeader, error: updateHeaderErr } = await supabase
            .from("dn_header")
            .update({
              ship_from: row.ship_from,
              ship_to: row.ship_to,
              planned_gi_date: row.planned_gi_date,
              planned_delivery_date: row.planned_delivery_date,
              actual_gi_date: row.actual_gi_date,
              carrier: row.carrier,
              tracking_no: row.tracking_no,
              reserved_at: reserveAt,
              status: nextStatus,
            })
            .eq("id", dnHeader.id)
            .select("*")
            .single();

          if (updateHeaderErr) throw updateHeaderErr;

          updatedHeaders.push(updatedHeader);
          touchedHeaders.add(dnHeader.id);
        }

        const { data: dnLine, error: dnLineErr } = await supabase
          .from("dn_lines")
          .select("*")
          .eq("dn_id", dnHeader.id)
          .eq("sku", row.sku)
          .maybeSingle();

        if (dnLineErr) throw dnLineErr;

        let effectiveLine = dnLine;

        if (!effectiveLine?.id) {
          const baseQty =
            row.qty_to_ship > 0
              ? row.qty_to_ship
              : row.reserved_qty > 0
              ? row.reserved_qty
              : 0;

          const { data: insertedLine, error: insertLineErr } = await supabase
            .from("dn_lines")
            .insert({
              dn_id: dnHeader.id,
              sku: row.sku,
              qty: baseQty,
              qty_ordered: baseQty,
              qty_reserved: row.reserved_qty,
              qty_shipped: 0,
            })
            .select("*")
            .single();

          if (insertLineErr) throw insertLineErr;

          effectiveLine = insertedLine;
          updatedLines.push(insertedLine);
        } else {
          const currentQty = Number(effectiveLine.qty ?? effectiveLine.qty_ordered ?? 0);
          const currentOrdered = Number(effectiveLine.qty_ordered ?? currentQty);

          const { data: updatedLine, error: updateLineErr } = await supabase
            .from("dn_lines")
            .update({
              qty: currentQty,
              qty_ordered: currentOrdered,
              qty_reserved: row.reserved_qty,
              qty_shipped: 0,
            })
            .eq("id", effectiveLine.id)
            .select("*")
            .single();

          if (updateLineErr) throw updateLineErr;

          effectiveLine = updatedLine;
          updatedLines.push(updatedLine);
        }

        if (row.reserved_qty > 0) {
          const reserveKey = `${dnHeader.id}__${row.sku}`;

          if (!touchedReserveKeys.has(reserveKey)) {
            const { data: invRow, error: invErr } = await supabase
              .from("inventory")
              .select("sku, qty_onhand, qty_reserved, allocated")
              .eq("sku", row.sku)
              .maybeSingle();

            if (invErr) throw invErr;
            if (!invRow) throw new Error(`Inventory not found for SKU ${row.sku}`);

            const currentOnhand = Number(invRow.qty_onhand ?? 0);
            const currentReserved = Number(invRow.qty_reserved ?? 0);

            const reservable = currentOnhand - currentReserved;
            if (reservable < row.reserved_qty) {
              throw new Error(
                `Insufficient inventory for reserve: sku=${row.sku}, onhand=${currentOnhand}, reserved=${currentReserved}, request=${row.reserved_qty}`
              );
            }

            const { error: invUpdateErr } = await supabase
              .from("inventory")
              .update({
                qty_reserved: currentReserved + row.reserved_qty,
              })
              .eq("sku", row.sku);

            if (invUpdateErr) throw invUpdateErr;

            const { data: existingTx, error: existingTxErr } = await supabase
              .from("inventory_tx")
              .select("id")
              .eq("sku", row.sku)
              .eq("tx_type", "DN_RESERVE")
              .eq("ref_type", "DN")
              .eq("ref_id", dnHeader.id)
              .maybeSingle();

            if (existingTxErr) throw existingTxErr;

            if (!existingTx?.id) {
              const { error: txErr } = await supabase
                .from("inventory_tx")
                .insert({
                  sku: row.sku,
                  tx_type: "DN_RESERVE",
                  qty_delta: row.reserved_qty,
                  ref_type: "DN",
                  ref_id: dnHeader.id,
                  created_at: new Date().toISOString(),
                });

              if (txErr) throw txErr;
            }

            reservedRows.push({
              dn_no: row.dn_no,
              sku: row.sku,
              reserved_qty: row.reserved_qty,
            });

            touchedReserveKeys.add(reserveKey);
          }
        }
      } catch (e: any) {
        errors.push({
          dn_no: row.dn_no,
          sku: row.sku,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      total_rows: parsed.length,
      updated_header_count: updatedHeaders.length,
      updated_line_count: updatedLines.length,
      reserved_count: reservedRows.length,
      error_count: errors.length,
      updated_headers: updatedHeaders,
      updated_lines: updatedLines,
      reserved_rows: reservedRows,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}