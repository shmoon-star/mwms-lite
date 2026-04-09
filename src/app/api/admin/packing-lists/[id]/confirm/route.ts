import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePlQtyByPo } from "@/lib/pl-qty-validator";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildAsnNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `ASN-${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

async function getAuthorizedAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("auth_user_id, user_type, role, status")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false as const,
      status: 403,
      error: "User profile not found",
    };
  }

  const userType = String(profile.user_type || "").toUpperCase();
  const role = String(profile.role || "").toUpperCase();
  const status = String(profile.status || "").toUpperCase();

  const isAdmin =
    userType === "INTERNAL" &&
    role === "ADMIN" &&
    status === "ACTIVE";

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedAdmin();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const adminDb = createAdminClient();

  try {
    const { id: packingListId } = await context.params;

    if (!packingListId) {
      return NextResponse.json(
        { ok: false, error: "packingListId is required" },
        { status: 400 }
      );
    }

    const { data: header, error: headerError } = await adminDb
      .from("packing_list_header")
      .select("*")
      .eq("id", packingListId)
      .single();

    if (headerError || !header) {
      return NextResponse.json(
        { ok: false, error: "Packing list not found" },
        { status: 404 }
      );
    }

    if (String(header.status || "").toUpperCase() !== "REVIEWED") {
      return NextResponse.json(
        {
          ok: false,
          error: `Only REVIEWED can be confirmed. Current status: ${header.status}`,
        },
        { status: 400 }
      );
    }

    const { data: lines, error: linesError } = await adminDb
      .from("packing_list_lines")
      .select("*")
      .eq("packing_list_id", packingListId)
      .order("line_no", { ascending: true });

    if (linesError) {
      return NextResponse.json(
        { ok: false, error: linesError.message },
        { status: 500 }
      );
    }

    if (!lines || lines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Packing list has no lines" },
        { status: 400 }
      );
    }

    // ── PO vs PL SKU 수량 검증 ─────────────────────────────────────
    if (header.po_no) {
      const validation = await validatePlQtyByPo(adminDb, header.po_no, packingListId);
      if (!validation.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: validation.message,
            mismatches: validation.mismatches,
            skuRows: validation.skuRows,
          },
          { status: 422 }
        );
      }
    }

    if (header.asn_id) {
      const { data: existingAsn } = await adminDb
        .from("asn_header")
        .select("id, asn_no, status")
        .eq("id", header.asn_id)
        .maybeSingle();

      if (existingAsn) {
        const { data: updatedHeader, error: updatePlError } = await adminDb
          .from("packing_list_header")
          .update({
            status: "CONFIRMED",
          })
          .eq("id", packingListId)
          .select("*")
          .single();

        if (updatePlError || !updatedHeader) {
          return NextResponse.json(
            {
              ok: false,
              error:
                updatePlError?.message ??
                "ASN exists, but packing list confirm failed",
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            ok: true,
            message: "Packing list confirmed with existing ASN",
            header: updatedHeader,
            asn: existingAsn,
          },
          { status: 200 }
        );
      }
    }

    const asnNo = buildAsnNo();

    const { data: insertedAsnHeader, error: asnHeaderError } = await adminDb
      .from("asn_header")
      .insert({
        asn_no: asnNo,
        po_no: header.po_no ?? null,
        vendor_id: header.vendor_id ?? null,
        status: "OPEN",
        source_type: "PACKING_LIST",
        source_ref_type: "PACKING_LIST",
        source_ref_id: packingListId,
      })
      .select("*")
      .single();

    if (asnHeaderError || !insertedAsnHeader) {
      return NextResponse.json(
        {
          ok: false,
          error: asnHeaderError?.message ?? "Failed to create ASN header",
        },
        { status: 500 }
      );
    }

    const asnId = insertedAsnHeader.id as string;

    const asnLineRows = lines.map((line: any, idx: number) => ({
      asn_id: asnId,
      line_no: line.line_no ?? idx + 1,
      sku: line.sku,
      qty: Number(line.qty ?? 0),
      qty_received: 0,
      po_no: line.po_no ?? header.po_no ?? null,
      po_line_no: line.po_line_no ?? null,
    }));

    const { data: insertedAsnLines, error: asnLinesError } = await adminDb
      .from("asn_line")
      .insert(asnLineRows)
      .select("*");

    if (asnLinesError) {
      await adminDb.from("asn_header").delete().eq("id", asnId);

      return NextResponse.json(
        {
          ok: false,
          error: asnLinesError.message,
        },
        { status: 500 }
      );
    }

    const { data: updatedPackingList, error: updatePackingListError } =
      await adminDb
        .from("packing_list_header")
        .update({
          status: "CONFIRMED",
          asn_no: asnNo,
          asn_id: asnId,
        })
        .eq("id", packingListId)
        .select("*")
        .single();

    if (updatePackingListError || !updatedPackingList) {
      await adminDb.from("asn_line").delete().eq("asn_id", asnId);
      await adminDb.from("asn_header").delete().eq("id", asnId);

      return NextResponse.json(
        {
          ok: false,
          error:
            updatePackingListError?.message ??
            "ASN created, but packing list update failed",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Packing list confirmed and ASN created successfully",
        header: updatedPackingList,
        asn: insertedAsnHeader,
        asn_lines: insertedAsnLines ?? [],
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