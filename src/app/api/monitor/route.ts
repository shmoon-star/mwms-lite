import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function countByStatus<T extends { status?: string | null }>(
  rows: T[] | null | undefined,
  status: string
) {
  return (
    rows?.filter((row) => String(row.status ?? "").toUpperCase() === status)
      .length ?? 0
  );
}

function uniq(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function loadPackingListLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plIds: string[]
) {
  if (!plIds.length) return [];

  const tries: Array<{ table: string; fk: string }> = [
    { table: "packing_list_lines", fk: "packing_list_id" },
    { table: "packing_list_line", fk: "packing_list_id" },
    { table: "packing_list_lines", fk: "pl_id" },
    { table: "packing_list_line", fk: "pl_id" },
    { table: "packing_list_lines", fk: "header_id" },
    { table: "packing_list_line", fk: "header_id" },
  ];

  for (const t of tries) {
    const { data, error } = await supabase
      .from(t.table)
      .select("*")
      .in(t.fk, plIds);

    if (!error) {
      return data ?? [];
    }
  }

  return [];
}

export async function GET() {
  try {
    const supabase = await createClient();

    const [dnRes, plRes, asnRes, grRes] = await Promise.all([
      supabase
        .from("dn_header")
        .select("id, dn_no, status, created_at, confirmed_at")
        .order("created_at", { ascending: false }),

      supabase
        .from("packing_list_header")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("asn_header")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("gr_header")
        .select("id, gr_no, asn_id, status, created_at, confirmed_at")
        .order("created_at", { ascending: false }),
    ]);

    if (dnRes.error) {
      return NextResponse.json(
        { ok: false, error: dnRes.error.message },
        { status: 500 }
      );
    }

    if (plRes.error) {
      return NextResponse.json(
        { ok: false, error: plRes.error.message },
        { status: 500 }
      );
    }

    if (asnRes.error) {
      return NextResponse.json(
        { ok: false, error: asnRes.error.message },
        { status: 500 }
      );
    }

    if (grRes.error) {
      return NextResponse.json(
        { ok: false, error: grRes.error.message },
        { status: 500 }
      );
    }

    const dns = dnRes.data ?? [];
    const packingLists = plRes.data ?? [];
    const asns = asnRes.data ?? [];
    const grs = grRes.data ?? [];

    // -------------------------
    // DN summary
    // -------------------------
    const open_dn = countByStatus(dns, "PENDING");
    const reserved_dn = countByStatus(dns, "RESERVED");
    const shipped_dn = countByStatus(dns, "SHIPPED");

    // -------------------------
    // Packing List summary
    // -------------------------
    const draft_pl = countByStatus(packingLists, "DRAFT");
    const submitted_pl = countByStatus(packingLists, "SUBMITTED");
    const finalized_pl = countByStatus(packingLists, "FINALIZED");
    const inbound_completed_pl = countByStatus(
      packingLists,
      "INBOUND_COMPLETED"
    );

    const open_pl = draft_pl + submitted_pl + finalized_pl;

    // -------------------------
    // ASN summary
    // -------------------------
    const created_asn = countByStatus(asns, "CREATED");
    const partial_received_asn = countByStatus(asns, "PARTIAL_RECEIVED");
    const full_received_asn = countByStatus(asns, "FULL_RECEIVED");

    const open_asn = created_asn + partial_received_asn;

    // -------------------------
    // GR summary
    // -------------------------
    const pending_gr = countByStatus(grs, "PENDING");
    const confirmed_gr = countByStatus(grs, "CONFIRMED");

    // -------------------------
    // Packing List enrich
    // -------------------------
    const recentPackingListsBase = [...packingLists].slice(0, 10);
    const recentPackingListIds = uniq(recentPackingListsBase.map((r: any) => r.id));

    const asnMap = new Map<string, any>();
    for (const row of asns) {
      asnMap.set((row as any).id, row);
    }

    const poIds = uniq(
      recentPackingListsBase.map((r: any) => r.po_id ?? null)
    );

    const vendorIds = uniq(
      recentPackingListsBase.map((r: any) => r.vendor_id ?? null)
    );

    const poMap = new Map<string, any>();
    if (poIds.length > 0) {
      const { data: poRows, error: poError } = await supabase
        .from("po_header")
        .select("*")
        .in("id", poIds);

      if (poError) {
        return NextResponse.json(
          { ok: false, error: poError.message },
          { status: 500 }
        );
      }

      for (const row of poRows ?? []) {
        poMap.set(row.id, row);
      }
    }

    const vendorMap = new Map<string, any>();
    if (vendorIds.length > 0) {
      const { data: vendorRows, error: vendorError } = await supabase
        .from("vendor")
        .select("id, vendor_code, vendor_name, vendor_name_en")
        .in("id", vendorIds);

      if (vendorError) {
        return NextResponse.json(
          { ok: false, error: vendorError.message },
          { status: 500 }
        );
      }

      for (const row of vendorRows ?? []) {
        vendorMap.set(row.id, row);
      }
    }

    const plLineRows = await loadPackingListLines(supabase, recentPackingListIds);
    const qtyMap = new Map<string, number>();

    for (const row of plLineRows ?? []) {
      const headerId =
        row.packing_list_id ??
        row.pl_id ??
        row.header_id ??
        null;

      if (!headerId) continue;

      const qty =
        safeNum(row.qty) ||
        safeNum(row.packed_qty) ||
        safeNum(row.qty_packed) ||
        safeNum(row.quantity);

      qtyMap.set(String(headerId), (qtyMap.get(String(headerId)) ?? 0) + qty);
    }

    const recent_packing_lists = recentPackingListsBase.map((pl: any) => {
      const asn =
        (pl.asn_id ? asnMap.get(pl.asn_id) : null) ?? null;

      const po =
        (pl.po_id ? poMap.get(pl.po_id) : null) ?? null;

      const vendor =
        (pl.vendor_id ? vendorMap.get(pl.vendor_id) : null) ?? null;

      return {
        id: pl.id,
        pl_no:
          pl.pl_no ??
          pl.packing_list_no ??
          null,
        po_id:
          pl.po_id ?? null,
        po_no:
          pl.po_no ??
          po?.po_no ??
          null,
        vendor_id:
          pl.vendor_id ?? null,
vendor_code:
  vendor?.vendor_code ?? null,
vendor_name:
  vendor?.vendor_name ??
  vendor?.vendor_name_en ??
  null,
        asn_id:
          pl.asn_id ??
          asn?.id ??
          null,
        asn_no:
          pl.asn_no ??
          asn?.asn_no ??
          null,
        eta:
          pl.eta ??
          po?.eta ??
          null,
        qty:
          qtyMap.get(String(pl.id)) ?? 0,
        status:
          pl.status ?? null,
        created_at:
          pl.created_at ?? null,
        finalized_at:
          pl.finalized_at ?? null,
      };
    });

    const recent_dns = [...dns].slice(0, 10);
    const recent_asns = [...asns].slice(0, 10);
    const recent_grs = [...grs].slice(0, 10);

    return NextResponse.json({
      ok: true,

      open_dn,
      reserved_dn,
      shipped_dn,

      open_pl,
      draft_pl,
      submitted_pl,
      finalized_pl,
      inbound_completed_pl,

      open_asn,
      created_asn,
      partial_received_asn,
      full_received_asn,

      pending_gr,
      confirmed_gr,

      totals: {
        dn: dns.length,
        packing_list: packingLists.length,
        asn: asns.length,
        gr: grs.length,
      },

      recent: {
        dns: recent_dns,
        packing_lists: recent_packing_lists,
        asns: recent_asns,
        grs: recent_grs,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}