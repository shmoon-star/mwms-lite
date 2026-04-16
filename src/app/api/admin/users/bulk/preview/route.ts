import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RowStatus = "valid" | "valid_new_vendor" | "conflict" | "invalid" | "duplicate";

type PreviewRow = {
  row_no: number;
  email: string | null;
  display_name: string | null;
  vendor_code: string | null;
  vendor_name: string | null; // CSV input (used if new vendor)
  vendor_name_resolved: string | null; // resolved from DB if vendor exists
  vendor_id: string | null; // resolved uuid (null if new vendor to be created)
  has_password: boolean;
  will_create_vendor: boolean;
  status: RowStatus;
  reason?: string;
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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/admin/users/bulk/preview
 *
 * CSV 파일을 업로드받아 vendor 매핑 + 이메일 중복 검사.
 * vendor_code가 DB에 없으면 vendor_name 기반으로 자동 생성 대상으로 마킹.
 *
 * 지원 헤더 (대소문자/공백 무시):
 *   email, display_name, vendor_code, vendor_name(옵션 — 신규 벤더 생성용), password
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthorizedAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { supabase } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { ok: false, error: "file is required (FormData field 'file')" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await (file as File).arrayBuffer());
    const text = buf.toString("utf-8").replace(/^\uFEFF/, ""); // strip BOM

    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((l) => l.trim() !== "");

    if (lines.length < 2) {
      return NextResponse.json(
        { ok: false, error: "CSV must include header row and at least one data row" },
        { status: 400 }
      );
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const idx = {
      email: headers.indexOf("email"),
      display_name: headers.indexOf("display_name"),
      vendor_code: headers.indexOf("vendor_code"),
      vendor_name: headers.indexOf("vendor_name"), // optional
      password: headers.indexOf("password"),
    };

    const missing: string[] = [];
    if (idx.email < 0) missing.push("email");
    if (idx.display_name < 0) missing.push("display_name");
    if (idx.vendor_code < 0) missing.push("vendor_code");
    if (idx.password < 0) missing.push("password");
    // vendor_name은 optional (DB에 벤더 있으면 불필요)
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing required columns: ${missing.join(", ")}`,
          detected_headers: headers,
        },
        { status: 400 }
      );
    }

    // 원시 데이터 행 추출
    type RawRow = {
      row_no: number;
      email: string | null;
      display_name: string | null;
      vendor_code: string | null;
      vendor_name: string | null;
      password: string | null;
    };
    const rawRows: RawRow[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const values = parseCsvLine(lines[i]);
      const email = (values[idx.email] || "").trim().toLowerCase();
      const display_name = (values[idx.display_name] || "").trim();
      const vendor_code = (values[idx.vendor_code] || "").trim();
      const vendor_name = idx.vendor_name >= 0 ? (values[idx.vendor_name] || "").trim() : "";
      const password = (values[idx.password] || "").trim();
      if (!email && !display_name && !vendor_code && !password && !vendor_name) continue;
      rawRows.push({
        row_no: i + 1,
        email: email || null,
        display_name: display_name || null,
        vendor_code: vendor_code || null,
        vendor_name: vendor_name || null,
        password: password || null,
      });
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No data rows found" },
        { status: 400 }
      );
    }

    // vendor_code → {id, name} 맵 생성 (존재하는 vendor만)
    const vendorCodes = Array.from(
      new Set(rawRows.map((r) => r.vendor_code).filter((v): v is string => !!v))
    );
    const vendorMap = new Map<string, { id: string; vendor_name: string }>();
    if (vendorCodes.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < vendorCodes.length; i += CHUNK) {
        const chunk = vendorCodes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendor")
          .select("id, vendor_code, vendor_name")
          .in("vendor_code", chunk);
        if (error) throw error;
        for (const v of data ?? []) {
          vendorMap.set(String(v.vendor_code), {
            id: v.id,
            vendor_name: v.vendor_name,
          });
        }
      }
    }

    // 기존 이메일 조회 (conflict 판별)
    const emails = Array.from(
      new Set(rawRows.map((r) => r.email).filter((v): v is string => !!v))
    );
    const existingEmails = new Set<string>();
    if (emails.length > 0) {
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

    // 파일 내 이메일 중복 (첫 번째 이후는 duplicate)
    const seenEmails = new Set<string>();
    const duplicateRowNos = new Set<number>();
    for (const r of rawRows) {
      if (!r.email) continue;
      if (seenEmails.has(r.email)) duplicateRowNos.add(r.row_no);
      else seenEmails.add(r.email);
    }

    // 각 행 분류
    const rows: PreviewRow[] = rawRows.map((r) => {
      const vendorInDb = r.vendor_code ? vendorMap.get(r.vendor_code) : null;
      const base = {
        row_no: r.row_no,
        email: r.email,
        display_name: r.display_name,
        vendor_code: r.vendor_code,
        vendor_name: r.vendor_name,
        vendor_name_resolved: vendorInDb?.vendor_name ?? null,
        vendor_id: vendorInDb?.id ?? null,
        has_password: !!r.password && r.password.length >= 8,
        will_create_vendor: false,
      };

      // Invalid 검사
      if (!r.email) return { ...base, status: "invalid" as const, reason: "email missing" };
      if (!isValidEmail(r.email))
        return { ...base, status: "invalid" as const, reason: "invalid email format" };
      if (!r.display_name)
        return { ...base, status: "invalid" as const, reason: "display_name missing" };
      if (!r.vendor_code)
        return { ...base, status: "invalid" as const, reason: "vendor_code missing" };

      // vendor_code가 DB에 없는데 vendor_name이 없으면 invalid
      if (!vendorInDb && !r.vendor_name) {
        return {
          ...base,
          status: "invalid" as const,
          reason: `vendor_code '${r.vendor_code}' not in DB and vendor_name is empty (cannot auto-create)`,
        };
      }

      if (!r.password)
        return { ...base, status: "invalid" as const, reason: "password missing" };
      if (r.password.length < 8)
        return { ...base, status: "invalid" as const, reason: "password must be 8+ chars" };

      // Duplicate (파일 내)
      if (duplicateRowNos.has(r.row_no))
        return {
          ...base,
          status: "duplicate" as const,
          reason: "Same email appears earlier in the file",
        };

      // Conflict (DB 기존)
      if (existingEmails.has(r.email))
        return {
          ...base,
          status: "conflict" as const,
          reason: "email already exists in DB",
        };

      // 신규 벤더 생성 필요
      if (!vendorInDb) {
        return {
          ...base,
          will_create_vendor: true,
          status: "valid_new_vendor" as const,
          reason: `New vendor will be created: ${r.vendor_code} / ${r.vendor_name}`,
        };
      }

      return { ...base, status: "valid" as const };
    });

    const summary = {
      total: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
      valid_new_vendor: rows.filter((r) => r.status === "valid_new_vendor").length,
      conflict: rows.filter((r) => r.status === "conflict").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
    };

    return NextResponse.json({ ok: true, summary, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
