import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyPackingListSubmitted, safeNotify, getVendorInfo} from "@/lib/notify";


export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
  asn_id: string | null;
};

type AuthResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      scope: "ADMIN" | "VENDOR";
      vendorId: string | null;
      userId: string;
    }
  | {
      ok: false;
      supabase: Awaited<ReturnType<typeof createClient>>;
      status: number;
      error: string;
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

  if (!isVendorUser && !isAdmin) {
    return {
      ok: false,
      supabase,
      status: 403,
      error: "Forbidden",
    };
  }

  return {
    ok: true,
    supabase,
    scope: isAdmin ? "ADMIN" : "VENDOR",
    vendorId: profile.vendor_id ?? null,
    userId: user.id,
  };
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, scope, vendorId, userId } = auth;

  try {
    const { id } = await context.params;

    let headerQuery = supabase
      .from("packing_list_header")
      .select("id, pl_no, po_no, vendor_id, status, asn_id")
      .eq("id", id);

    if (scope === "VENDOR") {
      headerQuery = headerQuery.eq("vendor_id", vendorId as string);
    }

    const { data: headerRaw, error: headerError } = await headerQuery.single();

    if (headerError || !headerRaw) {
      return NextResponse.json(
        { ok: false, error: "Packing List not found" },
        { status: 404 }
      );
    }

    const header = headerRaw as PackingListHeaderRow;

    if (header.status !== "DRAFT") {
      return NextResponse.json(
        {
          ok: false,
          error: `Only DRAFT packing lists can be submitted. Current status: ${header.status ?? "-"}`,
        },
        { status: 400 }
      );
    }

    const { data: lines, error: linesError } = await supabase
      .from("packing_list_lines")
      .select("id, sku, qty")
      .eq("packing_list_id", id);

    if (linesError) {
      return NextResponse.json(
        { ok: false, error: linesError.message },
        { status: 500 }
      );
    }

    if (!lines || lines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Packing List has no lines" },
        { status: 400 }
      );
    }

    const invalidLine = lines.find(
      (row: any) => !row.sku || Number(row.qty ?? 0) <= 0
    );

    if (invalidLine) {
      return NextResponse.json(
        { ok: false, error: "Packing List contains invalid lines" },
        { status: 400 }
      );
    }

const { data: updatedHeader, error: updateError } = await supabase
      .from("packing_list_header")
      .update({
        status: "SUBMITTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, pl_no, po_no, vendor_id, status, asn_id")
      .single();

    if (updateError || !updatedHeader) {
      return NextResponse.json(
        {
          ok: false,
          error: updateError?.message ?? "Failed to submit packing list",
        },
        { status: 500 }
      );
    }

    const vendorInfo = updatedHeader.vendor_id
      ? await getVendorInfo(updatedHeader.vendor_id)
      : null;

    await safeNotify(`PL_SUBMITTED:${updatedHeader.pl_no || updatedHeader.id}`, async () => {
      await notifyPackingListSubmitted({
        packingListNo: updatedHeader.pl_no || updatedHeader.id,
        poNo: updatedHeader.po_no || null,
        vendorName: vendorInfo?.vendor_name || vendorInfo?.vendor_code || null,
      });
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Packing List submitted successfully",
        data: updatedHeader,
      },
      { status: 200 }
    );
    return NextResponse.json(
      {
        ok: true,
        message: "Packing List submitted successfully",
        data: updatedHeader,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}