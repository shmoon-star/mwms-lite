import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getAuthorizedVendorUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      supabase,
      error: "Unauthorized",
    };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("vendor_id")
    .eq("auth_user_id", user.id)
    .single();

  return {
    ok: true as const,
    supabase,
    vendorId: profile?.vendor_id as string,
  };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedVendorUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, vendorId } = auth;
  const { id } = await context.params;

  // header 확인
  const { data: header } = await supabase
    .from("packing_list_header")
    .select("pl_no, vendor_id")
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .single();

  if (!header) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 }
    );
  }

  const { data: lines } = await supabase
    .from("packing_list_lines")
    .select(`
      line_no,
      sku,
      description,
      qty,
      carton_no,
      po_no,
      style_code,
      color,
      size
    `)
    .eq("packing_list_id", id)
    .order("line_no");

  const skuList = (lines ?? []).map((l: any) => l.sku).filter(Boolean);
  const productMaster = await loadProductsBySkus(skuList, supabase);

  const headers = [
    "line_no",
    "sku",
    "barcode",
    "description",
    "qty",
    "carton_no",
    "po_no",
    "style_code",
    "color",
    "size",
  ];

  const rows = (lines ?? []).map((l) => [
    escapeCsv(l.line_no),
    escapeCsv(l.sku),
    escapeCsv(productMaster.barcodeOf(l.sku) ?? ""),
    escapeCsv(l.description),
    escapeCsv(l.qty),
    escapeCsv(l.carton_no),
    escapeCsv(l.po_no),
    escapeCsv(l.style_code),
    escapeCsv(l.color),
    escapeCsv(l.size),
  ]);

  const csv =
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${header.pl_no}-lines.csv"`,
    },
  });
}