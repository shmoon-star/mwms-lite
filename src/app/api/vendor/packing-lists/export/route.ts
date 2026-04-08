import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "User profile not found",
    };
  }

  const isVendorUser =
    profile.user_type === "VENDOR" &&
    (profile.role === "vendor_admin" || profile.role === "vendor_user") &&
    profile.status === "ACTIVE" &&
    !!profile.vendor_id;

  if (!isVendorUser) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Forbidden",
    };
  }

  const { data: vendorUser, error: vendorUserError } = await supabase
    .from("vendor_users")
    .select("id, vendor_id, auth_user_id, email, user_name, role, status")
    .eq("auth_user_id", user.id)
    .single();

  if (vendorUserError || !vendorUser) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Vendor user not found",
    };
  }

  if (vendorUser.status !== "ACTIVE") {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Vendor user is not ACTIVE",
    };
  }

  return {
    ok: true as const,
    supabase,
    vendorId: profile.vendor_id as string,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthorizedVendorUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, vendorId } = auth;

  try {
    const { searchParams } = new URL(req.url);

    const plNo = searchParams.get("pl_no")?.trim() || "";
    const poNo = searchParams.get("po_no")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    let query = supabase
      .from("packing_list_header")
      .select("pl_no, po_no, eta, total_qty, status, created_at, updated_at, remarks")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });

    if (plNo) query = query.ilike("pl_no", `%${plNo}%`);
    if (poNo) query = query.ilike("po_no", `%${poNo}%`);

    if (
      status &&
      ["DRAFT", "CONFIRMED", "CANCELED"].includes(status)
    ) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const headers = [
      "PL No",
      "PO No",
      "ETA",
      "Total Qty",
      "Status",
      "Created At",
      "Updated At",
      "Remarks",
    ];

    const rows = (data ?? []).map((item) => [
      escapeCsv(item.pl_no),
      escapeCsv(item.po_no),
      escapeCsv(item.eta),
      escapeCsv(item.total_qty ?? 0),
      escapeCsv(item.status),
      escapeCsv(item.created_at),
      escapeCsv(item.updated_at),
      escapeCsv(item.remarks),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="packing-list-ledger.csv"`,
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