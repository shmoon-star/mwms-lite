import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
      supabase: Awaited<ReturnType<typeof createClient>>;
      status: number;
      error: string;
    };

type UserProfileRow = {
  auth_user_id: string;
  user_type: string | null;
  role: string | null;
  vendor_id: string | null;
  status: string | null;
};

type VendorRow = {
  id: string;
  vendor_code: string | null;
  vendor_name: string | null;
};

type PoHeaderRow = {
  id: string;
  po_no: string | null;
  vendor_id: string | null; // vendor_code text
  status: string | null;
  eta: string | null;
  created_at: string | null;
};

type PoLineRow = {
  po_id: string;
  sku: string | null;
  qty: number | null;
  qty_ordered: number | null;
};

async function getAuthorizedUser(): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      supabase,
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
      supabase,
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

  if (isAdmin) {
    return {
      ok: true,
      supabase,
      scope: "ADMIN",
      vendorId: null,
      vendorCode: null,
    };
  }

  if (!isVendorUser) {
    return {
      ok: false,
      supabase,
      status: 403,
      error: "Forbidden",
    };
  }

  const { data: vendorRaw, error: vendorError } = await supabase
    .from("vendor")
    .select("id, vendor_code, vendor_name")
    .eq("id", profile.vendor_id)
    .single();

  if (vendorError || !vendorRaw) {
    return {
      ok: false,
      supabase,
      status: 403,
      error: "Vendor master not found",
    };
  }

  const vendor = vendorRaw as VendorRow;

  if (!vendor.vendor_code) {
    return {
      ok: false,
      supabase,
      status: 403,
      error: "Vendor code not found",
    };
  }

  return {
    ok: true,
    supabase,
    scope: "VENDOR",
    vendorId: profile.vendor_id!,
    vendorCode: vendor.vendor_code,
  };
}

export async function GET(_req: NextRequest) {
  const auth = await getAuthorizedUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, scope, vendorId } = auth;

  try {
    let headersQuery = supabase
      .from("po_header")
      .select("id, po_no, vendor_id, status, eta, created_at")
      .in("status", ["CREATED", "OPEN", "CONFIRMED", "APPROVED", "ASN_CREATED"])
      .order("created_at", { ascending: false });

    if (scope === "VENDOR") {
      headersQuery = headersQuery.eq("vendor_id", vendorId as string);
    }

    const { data: headersRaw, error: headersError } = await headersQuery;

    if (headersError) {
      return NextResponse.json(
        { ok: false, error: headersError.message },
        { status: 500 }
      );
    }

    const headers = (headersRaw ?? []) as PoHeaderRow[];

    if (headers.length === 0) {
      return NextResponse.json({ ok: true, total: 0, items: [] });
    }

    // INBOUND_COMPLETED PL이 존재하는 PO는 제외
    const poNos = headers.map((h) => h.po_no).filter(Boolean) as string[];
    const { data: completedPlRaw } = await supabase
      .from("packing_list_header")
      .select("po_no")
      .in("po_no", poNos)
      .eq("status", "INBOUND_COMPLETED");

    const completedPoNos = new Set(
      (completedPlRaw ?? []).map((r: { po_no: string | null }) => r.po_no).filter(Boolean)
    );

    const filteredHeaders = headers.filter((h) => !completedPoNos.has(h.po_no));

    if (filteredHeaders.length === 0) {
      return NextResponse.json({ ok: true, total: 0, items: [] });
    }

    const poIds = filteredHeaders.map((h) => h.id);

    const { data: linesRaw, error: linesError } = await supabase
      .from("po_line")
      .select("po_id, sku, qty, qty_ordered")
      .in("po_id", poIds);

    if (linesError) {
      return NextResponse.json(
        { ok: false, error: linesError.message },
        { status: 500 }
      );
    }

    const lines = (linesRaw ?? []) as PoLineRow[];

    const lineAggMap = new Map<
      string,
      { total_qty: number; sku_set: Set<string> }
    >();

    for (const line of lines) {
      const agg = lineAggMap.get(line.po_id) ?? {
        total_qty: 0,
        sku_set: new Set<string>(),
      };

      agg.total_qty += Number(line.qty_ordered ?? line.qty ?? 0);

      if (line.sku) {
        agg.sku_set.add(line.sku);
      }

      lineAggMap.set(line.po_id, agg);
    }

    const items = filteredHeaders.map((row) => {
      const agg = lineAggMap.get(row.id) ?? {
        total_qty: 0,
        sku_set: new Set<string>(),
      };

      return {
        id: row.id,
        po_no: row.po_no,
        eta: row.eta,
        status: row.status,
        total_qty: agg.total_qty,
        sku_count: agg.sku_set.size,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      scope,
      total: items.length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}