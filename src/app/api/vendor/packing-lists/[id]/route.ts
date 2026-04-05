import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PackingListHeaderRow = {
  id: string;
  pl_no: string | null;
  po_no: string | null;
  eta: string | null;
  total_qty: number | null;
  status: string | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
  vendor_id: string | null;
  asn_id: string | null;
};

type PackingListLineRow = {
  id: string;
  line_no: number | null;
  sku: string | null;
  description: string | null;
  qty: number | null;
  carton_no: string | null;
  po_no: string | null;
  style_code: string | null;
  color: string | null;
  size: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PackingListLineViewRow = PackingListLineRow & {
  packed_qty: number;
  gr_received_qty: number;
  balance_qty: number;
  progress_status: string;
};

type GrHeaderRow = {
  id: string;
  asn_id: string | null;
  status: string | null;
};

type GrLineRow = {
  gr_id: string | null;
  asn_line_id: string | null;
  qty_received: number | null;
};

type AsnHeaderRow = {
  id: string;
  asn_no: string | null;
  status: string | null;
  created_at: string | null;
  source_type?: string | null;
  source_id?: string | null;
  vendor_id?: string | null;
};

type AsnLineRow = {
  id: string;
  asn_id: string;
  line_no: number | null;
  sku: string | null;
  carton_no: string | null;
  qty_expected: number | null;
  qty: number | null;
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
  vendor_name_en?: string | null;
};

type AuthResult =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      scope: "ADMIN" | "VENDOR";
      vendorId: string | null;
    }
  | {
      ok: false;
      status: number;
      supabase: Awaited<ReturnType<typeof createClient>>;
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
      status: 401,
      supabase,
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
      supabase,
      error: "User profile not found",
    };
  }

  const profile = profileRaw as UserProfileRow;

  const userType = (profile.user_type || "").toUpperCase();
  const role = (profile.role || "").toUpperCase();
  const status = (profile.status || "").toUpperCase();

  const isVendorUser =
    userType === "VENDOR" &&
    (role === "VENDOR" ||
      role === "VENDOR_ADMIN" ||
      role === "VENDOR_USER") &&
    status === "ACTIVE" &&
    !!profile.vendor_id;

  const isAdmin =
    userType === "INTERNAL" &&
    (role === "ADMIN" ||
      role === "HQ_ADMIN" ||
      role === "LOGISTICS_ADMIN") &&
    status === "ACTIVE";

  if (!isVendorUser && !isAdmin) {
    return {
      ok: false,
      status: 403,
      supabase,
      error: "Forbidden",
    };
  }

  return {
    ok: true,
    supabase,
    scope: isAdmin ? "ADMIN" : "VENDOR",
    vendorId: profile.vendor_id ?? null,
  };
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function makePackingLineKey(lineNo: number | null, sku: string | null) {
  return `${String(lineNo ?? "")}::${String(sku ?? "")
    .trim()
    .toUpperCase()}`;
}

function makeAsnLineKey(lineNo: number | null, sku: string | null) {
  return `${String(lineNo ?? "")}::${String(sku ?? "")
    .trim()
    .toUpperCase()}`;
}

export async function GET(_req: NextRequest, context: RouteContext) {
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
      .select(`
        id,
        pl_no,
        po_no,
        eta,
        total_qty,
        status,
        remarks,
        created_at,
        updated_at,
        vendor_id,
        asn_id
      `)
      .eq("id", id);

    if (scope === "VENDOR") {
      headerQuery = headerQuery.eq("vendor_id", vendorId as string);
    }

    const { data: headerData, error: headerError } = await headerQuery.single();

    if (headerError || !headerData) {
      return NextResponse.json(
        {
          ok: false,
          error: "Packing List not found",
          debug: {
            id,
            scope,
            vendorId,
            headerError: headerError?.message ?? null,
          },
        },
        { status: 404 }
      );
    }

    const header = headerData as PackingListHeaderRow;

    const { data: vendorData, error: vendorError } = header.vendor_id
      ? await supabase
          .from("vendor")
          .select("id, vendor_code, vendor_name, vendor_name_en")
          .eq("id", header.vendor_id)
          .maybeSingle()
      : { data: null, error: null };

    if (vendorError) {
      return NextResponse.json(
        { ok: false, error: vendorError.message },
        { status: 500 }
      );
    }

    const vendor = (vendorData as VendorRow | null) ?? null;

    const { data: linesData, error: linesError } = await supabase
      .from("packing_list_lines")
      .select(`
        id,
        line_no,
        sku,
        description,
        qty,
        carton_no,
        po_no,
        style_code,
        color,
        size,
        created_at,
        updated_at
      `)
      .eq("packing_list_id", id)
      .order("line_no", { ascending: true });

    if (linesError) {
      return NextResponse.json(
        {
          ok: false,
          error: linesError.message,
          debug: { table: "packing_list_lines" },
        },
        { status: 500 }
      );
    }

    const lines = (linesData ?? []) as PackingListLineRow[];

    let asn: AsnHeaderRow | null = null;
    if (header.asn_id) {
      const { data: asnData, error: asnError } = await supabase
        .from("asn_header")
        .select(
          "id, asn_no, status, created_at, source_type, source_id, vendor_id"
        )
        .eq("id", header.asn_id)
        .maybeSingle();

      if (asnError) {
        return NextResponse.json(
          { ok: false, error: asnError.message },
          { status: 500 }
        );
      }

      asn = (asnData as AsnHeaderRow | null) ?? null;
    }

    const receivedByAsnLineId = new Map<string, number>();
    const asnLineIdByPackingLineKey = new Map<string, string>();
    let confirmedGrIds: string[] = [];

    if (header.asn_id) {
      const { data: asnLinesData, error: asnLinesError } = await supabase
        .from("asn_line")
        .select("id, asn_id, line_no, sku, carton_no, qty_expected, qty")
        .eq("asn_id", header.asn_id)
        .order("line_no", { ascending: true });

      if (asnLinesError) {
        return NextResponse.json(
          { ok: false, error: asnLinesError.message },
          { status: 500 }
        );
      }

      const asnLines = (asnLinesData ?? []) as AsnLineRow[];

      for (const row of asnLines) {
        const key = makeAsnLineKey(row.line_no, row.sku);
        asnLineIdByPackingLineKey.set(key, row.id);
      }

      const { data: grHeadersData, error: grHeadersError } = await supabase
        .from("gr_header")
        .select("id, asn_id, status")
        .eq("asn_id", header.asn_id)
        .eq("status", "CONFIRMED");

      if (grHeadersError) {
        return NextResponse.json(
          { ok: false, error: grHeadersError.message },
          { status: 500 }
        );
      }

      const grHeaders = (grHeadersData ?? []) as GrHeaderRow[];
      confirmedGrIds = grHeaders
        .map((row) => row.id)
        .filter((v): v is string => !!v);

      if (confirmedGrIds.length > 0) {
        const { data: grLinesData, error: grLinesError } = await supabase
          .from("gr_line")
          .select("gr_id, asn_line_id, qty_received")
          .in("gr_id", confirmedGrIds);

        if (grLinesError) {
          return NextResponse.json(
            { ok: false, error: grLinesError.message },
            { status: 500 }
          );
        }

        const grLines = (grLinesData ?? []) as GrLineRow[];

        for (const row of grLines) {
          const asnLineId = String(row.asn_line_id || "").trim();
          if (!asnLineId) continue;

          const current = receivedByAsnLineId.get(asnLineId) ?? 0;
          receivedByAsnLineId.set(
            asnLineId,
            current + safeNum(row.qty_received)
          );
        }
      }
    }

    const mappedLines: PackingListLineViewRow[] = lines.map((row, idx) => {
      const lineNo = Number(row.line_no ?? idx + 1);
      const packedQty = safeNum(row.qty);

      const packingLineKey = makePackingLineKey(lineNo, row.sku);
      const asnLineId = asnLineIdByPackingLineKey.get(packingLineKey) ?? null;

      const received = asnLineId
        ? receivedByAsnLineId.get(asnLineId) ?? 0
        : 0;

      const appliedReceived = Math.min(received, packedQty);
      const balanceQty = Math.max(packedQty - appliedReceived, 0);

      let progressStatus = "PENDING";
      if (appliedReceived <= 0) {
        progressStatus = "PENDING";
      } else if (appliedReceived < packedQty) {
        progressStatus = "PARTIAL";
      } else {
        progressStatus = "DONE";
      }

      return {
        ...row,
        line_no: lineNo,
        packed_qty: packedQty,
        gr_received_qty: appliedReceived,
        balance_qty: balanceQty,
        progress_status: progressStatus,
      };
    });

    const totalCartons = new Set(
      mappedLines
        .map((row) => String(row.carton_no ?? "").trim())
        .filter(Boolean)
    ).size;

    const summary = mappedLines.reduce(
      (acc, row) => {
        acc.total_qty += safeNum(row.packed_qty);
        acc.gr_received_qty += safeNum(row.gr_received_qty);
        acc.balance_qty += safeNum(row.balance_qty);
        return acc;
      },
      {
        total_cartons: totalCartons,
        total_qty: 0,
        gr_received_qty: 0,
        balance_qty: 0,
      }
    );

    const hasConfirmedGr = confirmedGrIds.length > 0;

    if (
      header.status === "FINALIZED" &&
      hasConfirmedGr &&
      summary.balance_qty === 0
    ) {
      await supabase
        .from("packing_list_header")
        .update({
          status: "INBOUND_COMPLETED",
        })
        .eq("id", header.id);

      header.status = "INBOUND_COMPLETED";
    }

    return NextResponse.json({
      ok: true,
      header,
      vendor: vendor
        ? {
            id: vendor.id,
            vendor_code: vendor.vendor_code ?? "-",
            vendor_name: vendor.vendor_name ?? "-",
            vendor_name_en: vendor.vendor_name_en ?? null,
          }
        : null,
      summary,
      asn: asn
        ? {
            id: asn.id,
            asn_no: asn.asn_no ?? "-",
            status: asn.status ?? "-",
            created_at: asn.created_at ?? null,
            source_type: asn.source_type ?? null,
            source_id: asn.source_id ?? null,
            vendor_id: asn.vendor_id ?? null,
          }
        : null,
      lines: mappedLines,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}