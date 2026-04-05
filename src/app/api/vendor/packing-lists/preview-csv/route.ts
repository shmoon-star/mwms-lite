import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CsvPreviewRow = {
  row_no: number;
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
      scope: "ADMIN" | "VENDOR";
      vendorId: string | null;   // uuid
      vendorCode: string | null; // text
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

function parseCsvText(csvText: string): CsvPreviewRow[] {
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

    return {
      row_no: rowIndex + 2,
      line_no: Number(row.line_no) > 0 ? Number(row.line_no) : rowIndex + 1,
      sku: (row.sku ?? "").trim(),
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

  if (isAdmin) {
    return {
      ok: true,
      supabase,
      scope: "ADMIN",
      vendorId: null,
      vendorCode: null,
    };
  }

  const { data: vendorRaw, error: vendorError } = await supabase
    .from("vendor")
    .select("id, vendor_code")
    .eq("id", profile.vendor_id)
    .single();

  if (vendorError || !vendorRaw || !vendorRaw.vendor_code) {
    return {
      ok: false,
      status: 403,
      error: "Vendor master not found",
    };
  }

  return {
    ok: true,
    supabase,
    scope: "VENDOR",
    vendorId: profile.vendor_id!,
    vendorCode: vendorRaw.vendor_code,
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

  const { supabase, scope, vendorId } = auth;

  try {
    const formData = await req.formData();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "CSV file is required" },
        { status: 400 }
      );
    }

    const selectedPoNo = toNullableString(formData.get("po_no"));
    const etaInput = toNullableString(formData.get("eta"));

    if (!selectedPoNo) {
      return NextResponse.json(
        { ok: false, error: "PO selection is required" },
        { status: 400 }
      );
    }

    if (!isValidDateString(etaInput)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ETA format" },
        { status: 400 }
      );
    }

    const { data: poHeader, error: poHeaderError } = await supabase
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta")
      .eq("po_no", selectedPoNo)
      .maybeSingle();

    if (poHeaderError) {
      throw new Error(poHeaderError.message);
    }

    if (!poHeader) {
      return NextResponse.json(
        { ok: false, error: "Selected PO not found" },
        { status: 404 }
      );
    }

    // po_header.vendor_id = vendor_code(text)
    // vendor user only sees own vendor_code
    if (scope === "VENDOR" && poHeader.vendor_id !== vendorId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { data: poLines, error: poLinesError } = await supabase
      .from("po_line")
      .select("sku, qty_ordered, qty")
      .eq("po_id", poHeader.id);

    if (poLinesError) {
      throw new Error(poLinesError.message);
    }

    const csvText = await file.text();
    const rows = parseCsvText(csvText);

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid lines found in CSV" },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    rows.forEach((row) => {
      if (!row.sku) {
        errors.push(`Row ${row.row_no}: sku is required`);
      }

      if (row.qty <= 0) {
        errors.push(`Row ${row.row_no}: qty must be greater than 0`);
      }

      if (row.eta && !isValidDateString(row.eta)) {
        errors.push(`Row ${row.row_no}: invalid eta format`);
      }

      if (row.po_no && row.po_no !== selectedPoNo) {
        errors.push(
          `Row ${row.row_no}: row po_no (${row.po_no}) differs from selected PO (${selectedPoNo})`
        );
      }
    });

    const totalQty = rows.reduce((sum, row) => sum + (row.qty || 0), 0);

    const uniqueCartons = new Set(
      rows.map((row) => row.carton_no?.trim()).filter((v): v is string => !!v)
    );
    const totalCartons = uniqueCartons.size;

    const representativeEta =
      etaInput ?? rows.find((row) => row.eta)?.eta ?? poHeader.eta ?? null;

    const csvSkuQtyMap = new Map<string, number>();
    rows.forEach((row) => {
      const prev = csvSkuQtyMap.get(row.sku) || 0;
      csvSkuQtyMap.set(row.sku, prev + Number(row.qty || 0));
    });

    const poSkuQtyMap = new Map<string, number>();
    (poLines ?? []).forEach((line: any) => {
      const qtyOrdered = Number(line.qty_ordered ?? line.qty ?? 0);
      poSkuQtyMap.set(line.sku, qtyOrdered);
    });

    const missingInPo: Array<{ sku: string; packed_qty: number }> = [];
    const exceededPoQty: Array<{
      sku: string;
      packed_qty: number;
      ordered_qty: number;
      balance: number;
    }> = [];
    const matchedSkuComparisons: Array<{
      sku: string;
      packed_qty: number;
      ordered_qty: number;
      balance: number;
    }> = [];

    csvSkuQtyMap.forEach((packedQty, sku) => {
      const orderedQty = poSkuQtyMap.get(sku);

      if (orderedQty === undefined) {
        missingInPo.push({
          sku,
          packed_qty: packedQty,
        });
        return;
      }

      const balance = orderedQty - packedQty;

      matchedSkuComparisons.push({
        sku,
        packed_qty: packedQty,
        ordered_qty: orderedQty,
        balance,
      });

      if (packedQty > orderedQty) {
        exceededPoQty.push({
          sku,
          packed_qty: packedQty,
          ordered_qty: orderedQty,
          balance,
        });
      }
    });

    if (missingInPo.length > 0) {
      missingInPo.forEach((item) => {
        errors.push(
          `SKU ${item.sku} is not found in selected PO. packed_qty=${item.packed_qty}`
        );
      });
    }

    if (exceededPoQty.length > 0) {
      exceededPoQty.forEach((item) => {
        errors.push(
          `SKU ${item.sku} exceeds PO ordered qty. packed=${item.packed_qty}, ordered=${item.ordered_qty}`
        );
      });
    }

    const poOrderedQty = (poLines ?? []).reduce(
      (sum: number, line: any) => sum + Number(line.qty_ordered ?? line.qty ?? 0),
      0
    );

    const qtyBalance = poOrderedQty - totalQty;

    return NextResponse.json(
      {
        ok: true,
        summary: {
          line_count: rows.length,
          total_qty: totalQty,
          total_cartons: totalCartons,
          po_no: selectedPoNo,
          eta: representativeEta,
          po_ordered_qty: poOrderedQty,
          qty_balance: qtyBalance,
          po_sku_count: (poLines ?? []).length,
          csv_sku_count: csvSkuQtyMap.size,
        },
        rows,
        errors,
        warnings,
        comparison: {
          matched_items: matchedSkuComparisons,
          missing_in_po: missingInPo,
          exceeded_po_qty: exceededPoQty,
        },
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