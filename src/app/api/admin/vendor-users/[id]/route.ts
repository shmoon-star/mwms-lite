import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateVendorUserBody = {
  user_name?: string;
  role?: "vendor_admin" | "vendor_user";
  status?: "ACTIVE" | "INACTIVE" | "LOCKED";
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

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  try {
    const { id } = await context.params;
    const body = (await req.json()) as UpdateVendorUserBody;

    const userName = body.user_name?.trim();
    const role = body.role;
    const status = body.status;

    if (role && !["vendor_admin", "vendor_user"].includes(role)) {
      return NextResponse.json(
        { ok: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    if (status && !["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (userName !== undefined) updatePayload.user_name = userName;
    if (role !== undefined) updatePayload.role = role;
    if (status !== undefined) updatePayload.status = status;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: updatedVendorUser, error: updateError } = await supabase
      .from("vendor_users")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedVendorUser) {
      return NextResponse.json(
        { ok: false, error: updateError?.message ?? "Vendor user not found" },
        { status: 404 }
      );
    }

    const profileUpdatePayload: Record<string, unknown> = {};
    if (userName !== undefined) profileUpdatePayload.display_name = userName;
    if (role !== undefined) profileUpdatePayload.role = role;
    if (status !== undefined) profileUpdatePayload.status = status;

    if (Object.keys(profileUpdatePayload).length > 0) {
      const { error: profileUpdateError } = await supabase
        .from("user_profiles")
        .update(profileUpdatePayload)
        .eq("auth_user_id", updatedVendorUser.auth_user_id);

      if (profileUpdateError) {
        return NextResponse.json(
          { ok: false, error: profileUpdateError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Vendor user updated successfully",
        user: updatedVendorUser,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}