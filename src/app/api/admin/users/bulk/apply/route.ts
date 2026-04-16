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
  vendor_name: string | null; // 신규 벤더 생성 시 사용
  vendor_id: string | null; // DB에 존재하는 벤더인 경우 preview에서 전달됨
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
 * Preview에서 valid/valid_new_vendor 행들을 순차 처리.
 * - 벤더가 없으면 자동 생성
 * - Supabase Auth + user_profiles + vendor_users 3곳에 기록
 * - 실패 row는 rollback, 다른 row는 계속 진행
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

    for (const r of rawRows) {
      const email = String(r?.email ?? "").trim().toLowerCase();
      const display_name = String(r?.display_name ?? "").trim();
      const vendor_code = String(r?.vendor_code ?? "").trim();
      const vendor_name = r?.vendor_name ? String(r.vendor_name).trim() : null;
      const vendor_id = r?.vendor_id ? String(r.vendor_id).trim() : null;
      const password = String(r?.password ?? "").trim();

      if (!email || !isValidEmail(email)) {
        errors.push({ email: email || null, reason: "invalid email" });
        continue;
      }
      if (!display_name) {
        errors.push({ email, reason: "display_name missing" });
        continue;
      }
      if (!vendor_code) {
        errors.push({ email, reason: "vendor_code missing" });
        continue;
      }
      if (!vendor_id && !vendor_name) {
        errors.push({
          email,
          reason: "Cannot resolve vendor: both vendor_id and vendor_name are empty",
        });
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
      cleaned.push({ email, display_name, vendor_code, vendor_name, vendor_id, password });
    }

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows to create", errors },
        { status: 400 }
      );
    }

    // 2차 재검증: 이미 존재하는 email 제거, 존재하지 않는 vendor_id 제거
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

    // 기존 벤더 조회 (vendor_code로, 저장소 상태 최신화)
    const vendorCodes = Array.from(new Set(cleaned.map((r) => r.vendor_code)));
    const vendorByCode = new Map<string, string>(); // code → id
    {
      const CHUNK = 500;
      for (let i = 0; i < vendorCodes.length; i += CHUNK) {
        const chunk = vendorCodes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendor")
          .select("id, vendor_code")
          .in("vendor_code", chunk);
        if (error) throw error;
        for (const v of data ?? []) vendorByCode.set(String(v.vendor_code), String(v.id));
      }
    }

    let inserted = 0;
    let createdVendors = 0;
    const createdItems: {
      email: string;
      vendor_code: string;
      user_id: string;
      vendor_created: boolean;
    }[] = [];

    for (const row of cleaned) {
      if (existingEmails.has(row.email)) {
        errors.push({ email: row.email, reason: "already exists in DB" });
        continue;
      }

      // 벤더 resolve or create
      let vendorId = vendorByCode.get(row.vendor_code);
      let vendorCreatedThisRow = false;

      if (!vendorId) {
        // 신규 벤더 생성
        if (!row.vendor_name) {
          errors.push({
            email: row.email,
            reason: `vendor_code '${row.vendor_code}' not in DB and vendor_name missing`,
          });
          continue;
        }
        const { data: createdVendor, error: vErr } = await supabase
          .from("vendor")
          .insert({
            vendor_code: row.vendor_code,
            vendor_name: row.vendor_name,
            status: "ACTIVE",
          })
          .select("id")
          .single();
        if (vErr || !createdVendor) {
          errors.push({
            email: row.email,
            reason: `vendor create failed: ${vErr?.message || "unknown"}`,
          });
          continue;
        }
        vendorId = createdVendor.id;
        vendorByCode.set(row.vendor_code, vendorId!);
        createdVendors += 1;
        vendorCreatedThisRow = true;
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
        vendor_id: vendorId,
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
        vendor_id: vendorId,
        auth_user_id: authUserId,
        email: row.email,
        user_name: row.display_name,
        role: "vendor_user",
        status: "ACTIVE",
      });

      if (vuError) {
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
        vendor_created: vendorCreatedThisRow,
      });
    }

    return NextResponse.json({
      ok: true,
      inserted,
      total_requested: rawRows.length,
      created_vendors: createdVendors,
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
