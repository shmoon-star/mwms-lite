import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PackingListHeaderRow = {
  id: string;
  pl_no: string | null;
  po_no: string | null;
  eta: string | null;
  vendor_id: string | null;
  status: string | null;
  asn_id?: string | null;
};

type PackingListLineRow = {
  id: string;
  line_no: number | null;
  sku: string | null;
  qty: number | null;
  carton_no: string | null;
};

function buildAsnNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `ASN-${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sb = await createClient();
    const now = new Date().toISOString();

    const { data: plHeaderRaw, error: plHeaderErr } = await sb
      .from("packing_list_header")
      .select("id, pl_no, po_no, eta, vendor_id, status, asn_id")
      .eq("id", id)
      .single();

    if (plHeaderErr || !plHeaderRaw) {
      return NextResponse.json(
        { ok: false, error: "Packing List not found" },
        { status: 404 }
      );
    }

    const plHeader = plHeaderRaw as PackingListHeaderRow;

    if (plHeader.asn_id) {
      const { data: existingAsn } = await sb
        .from("asn_header")
        .select("id, asn_no, status, vendor_id")
        .eq("id", plHeader.asn_id)
        .maybeSingle();

      if (existingAsn) {
        return NextResponse.json({
          ok: true,
          already_exists: true,
          asn: existingAsn,
        });
      }
    }

    const { data: plLinesRaw, error: plLinesErr } = await sb
      .from("packing_list_lines")
      .select("id, line_no, sku, qty, carton_no")
      .eq("packing_list_id", id)
      .order("line_no", { ascending: true });

    if (plLinesErr) {
      return NextResponse.json(
        { ok: false, error: plLinesErr.message },
        { status: 500 }
      );
    }

    const plLines = (plLinesRaw ?? []) as PackingListLineRow[];

    if (plLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Packing List lines not found" },
        { status: 400 }
      );
    }

    const asnNo = buildAsnNo();

    const { data: insertedAsn, error: asnHeaderErr } = await sb
      .from("asn_header")
      .insert({
        asn_no: asnNo,
        po_no: plHeader.po_no ?? null,
        eta: plHeader.eta ?? null,
        vendor_id: plHeader.vendor_id ?? null,
        status: "OPEN",
        source_type: "PACKING_LIST",
        source_id: plHeader.id,
        created_at: now,
        updated_at: now,
      })
      .select("id, asn_no, status, vendor_id")
      .single();

    if (asnHeaderErr || !insertedAsn) {
      return NextResponse.json(
        { ok: false, error: asnHeaderErr?.message ?? "Failed to create ASN header" },
        { status: 500 }
      );
    }

    const rows = plLines.map((line, idx) => ({
      asn_id: insertedAsn.id,
      line_no: Number(line.line_no ?? idx + 1),
      sku: line.sku,
      qty: safeNum(line.qty),
      qty_received: 0,
      carton_no: line.carton_no ?? null,
      created_at: now,
      updated_at: now,
    }));

    const { error: lineInsertErr } = await sb
      .from("asn_line")
      .insert(rows);

    if (lineInsertErr) {
      await sb.from("asn_header").delete().eq("id", insertedAsn.id);

      return NextResponse.json(
        { ok: false, error: lineInsertErr.message },
        { status: 500 }
      );
    }

    const { error: plUpdateErr } = await sb
      .from("packing_list_header")
      .update({
        asn_id: insertedAsn.id,
        asn_no: insertedAsn.asn_no,
        updated_at: now,
      })
      .eq("id", plHeader.id);

    if (plUpdateErr) {
      return NextResponse.json(
        { ok: false, error: plUpdateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      asn: insertedAsn,
      inserted_line_count: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}