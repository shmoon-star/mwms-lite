import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_req: NextRequest, context: RouteContext) {
  const supabase = await createClient();

  try {
    const { id: packingListId } = await context.params;

    if (!packingListId) {
      return NextResponse.json(
        { ok: false, error: "packingListId is required" },
        { status: 400 }
      );
    }

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
      profile.user_type === "VENDOR" &&
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

    // 4) packing list 조회 (자기 vendor 문서인지 확인)
    const { data: packingList, error: packingListError } = await supabase
      .from("packing_list_header")
      .select("id, pl_no, vendor_id, status, submitted_at")
      .eq("id", packingListId)
      .single();

    if (packingListError || !packingList) {
      return NextResponse.json(
        { ok: false, error: "Packing list not found" },
        { status: 404 }
      );
    }

    if (packingList.vendor_id !== vendorId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: not your vendor document" },
        { status: 403 }
      );
    }

    if (packingList.status !== "DRAFT") {
      return NextResponse.json(
        {
          ok: false,
          error: `Only DRAFT can be submitted. Current status: ${packingList.status}`,
        },
        { status: 400 }
      );
    }

    // 5) line 존재 여부 확인
    const { count: lineCount, error: lineCountError } = await supabase
      .from("packing_list_lines")
      .select("*", { count: "exact", head: true })
      .eq("packing_list_id", packingListId);

    if (lineCountError) {
      return NextResponse.json(
        { ok: false, error: lineCountError.message },
        { status: 500 }
      );
    }

    if (!lineCount || lineCount < 1) {
      return NextResponse.json(
        { ok: false, error: "Cannot submit packing list without lines" },
        { status: 400 }
      );
    }

    // 6) 상태 변경
    const { data: updatedHeader, error: updateError } = await supabase
      .from("packing_list_header")
      .update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", packingListId)
      .eq("status", "DRAFT")
      .select("*")
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

    return NextResponse.json(
      {
        ok: true,
        message: "Packing list submitted successfully",
        header: updatedHeader,
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