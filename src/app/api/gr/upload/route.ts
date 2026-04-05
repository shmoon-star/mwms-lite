import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParsedRow = {
  asn_no: string;
  line_no: number;
  sku: string | null;
  qty_expected: number;
  qty_received: number;
};

type UploadResultRow = {
  asn_no: string;
  line_no: number;
  sku: string | null;
  gr_id?: string;
  gr_no?: string | null;
};

type AsnHeaderRow = {
  id: string;
  asn_no: string | null;
  status: string | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string | null;
  line_no: number | null;
  sku: string | null;
  qty: number | null;
  qty_expected?: number | null;
  po_line_id?: string | null;
};

type GrHeaderRow = {
  id: string;
  asn_id: string | null;
  gr_no: string | null;
  status: string | null;
  created_at?: string | null;
};

type GrLineRow = {
  id: string;
  gr_id: string | null;
  asn_line_id: string | null;
  line_no: number | null;
  sku: string | null;
  qty_expected: number | null;
  qty_received: number | null;
};

function buildGrNo() {
  return `GR-${Date.now()}`;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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

  const asnNoIdx = headers.indexOf("asn_no");
  const lineNoIdx = headers.indexOf("line_no");
  const skuIdx = headers.indexOf("sku");
  const qtyExpectedIdx = headers.indexOf("qty_expected");
  const qtyReceivedIdx = headers.indexOf("qty_received");

  if (asnNoIdx === -1) throw new Error("CSV must include 'asn_no' header");
  if (lineNoIdx === -1) throw new Error("CSV must include 'line_no' header");
  if (qtyReceivedIdx === -1) throw new Error("CSV must include 'qty_received' header");

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);

    const asn_no = String(cols[asnNoIdx] ?? "").trim();
    const line_no = Number(cols[lineNoIdx] ?? 0);

    if (!asn_no || !Number.isFinite(line_no) || line_no <= 0) continue;

    rows.push({
      asn_no,
      line_no,
      sku: skuIdx >= 0 ? String(cols[skuIdx] ?? "").trim() || null : null,
      qty_expected: qtyExpectedIdx >= 0 ? Number(cols[qtyExpectedIdx] ?? 0) : 0,
      qty_received: Number(cols[qtyReceivedIdx] ?? 0),
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

    const inserted: UploadResultRow[] = [];
    const updated: UploadResultRow[] = [];
    const errors: Array<{ asn_no: string; line_no: number; error: string }> = [];

    const headerCache = new Map<
      string,
      { id: string; gr_no: string | null; status: string | null }
    >();

    let lastGrId: string | null = null;
    let lastGrNo: string | null = null;

    for (const row of parsed) {
      try {
        const qtyReceived = safeNum(row.qty_received);

        if (!Number.isFinite(qtyReceived) || qtyReceived < 0) {
          throw new Error("qty_received must be 0 or greater");
        }

        // 1) ASN header lookup by ASN NO
        const { data: asnHeaderRaw, error: asnHeaderErr } = await sb
          .from("asn_header")
          .select("id, asn_no, status")
          .eq("asn_no", row.asn_no)
          .limit(1)
          .maybeSingle();

        if (asnHeaderErr) throw asnHeaderErr;

        const asnHeader = (asnHeaderRaw as AsnHeaderRow | null) ?? null;
        if (!asnHeader) {
          throw new Error(`ASN not found: ${row.asn_no}`);
        }

        // 2) ASN line lookup by asn_id + line_no
        const { data: asnLineRaw, error: asnLineErr } = await sb
          .from("asn_line")
          .select("id, asn_id, line_no, sku, qty, qty_expected, po_line_id")
          .eq("asn_id", asnHeader.id)
          .eq("line_no", row.line_no)
          .limit(1)
          .maybeSingle();

        if (asnLineErr) throw asnLineErr;

        const asnLine = (asnLineRaw as AsnLineRow | null) ?? null;
        if (!asnLine) {
          throw new Error(`ASN line not found: ${row.asn_no} / line ${row.line_no}`);
        }

        if (row.sku && asnLine.sku && row.sku !== asnLine.sku) {
          throw new Error(
            `SKU mismatch for ${row.asn_no} / line ${row.line_no}: CSV=${row.sku}, ASN=${asnLine.sku}`
          );
        }

        // 3) find/create GR header (1 ASN : 1 GR)
        let targetGrHeader = headerCache.get(asnHeader.id);

        if (!targetGrHeader) {
          const { data: grHeadersRaw, error: grHeadersErr } = await sb
            .from("gr_header")
            .select("id, asn_id, gr_no, status, created_at")
            .eq("asn_id", asnHeader.id)
            .order("created_at", { ascending: false });

          if (grHeadersErr) throw grHeadersErr;

          const grHeaders = (grHeadersRaw ?? []) as GrHeaderRow[];

          if (grHeaders.length > 1) {
            throw new Error(
              `Multiple GR headers found for ASN ${asnHeader.asn_no}. ASN must map to exactly one GR.`
            );
          }

          if (grHeaders.length === 1) {
            const existing = grHeaders[0];

            if (String(existing.status || "").toUpperCase() === "CONFIRMED") {
              throw new Error(
                `GR already confirmed for ASN ${asnHeader.asn_no}. Re-upload is not allowed.`
              );
            }

            targetGrHeader = {
              id: existing.id,
              gr_no: existing.gr_no ?? null,
              status: existing.status ?? null,
            };
          } else {
            const grNo = buildGrNo();

            const { data: insertedGrHeader, error: insertGrHeaderErr } = await sb
              .from("gr_header")
              .insert({
                asn_id: asnHeader.id,
                gr_no: grNo,
                status: "PENDING",
              })
              .select("id, gr_no, status")
              .single();

            if (insertGrHeaderErr || !insertedGrHeader?.id) {
              throw new Error(
                insertGrHeaderErr?.message ??
                  `Failed to create GR header for ASN ${asnHeader.asn_no}`
              );
            }

            targetGrHeader = {
              id: insertedGrHeader.id,
              gr_no: insertedGrHeader.gr_no ?? grNo,
              status: insertedGrHeader.status ?? "PENDING",
            };
          }

          if (!targetGrHeader.gr_no) {
            const newGrNo = buildGrNo();

            const { error: patchGrNoErr } = await sb
              .from("gr_header")
              .update({ gr_no: newGrNo })
              .eq("id", targetGrHeader.id);

            if (patchGrNoErr) throw patchGrNoErr;

            targetGrHeader.gr_no = newGrNo;
          }

          headerCache.set(asnHeader.id, targetGrHeader);
        }

        if (String(targetGrHeader.status || "").toUpperCase() === "CONFIRMED") {
          throw new Error(
            `GR already confirmed for ASN ${asnHeader.asn_no}. Re-upload is not allowed.`
          );
        }

        lastGrId = targetGrHeader.id;
        lastGrNo = targetGrHeader.gr_no ?? null;

        // 4) same ASN line -> same GR line
        const { data: existingGrLineRaw, error: grLineErr } = await sb
          .from("gr_line")
          .select("id, gr_id, asn_line_id, line_no, sku, qty_expected, qty_received")
          .eq("gr_id", targetGrHeader.id)
          .eq("asn_line_id", asnLine.id)
          .maybeSingle();

        if (grLineErr) throw grLineErr;

        const existingGrLine = (existingGrLineRaw as GrLineRow | null) ?? null;

        // 5) expected qty resolution
        // 우선순위:
        //  - 기존 gr_line.qty_expected
        //  - asn_line.qty
        //  - asn_line.qty_expected (레거시 fallback)
        //  - csv.qty_expected
        const expected = safeNum(
          existingGrLine?.qty_expected ??
            asnLine.qty ??
            asnLine.qty_expected ??
            row.qty_expected
        );

        if (expected <= 0) {
          throw new Error(
            `Invalid expected qty (0) for ASN ${row.asn_no} line ${row.line_no}. Check ASN data.`
          );
        }

        if (qtyReceived > expected) {
          throw new Error(
            `qty_received (${qtyReceived}) cannot exceed qty_expected (${expected})`
          );
        }

        const payload = {
          gr_id: targetGrHeader.id,
          asn_line_id: asnLine.id,
          po_line_id: asnLine.po_line_id ?? null,
          line_no: Number(asnLine.line_no || row.line_no),
          sku: asnLine.sku,
          qty: qtyReceived,
          qty_expected: expected,
          qty_received: qtyReceived,
        };

        if (existingGrLine?.id) {
          const { error: updateErr } = await sb
            .from("gr_line")
            .update(payload)
            .eq("id", existingGrLine.id);

          if (updateErr) throw updateErr;

          updated.push({
            asn_no: row.asn_no,
            line_no: row.line_no,
            sku: asnLine.sku,
            gr_id: targetGrHeader.id,
            gr_no: targetGrHeader.gr_no,
          });
        } else {
          const { error: insertErr } = await sb
            .from("gr_line")
            .insert(payload);

          if (insertErr) throw insertErr;

          inserted.push({
            asn_no: row.asn_no,
            line_no: row.line_no,
            sku: asnLine.sku,
            gr_id: targetGrHeader.id,
            gr_no: targetGrHeader.gr_no,
          });
        }

        // ASN 상태는 confirm 단계에서 재계산하므로 여기서는 유지
      } catch (e: any) {
        errors.push({
          asn_no: row.asn_no,
          line_no: row.line_no,
          error: e?.message ?? String(e),
        });
      }
    }

    const grs = Array.from(headerCache.entries()).map(([asn_id, header]) => ({
      asn_id,
      gr_id: header.id,
      gr_no: header.gr_no,
      status: header.status,
    }));

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
      gr_id: lastGrId,
      gr_no: lastGrNo,
      grs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}