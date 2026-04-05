import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("po_header")
      .select("id, po_no, vendor_id, eta, status, created_at")
      .eq("id", id)
      .single();

    if (hErr) throw hErr;

    let vendor: any = null;

    if (header?.vendor_id) {
      const { data: vendorRow, error: vErr } = await sb
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .eq("id", header.vendor_id)
        .maybeSingle();

      if (vErr) throw vErr;
      vendor = vendorRow ?? null;
    }

    const { data: lines, error: lErr } = await sb
      .from("po_line")
      .select("id, po_id, sku, qty, qty_ordered, created_at")
      .eq("po_id", id)
      .order("created_at", { ascending: true });

    if (lErr) throw lErr;

    return NextResponse.json({
      ok: true,
      po: {
        id: header.id,
        po_no: header.po_no,
        vendor_id: header.vendor_id,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        vendor:
          vendor?.vendor_code ??
          vendor?.vendor_name ??
          header.vendor_id ??
          null,
        eta: header.eta,
        status: header.status,
        created_at: header.created_at,
        lines: lines ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}