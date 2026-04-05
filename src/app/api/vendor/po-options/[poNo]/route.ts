import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    poNo: string;
  }>;
};

async function getAuthorizedVendorUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("vendor_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile?.vendor_id) {
    return { ok: false as const, status: 403, error: "No vendor_id" };
  }

  return {
    ok: true as const,
    supabase,
    vendorId: profile.vendor_id as string,
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

  const { supabase } = auth;
  const { poNo } = await context.params;

  try {
    const { data: header, error: headerError } = await supabase
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta, created_at")
      .eq("po_no", decodeURIComponent(poNo))
      .maybeSingle();

    if (headerError) {
      throw new Error(headerError.message);
    }

    if (!header) {
      return NextResponse.json(
        { ok: false, error: "PO not found" },
        { status: 404 }
      );
    }

    const { data: lines, error: linesError } = await supabase
      .from("po_line")
      .select("id, po_id, sku, qty, qty_ordered, created_at")
      .eq("po_id", header.id)
      .order("created_at", { ascending: true });

    if (linesError) {
      throw new Error(linesError.message);
    }

    const normalizedLines = (lines ?? []).map((line) => ({
      id: line.id,
      sku: line.sku,
      qty_ordered: Number(line.qty_ordered ?? line.qty ?? 0),
    }));

    const totalQty = normalizedLines.reduce(
      (sum, line) => sum + Number(line.qty_ordered ?? 0),
      0
    );

    return NextResponse.json({
      ok: true,
      header: {
        po_no: header.po_no,
        vendor: header.vendor_id,
        status: header.status,
        eta: header.eta,
        created_at: header.created_at,
      },
      lines: normalizedLines,
      summary: {
        line_count: normalizedLines.length,
        total_qty: totalQty,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}