import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sb = await createClient();

    const { data: header, error } = await sb
      .from("shipment_header")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !header) {
      return NextResponse.json(
        { ok: false, error: error?.message || "shipment not found" },
        { status: 404 }
      );
    }

    const headers = [
      "shipment_no",
      "status",
      "bl_no",
      "etd",
      "eta",
      "atd",
      "ata",
      "buyer_gr_date",
      "vessel_name",
      "container_no",
      "seal_no",
      "remark",
      "created_at",
      "updated_at",
      "closed_at",
      "cancelled_at",
    ];

    const row = [
      header.shipment_no,
      header.status,
      header.bl_no,
      header.etd,
      header.eta,
      header.atd,
      header.ata,
      header.buyer_gr_date,
      header.vessel_name,
      header.container_no,
      header.seal_no,
      header.remark,
      header.created_at,
      header.updated_at,
      header.closed_at,
      header.cancelled_at,
    ];

    const csv = [headers.join(","), row.map(csvEscape).join(",")].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="shipment_header_${header.shipment_no}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected error" },
      { status: 500 }
    );
  }
}