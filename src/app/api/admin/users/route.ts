import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getAuthorizedAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, status: 401, supabase, error: "Unauthorized" };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, status")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return { ok: false as const, status: 403, supabase, error: "Profile not found" };
  }

  // internal admin/operator OR legacy ADMIN role
  const isAdmin =
    (profile.user_type === "internal" &&
      (profile.role === "internal_admin" || profile.role === "internal_operator")) ||
    profile.role === "ADMIN";

  if (!isAdmin || (profile.status && profile.status !== "ACTIVE")) {
    return { ok: false as const, status: 403, supabase, error: `Forbidden (user_type=${profile.user_type}, role=${profile.role}, status=${profile.status})` };
  }

  return { ok: true as const, supabase, user };
}

/** GET — 전체 유저 목록 */
export async function GET() {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  try {
    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // vendor / buyer 이름 조회
    const vendorIds = [...new Set((users ?? []).map((u: any) => u.vendor_id).filter(Boolean))];
    const buyerIds = [...new Set((users ?? []).map((u: any) => u.buyer_id).filter(Boolean))];

    const vendorMap = new Map<string, any>();
    const buyerMap = new Map<string, any>();

    if (vendorIds.length > 0) {
      const { data: vendors } = await supabase
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);
      for (const v of vendors ?? []) vendorMap.set(v.id, v);
    }

    if (buyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from("buyer")
        .select("id, buyer_code, buyer_name")
        .in("id", buyerIds);
      for (const b of buyers ?? []) buyerMap.set(b.id, b);
    }

    const items = (users ?? []).map((u: any) => ({
      ...u,
      vendor_name: vendorMap.get(u.vendor_id)?.vendor_name ?? null,
      vendor_code: vendorMap.get(u.vendor_id)?.vendor_code ?? null,
      buyer_name: buyerMap.get(u.buyer_id)?.buyer_name ?? null,
      buyer_code: buyerMap.get(u.buyer_id)?.buyer_code ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

/** POST — 유저 생성 (Supabase Auth + user_profiles) */
export async function POST(req: NextRequest) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase, user: adminUser } = auth;
  const admin = createAdminClient();

  try {
    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim();
    const userType = String(body.user_type ?? "").trim(); // internal / vendor / buyer / wms
    const subRole = String(body.role ?? "").trim(); // internal_admin, vendor_user, etc.
    const password = String(body.password ?? "").trim();
    const vendorId = body.vendor_id || null;
    const buyerId = body.buyer_id || null;

    // user_type → DB role 매핑 (user_profiles_role_check constraint)
    const roleMap: Record<string, string> = {
      internal: "ADMIN",
      vendor: "VENDOR",
      buyer: "BUYER",
      wms: "WMS",
    };
    const dbRole = roleMap[userType] || "VENDOR";

    // validation
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "display_name is required" }, { status: 400 });
    }
    if (!["internal", "vendor", "buyer", "wms"].includes(userType)) {
      return NextResponse.json({ ok: false, error: "user_type must be internal/vendor/buyer/wms" }, { status: 400 });
    }
    if (!subRole) {
      return NextResponse.json({ ok: false, error: "role is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (userType === "vendor" && !vendorId) {
      return NextResponse.json({ ok: false, error: "vendor_id is required for vendor users" }, { status: 400 });
    }
    if (userType === "buyer" && !buyerId) {
      return NextResponse.json({ ok: false, error: "buyer_id is required for buyer users" }, { status: 400 });
    }

    // 이메일 중복 체크
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: false, error: "Email already exists" }, { status: 409 });
    }

    // 1. Supabase Auth 유저 생성
    const { data: createdAuth, error: createAuthError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          user_type: userType,
          role: dbRole,
          sub_role: subRole,
        },
      });

    if (createAuthError || !createdAuth.user) {
      return NextResponse.json(
        { ok: false, error: createAuthError?.message ?? "Failed to create auth user" },
        { status: 500 }
      );
    }

    const authUserId = createdAuth.user.id;

    // 2. user_profiles 레코드 생성
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        auth_user_id: authUserId,
        email,
        display_name: displayName,
        user_type: userType,
        role: dbRole,
        vendor_id: vendorId,
        buyer_id: buyerId,
        status: "ACTIVE",
      })
      .select("*")
      .single();

    if (profileError) {
      // rollback: auth 유저 삭제
      await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    }

    // 3. vendor 유저인 경우 vendor_users에도 추가
    if (userType === "vendor") {
      const { error: vuError } = await supabase
        .from("vendor_users")
        .insert({
          vendor_id: vendorId,
          auth_user_id: authUserId,
          email,
          user_name: displayName,
          role: subRole,
          status: "ACTIVE",
        });

      if (vuError) {
        // rollback
        await supabase.from("user_profiles").delete().eq("auth_user_id", authUserId);
        await admin.auth.admin.deleteUser(authUserId);
        return NextResponse.json({ ok: false, error: vuError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      user: profile,
      login: { email, temporary_password: password },
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
