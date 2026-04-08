// src/app/api/asn/from-po/[poId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUserProfile,
  getCurrentVendorInfo,
  assertVendorCodeAccess,
} from "@/lib/authz";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    poId: string;
  }>;
};

function makeAsnNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `ASN-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const sb = await createClient();
    const me = await getCurrentUserProfile();
    const myVendor = await getCurrentVendorInfo(me);
    const { poId } = await context.params;

    const { data: po, error: poError } = await sb
      .from("po_header")
      .select(`
        id,
        po_no,
        vendor_id,
        status,
        eta
      `)
      .eq("id", poId)
      .single();

    if (poError || !po) {
      return NextResponse.json(
        { ok: false, message: "PO not found" },
        { status: 404 }
      );
    }

    assertVendorCodeAccess(me, myVendor?.vendor_code, po.vendor_id);

    const { data: poVendor, error: poVendorError } = await sb
      .from("vendor")
      .select("id, vendor_code, vendor_name")
      .eq("vendor_code", po.vendor_id)
      .single();

    if (poVendorError || !poVendor) {
      throw new Error("PO vendor master not found");
    }

    const { data: poLines, error: poLineError } = await sb
      .from("po_line")
      .select(`
        id,
        po_id,
        sku,
        qty_ordered
      `)
      .eq("po_id", po.id)
      .order("id", { ascending: true });

    if (poLineError) throw poLineError;

    if (!poLines || poLines.length === 0) {
      return NextResponse.json(
        { ok: false, message: "PO lines not found" },
        { status: 400 }
      );
    }

    const { data: existingAsn, error: existingAsnError } = await sb
      .from("asn_header")
      .select("id, asn_no, status")
      .eq("po_id", po.id)
      .limit(1);

    if (existingAsnError) throw existingAsnError;

    if (existingAsn && existingAsn.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "ASN already exists for this PO",
          data: existingAsn[0],
        },
        { status: 409 }
      );
    }

    const asnNo = makeAsnNo();

    const { data: asnHeader, error: asnHeaderError } = await sb
      .from("asn_header")
      .insert({
        asn_no: asnNo,
        po_id: po.id,
        po_no: po.po_no,
        vendor_id: poVendor.id,
        status: "OPEN",
      })
      .select()
      .single();

    if (asnHeaderError || !asnHeader) {
      throw asnHeaderError || new Error("Failed to create ASN header");
    }

    const asnLinesPayload = poLines.map((line) => ({
      asn_id: asnHeader.id,
      po_line_id: line.id,
      sku: line.sku,
      qty_expected: line.qty_ordered ?? 0,
      qty_received: 0,
    }));

    const { error: asnLinesError } = await sb
      .from("asn_line")
      .insert(asnLinesPayload);

    if (asnLinesError) throw asnLinesError;

    if (po.status === "DRAFT" || po.status === "OPEN") {
      const { error: poUpdateError } = await sb
        .from("po_header")
        .update({ status: "ASN_CREATED" })
        .eq("id", po.id);

      if (poUpdateError) throw poUpdateError;
    }

    return NextResponse.json({
      ok: true,
      message: "ASN created successfully",
      data: {
        id: asnHeader.id,
        asn_no: asnHeader.asn_no,
        po_id: asnHeader.po_id,
        po_no: asnHeader.po_no,
        vendor_id: asnHeader.vendor_id,
        status: asnHeader.status,
      },
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to create ASN";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      500;

    return NextResponse.json(
      { ok: false, message: msg },
      { status }
    );
  }
}