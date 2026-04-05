import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CreateVendorUserBody = {
  email?: string;
  user_name?: string;
  role?: "vendor_admin" | "vendor_user";
  initial_password?: string;
  status?: "ACTIVE" | "INACTIVE" | "LOCKED";
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string) {
  return password.length >= 8;
}

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
  };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase } = auth;

  try {
    const { id: vendorId } = await context.params;

    const { data: vendor_id, error: vendorError } = await supabase
      .from("vendor")
      .select("id, vendor_code, vendor_name, brand_name, status")
      .eq("id", vendorId)
      .single();

    if (vendorError || !vendor) {
      return NextResponse.json(
        { ok: false, error: "Vendor not found" },
        { status: 404 }
      );
    }

    const { data: users, error: usersError } = await supabase
      .from("vendor_users")
      .select(`
        id,
        vendor_id,
        auth_user_id,
        email,
        user_name,
        role,
        status,
        first_login_at,
        last_login_at,
        created_by,
        created_at,
        updated_at
      `)
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });

    if (usersError) {
      return NextResponse.json(
        { ok: false, error: usersError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        vendor_id,
        items: users ?? [],
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

export async function POST(req: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const admin = createAdminClient();

  try {
    const { id: vendorId } = await context.params;

    if (!vendorId) {
      return NextResponse.json(
        { ok: false, error: "vendorId is required" },
        { status: 400 }
      );
    }

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

    const { data: myProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("auth_user_id, user_type, role, status")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !myProfile) {
      return NextResponse.json(
        { ok: false, error: "User profile not found" },
        { status: 403 }
      );
    }

    const isInternalAdmin =
      myProfile.user_type === "internal" &&
      (myProfile.role === "internal_admin" ||
        myProfile.role === "internal_operator") &&
      myProfile.status === "ACTIVE";

    if (!isInternalAdmin) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data: vendor_id, error: vendorError } = await supabase
      .from("vendor")
      .select("id, vendor_code, vendor_name, status")
      .eq("id", vendorId)
      .single();

    if (vendorError || !vendor) {
      return NextResponse.json(
        { ok: false, error: "Vendor not found" },
        { status: 404 }
      );
    }

    if (vendor.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "Vendor is not ACTIVE" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as CreateVendorUserBody;

    const email = body.email?.trim().toLowerCase() ?? "";
    const userName = body.user_name?.trim() ?? "";
    const role = body.role ?? "vendor_user";
    const initialPassword = body.initial_password ?? "";
    const status = body.status ?? "ACTIVE";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Valid email is required" },
        { status: 400 }
      );
    }

    if (!userName) {
      return NextResponse.json(
        { ok: false, error: "user_name is required" },
        { status: 400 }
      );
    }

    if (!["vendor_admin", "vendor_user"].includes(role)) {
      return NextResponse.json(
        { ok: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    if (!validatePassword(initialPassword)) {
      return NextResponse.json(
        {
          ok: false,
          error: "initial_password must be at least 8 characters",
        },
        { status: 400 }
      );
    }

    const { data: existingVendorUser, error: existingVendorUserError } =
      await supabase
        .from("vendor_users")
        .select("id, email, vendor_id")
        .eq("email", email)
        .maybeSingle();

    if (existingVendorUserError) {
      return NextResponse.json(
        { ok: false, error: existingVendorUserError.message },
        { status: 500 }
      );
    }

    if (existingVendorUser) {
      return NextResponse.json(
        { ok: false, error: "Email already exists in vendor_users" },
        { status: 409 }
      );
    }

    const { data: createdAuth, error: createAuthError } =
      await admin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          display_name: userName,
          user_type: "vendor",
          role,
          vendor_id: vendorId,
        },
      });

    if (createAuthError || !createdAuth.user) {
      return NextResponse.json(
        {
          ok: false,
          error: createAuthError?.message ?? "Failed to create auth user",
        },
        { status: 500 }
      );
    }

    const authUserId = createdAuth.user.id;

    const { data: insertedVendorUser, error: vendorUserInsertError } =
      await supabase
        .from("vendor_users")
        .insert({
          vendor_id: vendorId,
          auth_user_id: authUserId,
          email,
          user_name: userName,
          role,
          status,
          created_by: user.id,
        })
        .select(
          `
          id,
          vendor_id,
          auth_user_id,
          email,
          user_name,
          role,
          status,
          first_login_at,
          last_login_at,
          created_by,
          created_at,
          updated_at
        `
        )
        .single();

    if (vendorUserInsertError || !insertedVendorUser) {
      await admin.auth.admin.deleteUser(authUserId);

      return NextResponse.json(
        {
          ok: false,
          error: vendorUserInsertError?.message ?? "Failed to insert vendor_users",
        },
        { status: 500 }
      );
    }

    const { error: profileInsertError } = await supabase
      .from("user_profiles")
      .insert({
        auth_user_id: authUserId,
        user_type: "vendor",
        role,
        vendor_id: vendorId,
        display_name: userName,
        email,
        status,
      });

    if (profileInsertError) {
      await supabase.from("vendor_users").delete().eq("id", insertedVendorUser.id);
      await admin.auth.admin.deleteUser(authUserId);

      return NextResponse.json(
        { ok: false, error: profileInsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Vendor user created successfully",
        vendor: {
          id: vendor.id,
          vendor_code: vendor.vendor_code,
          vendor_name: vendor.vendor_name,
        },
        user: insertedVendorUser,
        login: {
          email,
          temporary_password: initialPassword
          },
      },
      { status: 201 }
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