import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

type ApplyRow = {
  vendor_code: string;
  vendor_name: string;
};

/**
 * POST /api/admin/vendors/bulk/apply
 *
 * Preview에서 valid로 분류된 행들을 vendor 테이블에 INSERT.
 * 서버 측 재검증 후 기존 vendor_code는 skip.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;

  try {
    const body = await req.json();
    const rawRows: ApplyRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rawRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "rows is required (non-empty array)" },
        { status: 400 }
      );
    }

    // 1차 정리: 필드 trim + 필수값 체크
    const cleaned: ApplyRow[] = [];
    const errors: { vendor_code: string | null; reason: string }[] = [];
    const seen = new Set<string>();
    for (const r of rawRows) {
      const code = String(r?.vendor_code ?? "").trim();
      const name = String(r?.vendor_name ?? "").trim();
      if (!code || !name) {
        errors.push({
          vendor_code: code || null,
          reason: !code ? "vendor_code missing" : "vendor_name missing",
        });
        continue;
      }
      const key = code.toUpperCase();
      if (seen.has(key)) {
        errors.push({ vendor_code: code, reason: "duplicate in request" });
        continue;
      }
      seen.add(key);
      cleaned.push({ vendor_code: code, vendor_name: name });
    }

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows to insert", errors },
        { status: 400 }
      );
    }

    // 2차: DB 재확인 (race condition 방지)
    const codes = cleaned.map((r) => r.vendor_code);
    const existingSet = new Set<string>();
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const chunk = codes.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("vendor")
        .select("vendor_code")
        .in("vendor_code", chunk);
      if (error) throw error;
      for (const v of data ?? []) {
        existingSet.add(String(v.vendor_code).toUpperCase());
      }
    }

    const toInsert = cleaned.filter((r) => !existingSet.has(r.vendor_code.toUpperCase()));
    const skipped = cleaned.filter((r) => existingSet.has(r.vendor_code.toUpperCase()));
    for (const s of skipped) {
      errors.push({ vendor_code: s.vendor_code, reason: "already exists in DB" });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        skipped: skipped.length,
        errors,
      });
    }

    // 3차: bulk INSERT (status 기본값은 DB default 또는 'ACTIVE')
    const payload = toInsert.map((r) => ({
      vendor_code: r.vendor_code,
      vendor_name: r.vendor_name,
      status: "ACTIVE",
    }));

    // CHUNK로 나눠서 insert (500개 단위 안전)
    let inserted = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { data, error } = await supabase.from("vendor").insert(chunk).select("id");
      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: error.message,
            inserted_before_error: inserted,
            skipped: skipped.length,
            errors,
          },
          { status: 500 }
        );
      }
      inserted += data?.length ?? chunk.length;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped: skipped.length,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
