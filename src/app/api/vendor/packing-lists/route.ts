import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UserProfileRow = {
  auth_user_id: string;
  user_type: string | null;
  role: string | null;
  vendor_id: string | null;
  status: string | null;
};

type PackingListHeaderRow = {
  id: string;
  pl_no: string | null;
  po_no: string | null;
  vendor_id: string | null;
  status: string | null;
  eta: string | null;
  created_at: string | null;
  updated_at: string | null;
  finalized_at?: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type PoHeaderRow = {
  id: string;
  po_no: string | null;
};

function formatVendorDisplay(
  vendor: VendorRow | null,
  fallbackVendorId: string | null
) {
  if (!vendor) return fallbackVendorId || "-";
  return vendor.vendor_name || vendor.vendor_code || vendor.id || fallbackVendorId || "-";
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();

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

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("auth_user_id, user_type, role, vendor_id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { ok: false, error: "User profile not found" },
        { status: 403 }
      );
    }

    const profile = profileData as UserProfileRow;

    const role = (profile.role || "").toUpperCase();
    const userType = (profile.user_type || "").toUpperCase();
    const status = (profile.status || "").toUpperCase();

    const isVendorUser =
      userType === "VENDOR" &&
      role === "VENDOR" &&
      status === "ACTIVE" &&
      !!profile.vendor_id;

    const isHqAdmin =
      userType === "INTERNAL" &&
      role === "ADMIN" &&
      status === "ACTIVE";

    if (!isVendorUser && !isHqAdmin) {
      return NextResponse.json(
        {
          ok: false,
          error: "Forbidden",
          debug: {
            userType,
            role,
            status,
            vendor_id: profile.vendor_id,
          },
        },
        { status: 403 }
      );
    }

    let headerQuery = supabase
      .from("packing_list_header")
      .select("id, pl_no, po_no, vendor_id, status, eta, created_at, updated_at, finalized_at")
      .order("created_at", { ascending: false });

    if (isVendorUser) {
      headerQuery = headerQuery.eq("vendor_id", profile.vendor_id as string);
    }

    const { data: headerRowsData, error: headerRowsError } = await headerQuery;

    if (headerRowsError) {
      return NextResponse.json(
        { ok: false, error: headerRowsError.message },
        { status: 500 }
      );
    }

    const headerRows = (headerRowsData ?? []) as PackingListHeaderRow[];

    const vendorIds = Array.from(
      new Set(headerRows.map((r) => r.vendor_id).filter((v): v is string => !!v))
    );

    let vendorMap = new Map<string, VendorRow>();
    if (vendorIds.length > 0) {
      const { data: vendorRowsData, error: vendorRowsError } = await supabase
        .from("vendor")
        .select("id, vendor_code, vendor_name")
        .in("id", vendorIds);

      if (vendorRowsError) {
        return NextResponse.json(
          { ok: false, error: vendorRowsError.message },
          { status: 500 }
        );
      }

      const vendorRows = (vendorRowsData ?? []) as VendorRow[];
      vendorMap = new Map(vendorRows.map((v) => [v.id, v]));
    }

    const poNos = Array.from(
      new Set(headerRows.map((r) => r.po_no).filter((v): v is string => !!v))
    );

    let poMap = new Map<string, PoHeaderRow>();
    if (poNos.length > 0) {
      const { data: poRowsData, error: poRowsError } = await supabase
        .from("po_header")
        .select("id, po_no")
        .in("po_no", poNos);

      if (poRowsError) {
        return NextResponse.json(
          { ok: false, error: poRowsError.message },
          { status: 500 }
        );
      }

      const poRows = (poRowsData ?? []) as PoHeaderRow[];
      poMap = new Map(
        poRows
          .filter((r) => !!r.po_no)
          .map((r) => [r.po_no as string, r])
      );
    }

    const items = headerRows.map((row) => {
      const vendor = row.vendor_id ? vendorMap.get(row.vendor_id) ?? null : null;
      const po = row.po_no ? poMap.get(row.po_no) ?? null : null;

      return {
        id: row.id,
        packing_list_no: row.pl_no || row.id,
        pl_no: row.pl_no || row.id,
        po_no: row.po_no || "-",
        po_id: po?.id ?? null,
        vendor_id: row.vendor_id,
        vendor_code: vendor?.vendor_code ?? null,
        vendor_name: vendor?.vendor_name ?? null,
        vendor_display: formatVendorDisplay(vendor, row.vendor_id),
        status: row.status || "-",
        asn_id: null,
        asn_no: "-",
        eta: row.eta || "-",
        created_at: row.created_at,
        updated_at: row.updated_at,
        finalized_at: row.finalized_at ?? null,
        is_vendor_scope: isVendorUser,
      };
    });

    return NextResponse.json({
      ok: true,
      scope: isVendorUser ? "VENDOR" : "ADMIN",
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}