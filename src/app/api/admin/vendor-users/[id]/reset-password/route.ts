import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ResetPasswordBody = {
  temporary_password?: string;
};

async function getAuthorizedAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, status: 401, supabase, error: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false as const, status: 403, supabase, error: "User profile not found" };
  }

  const isAdmin =
    profile.user_type === "internal" &&
    (profile.role === "internal_admin" || profile.role === "internal_operator") &&
    profile.status === "ACTIVE";

  if (!isAdmin) {
    return { ok: false as const, status: 403, supabase, error: "Forbidden" };
  }

  return { ok: true as const, supabase, user };
}

function validatePassword(password: string) {
  return password.length >= 8;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const admin = createAdminClient();

  try {
    const { id } = await context.params;
    const body = (await req.json()) as ResetPasswordBody;

    const temporaryPassword = body.temporary_password?.trim() ?? "";

    if (!validatePassword(temporaryPassword)) {
      return NextResponse.json(
        { ok: false, error: "temporary_password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const { data: vendorUser, error: vendorUserError } = await supabase
      .from("vendor_users")
      .select("id, auth_user_id, email")
      .eq("id", id)
      .single();

    if (vendorUserError || !vendorUser) {
      return NextResponse.json(
        { ok: false, error: "Vendor user not found" },
        { status: 404 }
      );
    }

    if (!vendorUser.auth_user_id) {
      return NextResponse.json(
        { ok: false, error: "auth_user_id is missing" },
        { status: 400 }
      );
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      vendorUser.auth_user_id,
      {
        password: temporaryPassword,
      }
    );

    if (authUpdateError) {
      return NextResponse.json(
        { ok: false, error: authUpdateError.message },
        { status: 500 }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}