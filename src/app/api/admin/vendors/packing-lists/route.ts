import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CreatePackingListLineInput = {
  line_no?: number;
  sku?: string;
  style_code?: string | null;
  color?: string | null;
  size?: string | null;
  description?: string | null;
  carton_no?: string | null;
  qty_per_carton?: number | string | null;
  carton_qty?: number | string | null;
  qty?: number | string | null;
  unit_weight?: number | string | null;
  gross_weight?: number | string | null;
  net_weight?: number | string | null;
  cbm?: number | string | null;
  po_no?: string | null;
  po_line_no?: string | null;
  asn_no?: string | null;
};

type CreatePackingListBody = {
  po_no?: string | null;
  asn_no?: string | null;
  invoice_no?: string | null;
  shipment_no?: string | null;
  ship_from?: string | null;
  ship_to?: string | null;
  etd?: string | null;
  eta?: string | null;
  remarks?: string | null;
  source_type?: "MANUAL" | "CSV";
  lines?: CreatePackingListLineInput[];
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

function normalizeLines(lines: CreatePackingListLineInput[]) {
  return lines.map((line, index) => {
    const lineNo =
      typeof line.line_no === "number" && Number.isInteger(line.line_no)
        ? line.line_no
        : index + 1;

    return {
      line_no: lineNo,
      sku: toNullableString(line.sku) ?? "",
      style_code: toNullableString(line.style_code),
      color: toNullableString(line.color),
      size: toNullableString(line.size),
      description: toNullableString(line.description),
      carton_no: toNullableString(line.carton_no),
      qty_per_carton: toNumberOrZero(line.qty_per_carton),
      carton_qty: toNumberOrZero(line.carton_qty),
      qty: toNumberOrZero(line.qty),
      unit_weight: toNumberOrZero(line.unit_weight),
      gross_weight: toNumberOrZero(line.gross_weight),
      net_weight: toNumberOrZero(line.net_weight),
      cbm: toNumberOrZero(line.cbm),
      po_no: toNullableString(line.po_no),
      po_line_no: toNullableString(line.po_line_no),
      asn_no: toNullableString(line.asn_no),
    };
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    // 1) 로그인 사용자 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) user_profiles 확인
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("auth_user_id, user_type, role, vendor_id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { ok: false, error: "User profile not found" },
        { status: 403 }
      );
    }

    const isVendorUser =
      userType === "VENDOR" &&
      (profile.role === "vendor_admin" || profile.role === "vendor_user") &&
      profile.status === "ACTIVE" &&
      !!profile.vendor_id;

    if (!isVendorUser) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const vendorId = profile.vendor_id as string;

    // 3) vendor_users 체크
    const { data: vendorUser, error: vendorUserError } = await supabase
      .from("vendor_users")
      .select("id, vendor_id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (vendorUserError || !vendorUser) {
      return NextResponse.json(
        { ok: false, error: "Vendor user not found" },
        { status: 403 }
      );
    }

    if (vendorUser.status !== "ACTIVE") {
      return NextResponse.json(
        { ok: false, error: "Vendor user is not ACTIVE" },
        { status: 403 }
      );
    }

    }

    // 4) body parsing
    const body = (await req.json()) as CreatePackingListBody;

    const poNo = toNullableString(body.po_no);
    const asnNo = toNullableString(body.asn_no);
    const invoiceNo = toNullableString(body.invoice_no);
    const shipmentNo = toNullableString(body.shipment_no);
    const shipFrom = toNullableString(body.ship_from);
    const shipTo = toNullableString(body.ship_to);
    const etd = toNullableString(body.etd);
    const eta = toNullableString(body.eta);
    const remarks = toNullableString(body.remarks);
    const sourceType = body.source_type ?? "MANUAL";
    const linesInput = Array.isArray(body.lines) ? body.lines : [];

    if (!["MANUAL", "CSV"].includes(sourceType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid source_type" },
        { status: 400 }
      );
    }

    if (!isValidDateString(etd) || !isValidDateString(eta)) {
      return NextResponse.json(
        { ok: false, error: "Invalid date format for etd or eta" },
        { status: 400 }
      );
    }

    if (linesInput.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one line is required" },
        { status: 400 }
      );
    }

    const normalizedLines = normalizeLines(linesInput);

    const lineNos = normalizedLines.map((line) => line.line_no);
    const uniqueLineNos = new Set(lineNos);

    if (lineNos.length !== uniqueLineNos.size) {
      return NextResponse.json(
        { ok: false, error: "Duplicate line_no detected" },
        { status: 400 }
      );
    }

    const invalidSkuLine = normalizedLines.find((line) => !line.sku);
    if (invalidSkuLine) {
      return NextResponse.json(
        { ok: false, error: "Each line must have sku" },
        { status: 400 }
      );
    }

    // 5) pl_no 생성
    const { data: plNoData, error: plNoError } = await supabase.rpc(
      "generate_pl_no"
    );

    if (plNoError || !plNoData) {
      return NextResponse.json(
        { ok: false, error: plNoError?.message ?? "Failed to generate pl_no" },
        { status: 500 }
      );
    }

    const plNo = plNoData as string;

    // 6) header insert
    const { data: insertedHeader, error: headerInsertError } = await supabase
      .from("packing_list_header")
      .insert({
        pl_no: plNo,
        vendor_id: vendorId,
        po_no: poNo,
        asn_no: asnNo,
        invoice_no: invoiceNo,
        shipment_no: shipmentNo,
        ship_from: shipFrom,
        ship_to: shipTo,
        etd,
        eta,
        remarks,
        source_type: sourceType,
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

    // 7) lines insert
    const lineRows = normalizedLines.map((line) => ({
      packing_list_id: packingListId,
      line_no: line.line_no,
      sku: line.sku,
      style_code: line.style_code,
      color: line.color,
      size: line.size,
      description: line.description,
      carton_no: line.carton_no,
      qty_per_carton: line.qty_per_carton,
      carton_qty: line.carton_qty,
      qty: line.qty,
      unit_weight: line.unit_weight,
      gross_weight: line.gross_weight,
      net_weight: line.net_weight,
      cbm: line.cbm,
      po_no: line.po_no ?? poNo,
      po_line_no: line.po_line_no,
      asn_no: line.asn_no ?? asnNo,
    }));

    const { data: insertedLines, error: linesInsertError } = await supabase
      .from("packing_list_lines")
      .insert(lineRows)
      .select("*");

    if (linesInsertError) {
      await supabase.from("packing_list_header").delete().eq("id", packingListId);

      return NextResponse.json(
        { ok: false, error: linesInsertError.message },
        { status: 500 }
      );
    }

    // 8) 합계 재계산
    const { error: recalcError } = await supabase.rpc(
      "recalculate_packing_list_totals",
      { p_packing_list_id: packingListId }
    );

    if (recalcError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Packing list created, but totals recalculation failed: ${recalcError.message}`,
          packing_list_id: packingListId,
        },
        { status: 500 }
      );
    }

    // 9) 최종 header 재조회
    const { data: finalHeader, error: finalHeaderError } = await supabase
      .from("packing_list_header")
      .select("*")
      .eq("id", packingListId)
      .single();

    if (finalHeaderError || !finalHeader) {
      return NextResponse.json(
        {
          ok: false,
          error:
            finalHeaderError?.message ??
            "Failed to fetch final packing list header",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Packing list created successfully",
        header: finalHeader,
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