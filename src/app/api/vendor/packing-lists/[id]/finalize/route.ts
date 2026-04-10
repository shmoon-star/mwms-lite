import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyAsnCreatedFromPackingList, safeNotify, getVendorInfo } from "@/lib/notify";

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

type PackingListLineRow = {
  id: string;
  line_no: number | null;
  sku: string | null;
  qty: number | null;
  carton_no: string | null;
};

type POHeaderRow = {
  id: string;
  po_no: string | null;
  status: string | null;
  vendor_id: string | null;
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

function makeAsnNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `ASN-${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const auth = await getAuthorizedUser();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { supabase, scope, vendorId } = auth;

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

    if (header.status !== "SUBMITTED") {
      return NextResponse.json(
        {
          ok: false,
          error: `Only SUBMITTED packing lists can be finalized. Current status: ${header.status ?? "-"}`,
        },
        { status: 400 }
      );
    }

    if (header.asn_id) {
      return NextResponse.json(
        {
          ok: true,
          message: "ASN already linked",
          asn_id: header.asn_id,
        },
        { status: 200 }
      );
    }

    const { data: poRaw, error: poError } = await supabase
      .from("po_header")
      .select("id, po_no, status, vendor_id")
      .eq("po_no", header.po_no)
      .single();

    if (poError || !poRaw) {
      return NextResponse.json(
        { ok: false, error: "Connected PO not found" },
        { status: 404 }
      );
    }

    const po = poRaw as POHeaderRow;

    const { data: lineRows, error: linesError } = await supabase
      .from("packing_list_lines")
      .select("id, line_no, sku, qty, carton_no")
      .eq("packing_list_id", id)
      .order("line_no", { ascending: true });

    if (linesError) {
      return NextResponse.json(
        { ok: false, error: linesError.message },
        { status: 500 }
      );
    }

    const lines = (lineRows ?? []) as PackingListLineRow[];

    console.log(
  "FINALIZE lines",
  lines.map((x) => ({
    line_no: x.line_no,
    sku: x.sku,
    carton_no: x.carton_no,
  }))
);

    if (lines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Packing List has no lines" },
        { status: 400 }
      );
    }

    const invalidLine = lines.find((row) => !row.sku || Number(row.qty ?? 0) <= 0);

    if (invalidLine) {
      return NextResponse.json(
        { ok: false, error: "Packing List contains invalid lines" },
        { status: 400 }
      );
    }

    const asnNo = makeAsnNo();

    const { data: asnHeaderRaw, error: asnHeaderError } = await supabase
      .from("asn_header")
      .insert({
        asn_no: asnNo,
        po_id: po.id,
        vendor_id: po.vendor_id,
        status: "OPEN",
        source_type: "PACKING_LIST",
        source_id: header.id,
      })
      .select("id, asn_no, po_id, vendor_id, status, source_type, source_id")
      .single();

    if (asnHeaderError || !asnHeaderRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: asnHeaderError?.message ?? "Failed to create ASN header",
        },
        { status: 500 }
      );
    }

    const asnId = asnHeaderRaw.id as string;

    const asnLinePayload = lines.map((line, idx) => ({
      asn_id: asnId,
      line_no: line.line_no ?? idx + 1,
      sku: line.sku,
      qty: Number(line.qty ?? 0),
      qty_received: 0,
      carton_no: (line as any).carton_no ?? null,
    }));

    console.log("FINALIZE asnLinePayload", asnLinePayload);

    const { error: asnLineError } = await supabase
      .from("asn_line")
      .insert(asnLinePayload);

    if (asnLineError) {
      await supabase.from("asn_header").delete().eq("id", asnId);

      return NextResponse.json(
        {
          ok: false,
          error: asnLineError.message,
        },
        { status: 500 }
      );
    }
const { data: insertedAsnLines, error: insertedAsnLinesError } = await supabase
  .from("asn_line")
  .select("id, line_no, sku, carton_no")
  .eq("asn_id", asnId)
  .order("line_no", { ascending: true });

console.log("FINALIZE insertedAsnLines", insertedAsnLines, insertedAsnLinesError);


    // FINALIZE 시점에 pl_no 부여 (아직 없는 경우)
    let plNo = header.pl_no;
    if (!plNo) {
      const { data: plNoData, error: plNoError } = await supabase.rpc("generate_pl_no");
      if (plNoError || !plNoData) {
        await supabase.from("asn_header").delete().eq("id", asnId);
        return NextResponse.json(
          { ok: false, error: plNoError?.message ?? "Failed to generate pl_no" },
          { status: 500 }
        );
      }
      plNo = plNoData as string;
    }

    const { error: plUpdateError } = await supabase
      .from("packing_list_header")
      .update({
        status: "FINALIZED",
        pl_no: plNo,
        asn_id: asnId,
        finalized_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (plUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          error: plUpdateError.message,
        },
        { status: 500 }
      );
    }

const { error: poUpdateError } = await supabase
      .from("po_header")
      .update({
        status: "ASN_CREATED",
      })
      .eq("id", po.id);

    if (poUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          error: poUpdateError.message,
        },
        { status: 500 }
      );
    }

    const vendorInfo = po.vendor_id ? await getVendorInfo(po.vendor_id) : null;

    await safeNotify(`ASN_CREATED:${asnNo}`, async () => {
      await notifyAsnCreatedFromPackingList({
        packingListId: header.id,
        packingListNo: header.pl_no || header.id,
        asnNo,
        poNo: po.po_no || null,
        vendorName: vendorInfo?.vendor_name || vendorInfo?.vendor_code || null,
      });
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Packing List finalized and ASN created successfully",
        data: {
          packing_list_id: header.id,
          asn_id: asnId,
          asn_no: asnNo,
          po_id: po.id,
          po_no: po.po_no,
        },
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