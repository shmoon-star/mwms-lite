import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CsvLineRow = {
  line_no: number;
  sku: string;
  style_code: string | null;
  color: string | null;
  size: string | null;
  description: string | null;
  carton_no: string | null;
  qty_per_carton: number;
  carton_qty: number;
  qty: number;
  unit_weight: number;
  gross_weight: number;
  net_weight: number;
  cbm: number;
  po_no: string | null;
  po_line_no: string | null;
  asn_no: string | null;
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

function parseCsvText(csvText: string): CsvLineRow[] {
  const rawLines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (rawLines.length < 2) {
    throw new Error("CSV must include header and at least one data row");
  }

  const headers = parseCsvLine(rawLines[0]).map((h) => h.trim());

  const requiredHeaders = ["line_no", "sku"];
  for (const key of requiredHeaders) {
    if (!headers.includes(key)) {
      throw new Error(`Missing required CSV header: ${key}`);
    }
  }

  const rows: CsvLineRow[] = rawLines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    const lineNo = Number(row.line_no);
    if (!Number.isInteger(lineNo) || lineNo < 1) {
      throw new Error(`Invalid line_no at CSV row ${rowIndex + 2}`);
    }

    const sku = (row.sku ?? "").trim();
    if (!sku) {
      throw new Error(`Missing sku at CSV row ${rowIndex + 2}`);
    }

    return {
      line_no: lineNo,
      sku,
      style_code: toNullableString(row.style_code),
      color: toNullableString(row.color),
      size: toNullableString(row.size),
      description: toNullableString(row.description),
      carton_no: toNullableString(row.carton_no),
      qty_per_carton: toNumberOrZero(row.qty_per_carton),
      carton_qty: toNumberOrZero(row.carton_qty),
      qty: toNumberOrZero(row.qty),
      unit_weight: toNumberOrZero(row.unit_weight),
      gross_weight: toNumberOrZero(row.gross_weight),
      net_weight: toNumberOrZero(row.net_weight),
      cbm: toNumberOrZero(row.cbm),
      po_no: toNullableString(row.po_no),
      po_line_no: toNullableString(row.po_line_no),
      asn_no: toNullableString(row.asn_no),
    };
  });

  const lineNos = rows.map((r) => r.line_no);
  const uniqueLineNos = new Set(lineNos);

  if (lineNos.length !== uniqueLineNos.size) {
    throw new Error("Duplicate line_no detected in CSV");
  }

  return rows;
}

async function getAuthorizedVendorUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      supabase,
      error: "Unauthorized",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "User profile not found",
    };
  }

  const isVendorUser =
    userType === "VENDOR" &&
    (profile.role === "vendor_admin" || profile.role === "vendor_user") &&
    profile.status === "ACTIVE" &&
    !!profile.vendor_id;

  if (!isVendorUser) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Forbidden",
    };
  }

  const { data: vendorUser, error: vendorUserError } = await supabase
    .from("vendor_users")
    .select("id, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (vendorUserError || !vendorUser) {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Vendor user not found",
    };
  }

  if (vendorUser.status !== "ACTIVE") {
    return {
      ok: false as const,
      status: 403,
      supabase,
      error: "Vendor user is not ACTIVE",
    };
  }
  }

  return {
    ok: true as const,
    supabase,
    user,
    vendorId: profile.vendor_id as string,
  };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedVendorUser();

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: auth.error,
        code: "code" in auth ? auth.code : undefined,
      },
      { status: auth.status }
    );
  }

  const { supabase, vendorId } = auth;

  try {
    const { id: packingListId } = await context.params;

    if (!packingListId) {
      return NextResponse.json(
        { ok: false, error: "packingListId is required" },
        { status: 400 }
      );
    }

    const { data: header, error: headerError } = await supabase
      .from("packing_list_header")
      .select("id, vendor_id, status, po_no, asn_no")
      .eq("id", packingListId)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: "Packing list not found" },
        { status: 404 }
      );
    }

    if (header.vendor_id !== vendorId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: not your vendor document" },
        { status: 403 }
      );
    }

    if (header.status !== "DRAFT") {
      return NextResponse.json(
        {
          ok: false,
          error: `Only DRAFT packing lists can import CSV. Current status: ${header.status}`,
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "CSV file is required" },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const parsedRows = parseCsvText(csvText);

    const insertRows = parsedRows.map((row) => ({
      packing_list_id: packingListId,
      line_no: row.line_no,
      sku: row.sku,
      style_code: row.style_code,
      color: row.color,
      size: row.size,
      description: row.description,
      carton_no: row.carton_no,
      qty_per_carton: row.qty_per_carton,
      carton_qty: row.carton_qty,
      qty: row.qty,
      unit_weight: row.unit_weight,
      gross_weight: row.gross_weight,
      net_weight: row.net_weight,
      cbm: row.cbm,
      po_no: row.po_no ?? header.po_no,
      po_line_no: row.po_line_no,
      asn_no: row.asn_no ?? header.asn_no,
    }));

    const { error: deleteError } = await supabase
      .from("packing_list_lines")
      .delete()
      .eq("packing_list_id", packingListId);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    const { data: insertedLines, error: insertError } = await supabase
      .from("packing_list_lines")
      .insert(insertRows)
      .select("*");

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
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
          error: `CSV imported, but totals recalculation failed: ${recalcError.message}`,
        },
        { status: 500 }
      );
    }

    const { data: finalHeader, error: finalHeaderError } = await supabase
      .from("packing_list_header")
      .select("*")
      .eq("id", packingListId)
      .single();

    if (finalHeaderError || !finalHeader) {
      return NextResponse.json(
        {
          ok: false,
          error: finalHeaderError?.message ?? "Failed to fetch updated header",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "CSV imported successfully",
        header: finalHeader,
        lines: insertedLines ?? [],
      },
      { status: 200 }
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