import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function getAuthorizedAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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

  const isAdmin =
    (profile.user_type === "internal" &&
      (profile.role === "internal_admin" || profile.role === "internal_operator")) ||
    profile.role === "ADMIN";

  if (!isAdmin || (profile.status && profile.status !== "ACTIVE")) {
    return { ok: false as const, status: 403, supabase, error: "Forbidden" };
  }

  return { ok: true as const, supabase };
}

/** POST — 비밀번호 리셋 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  const admin = createAdminClient();

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const newPassword = String(body.password ?? "").trim();

    if (newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // user_profiles에서 auth_user_id 조회
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, auth_user_id, email")
      .eq("id", id)
      .single();

    if (profileError || !profile?.auth_user_id) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      profile.auth_user_id,
      { password: newPassword }
    );

    if (authError) {
      return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      email: profile.email,
      temporary_password: newPassword,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
