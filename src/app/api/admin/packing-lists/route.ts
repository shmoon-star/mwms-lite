import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAuthorizedAdmin() {
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
    .select("auth_user_id, user_type, role, status")
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

  const isAdmin =
    profile.user_type === "internal" &&
    (profile.role === "internal_admin" ||
      profile.role === "internal_operator") &&
    profile.status === "ACTIVE";

  if (!isAdmin) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Forbidden",
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    profile,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase } = auth;

  try {
    const { searchParams } = new URL(req.url);

    const vendorId = searchParams.get("vendor_id")?.trim() || "";
    const plNo = searchParams.get("pl_no")?.trim() || "";
    const poNo = searchParams.get("po_no")?.trim() || "";
    const asnNo = searchParams.get("asn_no")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("page_size") || 20), 1),
      100
    );

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("packing_list_header")
      .select(
        `
        *,
        vendor:vendor_id (
          id,
          vendor_code,
          vendor_name,
          brand_name
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (vendorId) query = query.eq("vendor_id", vendorId);
    if (plNo) query = query.ilike("pl_no", `%${plNo}%`);
    if (poNo) query = query.ilike("po_no", `%${poNo}%`);
    if (asnNo) query = query.ilike("asn_no", `%${asnNo}%`);

    if (
      status &&
      ["DRAFT", "SUBMITTED", "REVIEWED", "CONFIRMED", "CANCELED"].includes(status)
    ) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        items: data ?? [],
        pagination: {
          page,
          page_size: pageSize,
          total: count ?? 0,
          total_pages: Math.max(Math.ceil((count ?? 0) / pageSize), 1),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}