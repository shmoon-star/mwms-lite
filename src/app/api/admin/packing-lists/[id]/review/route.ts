import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
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
    .select("user_type, role, status")
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

export async function POST(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { supabase, user } = auth;

  try {
    const { id } = await context.params;

    const { data, error } = await supabase
      .from("packing_list_header")
      .update({
        status: "REVIEWED",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id)
      .eq("status", "SUBMITTED")
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Only SUBMITTED can be reviewed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, header: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}