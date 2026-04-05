import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyPoCreated, safeNotify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Row = {
  po_no: string;
  sku: string;
  qty_ordered: number;
};

type PoHeaderRow = {
  id: string;
  po_no: string;
  vendor_id: string;
  eta: string | null;
  po_created_notified_at: string | null;
};

function parseCSV(text: string): Row[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const poIdx = header.indexOf("po_no");
  const skuIdx = header.indexOf("sku");
  const qtyIdx = header.indexOf("qty_ordered");

  if (poIdx === -1 || skuIdx === -1 || qtyIdx === -1) {
    throw new Error("CSV must include po_no, sku, qty_ordered");
  }

  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());

    const po_no = cols[poIdx];
    const sku = cols[skuIdx];
    const qty_ordered = Number(cols[qtyIdx] || 0);

    if (!po_no || !sku) continue;

    rows.push({
      po_no,
      sku,
      qty_ordered,
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
        { ok: false, error: "CSV file required" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const parsed = parseCSV(text);

    if (parsed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows found in CSV" },
        { status: 400 }
      );
    }

    const inserted: Array<{ po_no: string; sku: string }> = [];
    const updated: Array<{ po_no: string; sku: string }> = [];
    const errors: Array<{ po_no: string; sku: string; error: string }> = [];

    // 어떤 PO들이 이번 업로드에 포함됐는지 추적
    const touchedPoNos = new Set<string>();

    for (const row of parsed) {
      try {
        const { data: header, error: headerError } = await sb
          .from("po_header")
          .select("id, po_no")
          .eq("po_no", row.po_no)
          .single();

        if (headerError) throw headerError;
        if (!header) {
          throw new Error(`PO not found: ${row.po_no}`);
        }

        touchedPoNos.add(row.po_no);

        const { data: existing, error: existingError } = await sb
          .from("po_line")
          .select("id")
          .eq("po_id", header.id)
          .eq("sku", row.sku)
          .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
          const { error } = await sb
            .from("po_line")
            .update({
              qty_ordered: row.qty_ordered,
            })
            .eq("id", existing.id);

          if (error) throw error;

          updated.push({
            po_no: row.po_no,
            sku: row.sku,
          });
        } else {
          const { error } = await sb.from("po_line").insert({
            po_id: header.id,
            sku: row.sku,
            qty: 0,
            qty_ordered: row.qty_ordered,
          });

          if (error) throw error;

          inserted.push({
            po_no: row.po_no,
            sku: row.sku,
          });
        }
      } catch (e: any) {
        errors.push({
          po_no: row.po_no,
          sku: row.sku,
          error: e?.message ?? String(e),
        });
      }
    }

    // 이번 업로드에 포함된 PO들 중,
    // 실제 line이 존재하고 아직 메일을 안 보낸 PO만 메일 발송
    const notified: string[] = [];
    const notifyErrors: Array<{ po_no: string; error: string }> = [];

    for (const poNo of touchedPoNos) {
      try {
        const { data: poHeaderRaw, error: poHeaderError } = await sb
          .from("po_header")
          .select("id, po_no, vendor_id, eta, po_created_notified_at")
          .eq("po_no", poNo)
          .single();

        if (poHeaderError) throw poHeaderError;
        if (!poHeaderRaw) continue;

        const poHeader = poHeaderRaw as PoHeaderRow;

        // 이미 메일 보냈으면 skip
        if (poHeader.po_created_notified_at) {
          continue;
        }

        // 실제 line 존재 여부 확인
        const { count: poLineCount, error: poLineCountError } = await sb
          .from("po_line")
          .select("*", { count: "exact", head: true })
          .eq("po_id", poHeader.id);

        if (poLineCountError) throw poLineCountError;

        if ((poLineCount ?? 0) <= 0) {
          continue;
        }

        // 메일 발송
        await safeNotify(`PO_CREATED:${poHeader.po_no}`, async () => {
          await notifyPoCreated({
            poNo: poHeader.po_no,
            vendorId: poHeader.vendor_id,
            eta: poHeader.eta ?? null,
          });
        });

        // 중복 방지 마킹
        const { error: notifyMarkError } = await sb
          .from("po_header")
          .update({
            po_created_notified_at: new Date().toISOString(),
          })
          .eq("id", poHeader.id)
          .is("po_created_notified_at", null);

        if (notifyMarkError) throw notifyMarkError;

        notified.push(poHeader.po_no);
      } catch (e: any) {
        notifyErrors.push({
          po_no: poNo,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total_rows: parsed.length,
      inserted_count: inserted.length,
      updated_count: updated.length,
      error_count: errors.length,
      notified_count: notified.length,
      notify_error_count: notifyErrors.length,
      inserted,
      updated,
      errors,
      notified,
      notify_errors: notifyErrors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}