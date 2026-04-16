import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5분 (대량 처리 대비)

type ApplyRow = {
  email: string;
  display_name: string;
  vendor_code: string;
  vendor_id: string; // preview에서 해결된 uuid
  password: string;
};

type RowError = {
  row_no?: number;
  email: string | null;
  reason: string;
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

  return { ok: true as const, supabase, user };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/admin/users/bulk/apply
 *
 * Preview에서 valid로 분류된 vendor user 행들을 일괄 생성.
 * 각 row는 Supabase Auth + user_profiles + vendor_users 3곳에 기록.
 * 실패한 row는 rollback(auth 삭제) 후 에러 기록. 다른 row는 계속 진행.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;
  const admin = createAdminClient();

  try {
    const body = await req.json();
    const rawRows: Partial<ApplyRow>[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rawRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "rows is required (non-empty array)" },
        { status: 400 }
      );
    }

    // 1차 정리 + 필드 유효성 재검증
    const cleaned: ApplyRow[] = [];
    const errors: RowError[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rawRows.length; i += 1) {
      const r = rawRows[i];
      const email = String(r?.email ?? "").trim().toLowerCase();
      const display_name = String(r?.display_name ?? "").trim();
      const vendor_code = String(r?.vendor_code ?? "").trim();
      const vendor_id = String(r?.vendor_id ?? "").trim();
      const password = String(r?.password ?? "").trim();

      if (!email || !isValidEmail(email)) {
        errors.push({ email: email || null, reason: "invalid email" });
        continue;
      }
      if (!display_name) {
        errors.push({ email, reason: "display_name missing" });
        continue;
      }
      if (!vendor_code || !vendor_id) {
        errors.push({ email, reason: "vendor info missing" });
        continue;
      }
      if (!password || password.length < 8) {
        errors.push({ email, reason: "password too short" });
        continue;
      }
      if (seen.has(email)) {
        errors.push({ email, reason: "duplicate in request" });
        continue;
      }
      seen.add(email);
      cleaned.push({ email, display_name, vendor_code, vendor_id, password });
    }

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows to create", errors },
        { status: 400 }
      );
    }

    // 2차 재검증: DB에 이미 존재하는 email / 존재하지 않는 vendor_id
    const emails = cleaned.map((r) => r.email);
    const existingEmails = new Set<string>();
    {
      const CHUNK = 500;
      for (let i = 0; i < emails.length; i += CHUNK) {
        const chunk = emails.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("user_profiles")
          .select("email")
          .in("email", chunk);
        if (error) throw error;
        for (const u of data ?? []) {
          if (u.email) existingEmails.add(String(u.email).toLowerCase());
        }
      }
    }

    const vendorIds = Array.from(new Set(cleaned.map((r) => r.vendor_id)));
    const validVendorIds = new Set<string>();
    {
      const CHUNK = 500;
      for (let i = 0; i < vendorIds.length; i += CHUNK) {
        const chunk = vendorIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendor")
          .select("id")
          .in("id", chunk);
        if (error) throw error;
        for (const v of data ?? []) validVendorIds.add(v.id);
      }
    }

    // 실제 생성 루프 (순차) — Supabase Auth Admin API는 bulk 미지원
    let inserted = 0;
    const createdItems: { email: string; vendor_code: string; user_id: string }[] = [];

    for (const row of cleaned) {
      if (existingEmails.has(row.email)) {
        errors.push({ email: row.email, reason: "already exists in DB" });
        continue;
      }
      if (!validVendorIds.has(row.vendor_id)) {
        errors.push({ email: row.email, reason: "vendor_id not found" });
        continue;
      }

      // 1. Supabase Auth 유저 생성
      const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
        email: row.email,
        password: row.password,
        email_confirm: true,
        user_metadata: {
          display_name: row.display_name,
          user_type: "vendor",
          role: "VENDOR",
          sub_role: "vendor_user",
        },
      });

      if (createAuthError || !createdAuth?.user) {
        errors.push({
          email: row.email,
          reason: `auth create failed: ${createAuthError?.message || "unknown"}`,
        });
        continue;
      }
      const authUserId = createdAuth.user.id;

      // 2. user_profiles 생성
      const { error: profileError } = await supabase.from("user_profiles").insert({
        auth_user_id: authUserId,
        email: row.email,
        display_name: row.display_name,
        user_type: "vendor",
        role: "VENDOR",
        vendor_id: row.vendor_id,
        buyer_id: null,
        status: "ACTIVE",
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(authUserId); // rollback
        errors.push({
          email: row.email,
          reason: `profile insert failed: ${profileError.message}`,
        });
        continue;
      }

      // 3. vendor_users 생성
      const { error: vuError } = await supabase.from("vendor_users").insert({
        vendor_id: row.vendor_id,
        auth_user_id: authUserId,
        email: row.email,
        user_name: row.display_name,
        role: "vendor_user",
        status: "ACTIVE",
      });

      if (vuError) {
        // rollback profile + auth
        await supabase.from("user_profiles").delete().eq("auth_user_id", authUserId);
        await admin.auth.admin.deleteUser(authUserId);
        errors.push({
          email: row.email,
          reason: `vendor_users insert failed: ${vuError.message}`,
        });
        continue;
      }

      inserted += 1;
      createdItems.push({
        email: row.email,
        vendor_code: row.vendor_code,
        user_id: authUserId,
      });
    }

    return NextResponse.json({
      ok: true,
      inserted,
      total_requested: rawRows.length,
      errors,
      items: createdItems,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
