import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

/** PATCH — 유저 수정 (display_name, role, status) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.status !== undefined) updates.status = body.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    // vendor_users 동기화
    if (data?.user_type === "vendor" && data?.auth_user_id) {
      const vuUpdates: Record<string, any> = {};
      if (updates.display_name !== undefined) vuUpdates.user_name = updates.display_name;
      if (updates.role !== undefined) vuUpdates.role = updates.role;
      if (updates.status !== undefined) vuUpdates.status = updates.status;

      if (Object.keys(vuUpdates).length > 0) {
        await supabase
          .from("vendor_users")
          .update(vuUpdates)
          .eq("auth_user_id", data.auth_user_id);
      }
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
