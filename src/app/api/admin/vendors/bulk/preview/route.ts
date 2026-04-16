import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RowStatus = "valid" | "conflict" | "invalid" | "duplicate";

type PreviewRow = {
  row_no: number;
  vendor_code: string | null;
  vendor_name: string | null;
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

function normalizeHeader(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function toCleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // ExcelJS cell can be rich text object
  const raw =
    typeof v === "object" && v !== null && "text" in (v as any)
      ? (v as any).text
      : typeof v === "object" && v !== null && "result" in (v as any)
      ? (v as any).result
      : v;
  const s = String(raw ?? "").trim();
  return s === "" ? null : s;
}

/**
 * POST /api/admin/vendors/bulk/preview
 *
 * Excel(.xlsx) 파일을 업로드받아 파싱하고, DB 충돌 검사 후 preview 반환.
 * 실제 insert는 하지 않음.
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

    const arrayBuf = await (file as File).arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // ExcelJS 타입 정의가 Buffer<ArrayBufferLike>만 받아서 as any 사용 — 실제로는 동작 OK
    await wb.xlsx.load(arrayBuf as any);

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json(
        { ok: false, error: "No worksheet found in the file" },
        { status: 400 }
      );
    }

    // Header (Row 1) 매칭
    const headerRow = ws.getRow(1);
    const headerMap: Record<string, number> = {}; // normalized header → column index
    for (let c = 1; c <= ws.columnCount; c += 1) {
      const key = normalizeHeader(headerRow.getCell(c).value);
      if (key) headerMap[key] = c;
    }

    const codeCol =
      headerMap["vendor_code"] ?? headerMap["code"] ?? headerMap["vendor_cd"];
    const nameCol =
      headerMap["vendor_name"] ?? headerMap["name"] ?? headerMap["vendor"];

    if (!codeCol || !nameCol) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Required columns not found. Expect 'vendor_code' and 'vendor_name' in header (Row 1).",
          detected_headers: Object.keys(headerMap),
        },
        { status: 400 }
      );
    }

    // 데이터 행 순회 (Row 2부터)
    const rawRows: { row_no: number; vendor_code: string | null; vendor_name: string | null }[] =
      [];
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const code = toCleanString(row.getCell(codeCol).value);
      const name = toCleanString(row.getCell(nameCol).value);
      // 완전 빈 행 skip
      if (!code && !name) continue;
      rawRows.push({ row_no: r, vendor_code: code, vendor_name: name });
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No data rows found (data should start at Row 2)" },
        { status: 400 }
      );
    }

    // 파일 내 vendor_code 중복 검출 — 첫 번째 이후는 duplicate
    const seenCodes = new Set<string>();
    const duplicateSet = new Set<number>(); // row_no of duplicates
    for (const r of rawRows) {
      if (!r.vendor_code) continue;
      const key = r.vendor_code.toUpperCase();
      if (seenCodes.has(key)) {
        duplicateSet.add(r.row_no);
      } else {
        seenCodes.add(key);
      }
    }

    // DB 기존 vendor_code 조회 (대량)
    const codesToCheck = Array.from(seenCodes);
    const existingSet = new Set<string>();
    if (codesToCheck.length > 0) {
      // Supabase .in() 안전한 청크 크기 (500)
      const CHUNK = 500;
      for (let i = 0; i < codesToCheck.length; i += CHUNK) {
        const chunk = codesToCheck.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("vendor")
          .select("vendor_code")
          .in("vendor_code", chunk);
        if (error) throw error;
        for (const v of data ?? []) {
          existingSet.add(String(v.vendor_code).toUpperCase());
        }
      }
    }

    // 각 행 분류
    const rows: PreviewRow[] = rawRows.map((r) => {
      if (!r.vendor_code || !r.vendor_name) {
        return {
          row_no: r.row_no,
          vendor_code: r.vendor_code,
          vendor_name: r.vendor_name,
          status: "invalid" as const,
          reason: !r.vendor_code ? "vendor_code missing" : "vendor_name missing",
        };
      }
      if (duplicateSet.has(r.row_no)) {
        return {
          row_no: r.row_no,
          vendor_code: r.vendor_code,
          vendor_name: r.vendor_name,
          status: "duplicate" as const,
          reason: "Same vendor_code appears earlier in the file",
        };
      }
      if (existingSet.has(r.vendor_code.toUpperCase())) {
        return {
          row_no: r.row_no,
          vendor_code: r.vendor_code,
          vendor_name: r.vendor_name,
          status: "conflict" as const,
          reason: "vendor_code already exists in DB",
        };
      }
      return {
        row_no: r.row_no,
        vendor_code: r.vendor_code,
        vendor_name: r.vendor_name,
        status: "valid" as const,
      };
    });

    const summary = {
      total: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
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
