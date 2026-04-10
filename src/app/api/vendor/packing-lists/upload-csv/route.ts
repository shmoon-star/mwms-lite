import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CsvRow = {
  line_no: number;
  sku: string;
  description: string | null;
  qty: number;
  carton_no: string | null;
  po_no: string | null;
  style_code: string | null;
  color: string | null;
  size: string | null;
  eta: string | null;
};

type UserProfileRow = {
  auth_user_id: string;
  user_type: string | null;
  role: string | null;
  vendor_id: string | null; // uuid
  status: string | null;
};

type AuthResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: {
        id: string;
        email?: string | null;
      };
      scope: "ADMIN" | "VENDOR";
      vendorId: string | null; // uuid
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toNumberOrZero(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isValidDateString(value: string | null) {
  if (!value) return true;
  return !Number.isNaN(Date.parse(value));
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

function parseCsvText(csvText: string): CsvRow[] {
  const rawLines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (rawLines.length < 2) {
    throw new Error("CSV must include header and at least one data row");
  }

  const headers = parseCsvLine(rawLines[0]).map((h) => h.trim());

  const rows = rawLines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    const sku = (row.sku ?? "").trim();
    if (!sku) {
      throw new Error(`Missing sku at row ${rowIndex + 2}`);
    }

    return {
      line_no: Number(row.line_no) > 0 ? Number(row.line_no) : rowIndex + 1,
      sku,
      description: toNullableString(row.description),
      qty: toNumberOrZero(row.qty),
      carton_no: toNullableString(row.carton_no),
      po_no: toNullableString(row.po_no),
      style_code: toNullableString(row.style_code),
      color: toNullableString(row.color),
      size: toNullableString(row.size),
      eta: toNullableString(row.eta),
    };
  });

  return rows;
}

async function getAuthorizedUser(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const { data: profileRaw, error: profileError } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profileRaw) {
    return {
      ok: false,
      status: 403,
      error: "User profile not found",
    };
  }

  const profile = profileRaw as UserProfileRow;

  const userType = (profile.user_type || "").toUpperCase();
  const role = (profile.role || "").toUpperCase();
  const status = (profile.status || "").toUpperCase();

  const isVendorUser =
    userType === "VENDOR" &&
    role === "VENDOR" &&
    status === "ACTIVE" &&
    !!profile.vendor_id;

  const isAdmin =
    userType === "INTERNAL" &&
    role === "ADMIN" &&
    status === "ACTIVE";

  if (!isVendorUser && !isAdmin) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
    };
  }

  return {
    ok: true,
    supabase,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    scope: isAdmin ? "ADMIN" : "VENDOR",
    vendorId: profile.vendor_id ?? null,
  };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, user, scope, vendorId } = auth;

  try {
    const formData = await req.formData();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "CSV file is required" },
        { status: 400 }
      );
    }

    const poNo = toNullableString(formData.get("po_no"));
    const etaInput = toNullableString(formData.get("eta"));
    const remarks = toNullableString(formData.get("remarks"));

    if (!isValidDateString(etaInput)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ETA format" },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const parsedRows = parseCsvText(csvText);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid lines found in CSV" },
        { status: 400 }
      );
    }

    const representativePoNo =
      poNo ?? parsedRows.find((row) => row.po_no)?.po_no ?? null;

    if (!representativePoNo) {
      return NextResponse.json(
        { ok: false, error: "PO No is required" },
        { status: 400 }
      );
    }

    for (let i = 0; i < parsedRows.length; i += 1) {
      const row = parsedRows[i];

      if (row.po_no && row.po_no !== representativePoNo) {
        return NextResponse.json(
          {
            ok: false,
            error: `Row ${i + 2}: row po_no (${row.po_no}) differs from selected/header PO (${representativePoNo})`,
          },
          { status: 400 }
        );
      }
    }

    const representativeEta =
      etaInput ?? parsedRows.find((row) => row.eta)?.eta ?? null;

    if (!isValidDateString(representativeEta)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ETA value in CSV" },
        { status: 400 }
      );
    }

    const { data: poHeader, error: poHeaderError } = await supabase
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta")
      .eq("po_no", representativePoNo)
      .maybeSingle();

    if (poHeaderError) {
      return NextResponse.json(
        { ok: false, error: poHeaderError.message },
        { status: 500 }
      );
    }

    if (!poHeader) {
      return NextResponse.json(
        { ok: false, error: "Selected PO not found" },
        { status: 404 }
      );
    }

    // 현재 스키마 기준:
    // - po_header.vendor_id = uuid
    // - user_profiles.vendor_id = uuid
    // - packing_list_header.vendor_id = uuid
    if (scope === "VENDOR" && poHeader.vendor_id !== vendorId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const insertVendorId = poHeader.vendor_id;

    if (!insertVendorId) {
      return NextResponse.json(
        { ok: false, error: "PO vendor_id is missing" },
        { status: 500 }
      );
    }

    // pl_no는 FINALIZE 시점에 부여 — DRAFT 단계에서는 null
    const { data: insertedHeader, error: headerInsertError } = await supabase
      .from("packing_list_header")
      .insert({
        pl_no: null,
        vendor_id: insertVendorId,
        po_no: representativePoNo,
        eta: representativeEta,
        remarks,
        source_type: "CSV",
        status: "DRAFT",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (headerInsertError || !insertedHeader) {
      return NextResponse.json(
        {
          ok: false,
          error:
            headerInsertError?.message ?? "Failed to create packing list header",
        },
        { status: 500 }
      );
    }

    const packingListId = insertedHeader.id as string;

    const lineRows = parsedRows.map((line) => ({
      packing_list_id: packingListId,
      line_no: line.line_no,
      sku: line.sku,
      description: line.description,
      qty: line.qty,
      carton_no: line.carton_no,
      po_no: line.po_no ?? representativePoNo,
      style_code: line.style_code,
      color: line.color,
      size: line.size,
    }));

    const { data: insertedLines, error: linesInsertError } = await supabase
      .from("packing_list_lines")
      .insert(lineRows)
      .select("*");

    if (linesInsertError) {
      await supabase
        .from("packing_list_header")
        .delete()
        .eq("id", packingListId);

      return NextResponse.json(
        { ok: false, error: linesInsertError.message },
        { status: 500 }
      );
    }

    const { error: recalcError } = await supabase.rpc(
      "recalculate_packing_list_totals",
      { p_packing_list_id: packingListId }
    );

    if (recalcError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Packing list created, but totals recalculation failed: ${recalcError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Packing list uploaded successfully",
        header: insertedHeader,
        lines: insertedLines ?? [],
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