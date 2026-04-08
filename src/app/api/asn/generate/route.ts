import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function buildAsnNo() {
  return `ASN-${Date.now()}`;
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient();
    const body = await req.json();
    const poId = String(body?.poId ?? "").trim();

    if (!poId) {
      return NextResponse.json(
        { ok: false, error: "poId is required" },
        { status: 400 }
      );
    }

    const { data: poHeader, error: poHeaderErr } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, status, created_at")
      .eq("id", poId)
      .single();

    if (poHeaderErr) throw poHeaderErr;

    if (!poHeader?.id) {
      return NextResponse.json(
        { ok: false, error: "PO not found" },
        { status: 404 }
      );
    }

    const { data: existingAsn, error: existingAsnErr } = await sb
      .from("asn_header")
      .select("id, po_id, asn_no, status, created_at")
      .eq("po_id", poId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAsnErr) throw existingAsnErr;

    if (existingAsn?.id) {
      const nextPoStatus =
        poHeader.status === "RECEIVED" ? "RECEIVED" : "ASN_CREATED";

      const { error: poUpdErr } = await sb
        .from("po_header")
        .update({
          status: nextPoStatus,
        })
        .eq("id", poId);

      if (poUpdErr) throw poUpdErr;

      return NextResponse.json(
        {
          ok: false,
          error: "ASN already exists for this PO",
          existing_asn_id: existingAsn.id,
          existing_asn_no: existingAsn.asn_no,
          po_status_fixed_to: nextPoStatus,
        },
        { status: 409 }
      );
    }

    const { data: poLines, error: poLinesErr } = await sb
      .from("po_line")
      .select("id, po_id, sku, qty, qty_ordered, created_at")
      .eq("po_id", poId)
      .order("created_at", { ascending: true });

    if (poLinesErr) throw poLinesErr;

    if (!poLines || poLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "PO lines not found" },
        { status: 400 }
      );
    }

    const asnNo = buildAsnNo();

    const { data: insertedAsn, error: insertAsnErr } = await sb
      .from("asn_header")
      .insert({
        po_id: poId,
        asn_no: asnNo,
        status: "CREATED",
      })
      .select("id, po_id, asn_no, status, created_at")
      .single();

    if (insertAsnErr) throw insertAsnErr;

    if (!insertedAsn?.id) {
      throw new Error("Failed to create ASN header");
    }

    const asnLinePayload = poLines
      .map((line: any, idx: number) => {
        const ordered = Number(line.qty_ordered ?? 0);

        return {
          asn_id: insertedAsn.id,
          po_line_id: line.id,
          line_no: idx + 1,
          sku: line.sku,
          qty: 0,
          qty_expected: ordered,
        };
      })
      .filter((line: any) => Number(line.qty_expected) > 0);

    if (asnLinePayload.length === 0) {
      throw new Error("No valid PO lines with qty_ordered > 0");
    }

    const { error: insertAsnLinesErr } = await sb
      .from("asn_line")
      .insert(asnLinePayload);

    if (insertAsnLinesErr) {
      await sb.from("asn_header").delete().eq("id", insertedAsn.id);
      throw insertAsnLinesErr;
    }

    const { error: poStatusErr } = await sb
      .from("po_header")
      .update({
        status: "ASN_CREATED",
      })
      .eq("id", poId);

    if (poStatusErr) throw poStatusErr;

    return NextResponse.json({
      ok: true,
      asn: insertedAsn,
      inserted_line_count: asnLinePayload.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}