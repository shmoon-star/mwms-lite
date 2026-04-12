import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProductsBySkus } from "@/lib/product-master";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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

  const userType = (profile.user_type || "").toUpperCase();

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
    .select("id, vendor_id, auth_user_id, email, user_name, role, status")
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

  return {
    ok: true as const,
    supabase,
    vendorId: profile.vendor_id as string,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthorizedVendorUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, vendorId } = auth;

  try {
    const { searchParams } = new URL(req.url);

    const plNo = searchParams.get("pl_no")?.trim() || "";
    const poNo = searchParams.get("po_no")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const { data: headers, error: headerError } = await supabase
      .from("packing_list_header")
      .select(`
        id,
        pl_no,
        po_no,
        eta,
        status,
        created_at,
        updated_at,
        vendor_id
      `)
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });

    if (headerError) {
      return NextResponse.json(
        { ok: false, error: headerError.message },
        { status: 500 }
      );
    }

    let filteredHeaders = headers ?? [];

    if (plNo) {
      filteredHeaders = filteredHeaders.filter((item) =>
        (item.pl_no ?? "").toLowerCase().includes(plNo.toLowerCase())
      );
    }

    if (poNo) {
      filteredHeaders = filteredHeaders.filter((item) =>
        (item.po_no ?? "").toLowerCase().includes(poNo.toLowerCase())
      );
    }

    if (status && ["DRAFT", "CONFIRMED", "CANCELED"].includes(status)) {
      filteredHeaders = filteredHeaders.filter((item) => item.status === status);
    }

    const headerIds = filteredHeaders.map((item) => item.id);

    if (headerIds.length === 0) {
      const emptyCsv =
        "pl_no,po_no,eta,status,line_no,sku,barcode,description,qty,carton_no,style_code,color,size,created_at,updated_at\n";

      return new NextResponse(emptyCsv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="packing-list-lines.csv"`,
        },
      });
    }

    const { data: lines, error: linesError } = await supabase
      .from("packing_list_lines")
      .select(`
        packing_list_id,
        line_no,
        sku,
        description,
        qty,
        carton_no,
        style_code,
        color,
        size,
        po_no
      `)
      .in("packing_list_id", headerIds)
      .order("packing_list_id", { ascending: true })
      .order("id", { ascending: true });

    if (linesError) {
      return NextResponse.json(
        { ok: false, error: linesError.message },
        { status: 500 }
      );
    }

    const skuList = Array.from(new Set((lines ?? []).map((l: any) => l.sku).filter(Boolean)));
    const productMaster = await loadProductsBySkus(skuList, supabase);

    const headerMap = new Map(
      filteredHeaders.map((header) => [header.id, header])
    );

    const csvHeaders = [
      "pl_no",
      "po_no",
      "eta",
      "status",
      "line_no",
      "sku",
      "barcode",
      "description",
      "qty",
      "carton_no",
      "style_code",
      "color",
      "size",
      "created_at",
      "updated_at",
    ];

    const rows = (lines ?? []).map((line) => {
      const header = headerMap.get(line.packing_list_id);

      return [
        escapeCsv(header?.pl_no),
        escapeCsv(line.po_no ?? header?.po_no),
        escapeCsv(header?.eta),
        escapeCsv(header?.status),
        escapeCsv(line.line_no),
        escapeCsv(line.sku),
        escapeCsv(productMaster.barcodeOf(line.sku) ?? ""),
        escapeCsv(line.description),
        escapeCsv(line.qty),
        escapeCsv(line.carton_no),
        escapeCsv(line.style_code),
        escapeCsv(line.color),
        escapeCsv(line.size),
        escapeCsv(header?.created_at),
        escapeCsv(header?.updated_at),
      ];
    });

    const csv =
      [csvHeaders.join(","), ...rows.map((row) => row.join(","))].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="packing-list-lines.csv"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}