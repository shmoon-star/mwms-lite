import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChangePasswordBody = {
  new_password?: string;
};

function validatePassword(password: string) {
  return password.length >= 8;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as ChangePasswordBody;
    const newPassword = body.new_password?.trim() ?? "";

    if (!validatePassword(newPassword)) {
      return NextResponse.json(
        {
          ok: false,
          error: "new_password must be at least 8 characters",
        },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("auth_user_id, user_type, role, vendor_id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { ok: false, error: "User profile not found" },
        { status: 403 }
      );
    }

    if (profile.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "User is not ACTIVE" },
        { status: 403 }
      );
    }

    const { error: updateAuthError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateAuthError) {
      return NextResponse.json(
        { ok: false, error: updateAuthError.message },
        { status: 500 }
      );
    }

    if (profile.user_type === "vendor") {
      const { data: vendorUser, error: vendorUserError } = await supabase
        .from("vendor_users")
        .select("id, first_login_at")
        .eq("auth_user_id", user.id)
        .single();

      if (vendorUserError || !vendorUser) {
        return NextResponse.json(
          { ok: false, error: "Vendor user not found" },
          { status: 404 }
        );
      }

      const now = new Date().toISOString();

      const updatePayload: Record<string, unknown> = {
        last_login_at: now,
      };

      if (!vendorUser.first_login_at) {
        updatePayload.first_login_at = now;
      }

      const { error: updateVendorUserError } = await supabase
        .from("vendor_users")
        .update(updatePayload)
        .eq("id", vendorUser.id);

      if (updateVendorUserError) {
        return NextResponse.json(
          { ok: false, error: updateVendorUserError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Password changed successfully",
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