import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ asnId: string }>;
};

type AsnLineRow = {
  id: string;
  line_no: number | null;
  sku: string | null;
  qty: number | null;
  qty_received: number | null;
};

function buildGrNo() {
  const now = new Date();
  return `GR-${now.getTime()}`;
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { asnId } = await ctx.params;
    const sb = await createClient();
    const now = new Date().toISOString();

    const { data: asnHeader, error: asnErr } = await sb
      .from("asn_header")
      .select("id, asn_no, status")
      .eq("id", asnId)
      .single();

    if (asnErr || !asnHeader) {
      return NextResponse.json(
        { ok: false, error: "ASN not found" },
        { status: 404 }
      );
    }

    const { data: asnLinesRaw, error: lineErr } = await sb
      .from("asn_line")
      .select("id, line_no, sku, qty, qty_received")
      .eq("asn_id", asnId)
      .order("line_no", { ascending: true });

    if (lineErr) {
      throw lineErr;
    }

    const asnLines = (asnLinesRaw ?? []) as AsnLineRow[];

    if (asnLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No ASN lines" },
        { status: 400 }
      );
    }

    const invalidLine = asnLines.find(
      (line) => !line.sku || Number(line.qty ?? 0) <= 0
    );

    if (invalidLine) {
      return NextResponse.json(
        { ok: false, error: "ASN contains invalid lines" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingErr } = await sb
      .from("gr_header")
      .select("id, gr_no")
      .eq("asn_id", asnId)
      .maybeSingle();

    if (existingErr) {
      throw existingErr;
    }

    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        created: false,
        message: "GR already exists",
        gr_id: existing.id,
        gr_no: existing.gr_no,
      });
    }

    const grNo = buildGrNo();

    const { data: grHeader, error: grHeaderErr } = await sb
      .from("gr_header")
      .insert({
        asn_id: asnId,
        gr_no: grNo,
        status: "PENDING",
        created_at: now,
      })
      .select("id, gr_no")
      .single();

    if (grHeaderErr || !grHeader) {
      throw grHeaderErr;
    }

    const grLines = asnLines.map((line, idx) => ({
      gr_id: grHeader.id,
      line_no: line.line_no ?? idx + 1,
      asn_line_id: line.id,
      sku: line.sku,
      qty: 0,
      qty_expected: Number(line.qty ?? 0),
      qty_received: Number(line.qty_received ?? 0),
      created_at: now,
    }));

    const { error: grLineErr } = await sb
      .from("gr_line")
      .insert(grLines);

    if (grLineErr) {
      await sb.from("gr_header").delete().eq("id", grHeader.id);

      return NextResponse.json(
        { ok: false, error: grLineErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      gr_id: grHeader.id,
      gr_no: grHeader.gr_no,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}