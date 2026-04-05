import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function countByStatus<T extends { status?: string | null }>(
  rows: T[] | null | undefined,
  status: string
) {
  return rows?.filter((row) => String(row.status ?? "").toUpperCase() === status).length ?? 0;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const [dnRes, plRes, asnRes, grRes] = await Promise.all([
      supabase
        .from("dn_header")
        .select("id, dn_no, status, created_at"),

      supabase
        .from("packing_list_header")
        .select("id, pl_no, po_no, status, created_at, finalized_at"),

      supabase
        .from("asn_header")
        .select("id, asn_no, status, created_at"),

      supabase
        .from("gr_header")
        .select("id, gr_no, asn_id, status, created_at, confirmed_at"),
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
    // DN (기존 로직 유지)
    // -------------------------
    const open_dn = countByStatus(dns, "PENDING");
    const reserved_dn = countByStatus(dns, "RESERVED");
    const shipped_dn = countByStatus(dns, "SHIPPED");

    // -------------------------
    // Packing List
    // -------------------------
    const draft_pl = countByStatus(packingLists, "DRAFT");
    const submitted_pl = countByStatus(packingLists, "SUBMITTED");
    const finalized_pl = countByStatus(packingLists, "FINALIZED");
    const inbound_completed_pl = countByStatus(packingLists, "INBOUND_COMPLETED");

    const open_pl =
      draft_pl + submitted_pl + finalized_pl;

    // -------------------------
    // ASN
    // -------------------------
    const created_asn = countByStatus(asns, "CREATED");
    const partial_received_asn = countByStatus(asns, "PARTIAL_RECEIVED");
    const full_received_asn = countByStatus(asns, "FULL_RECEIVED");

    const open_asn = created_asn + partial_received_asn;

    // -------------------------
    // GR
    // -------------------------
    const pending_gr = countByStatus(grs, "PENDING");
    const confirmed_gr = countByStatus(grs, "CONFIRMED");

    // 최근 목록
    const recent_dns = [...dns].slice(0, 10);
    const recent_packing_lists = [...packingLists].slice(0, 10);
    const recent_asns = [...asns].slice(0, 10);
    const recent_grs = [...grs].slice(0, 10);

    return NextResponse.json({
      ok: true,

      // 기존 DN 응답 키 유지
      open_dn,
      reserved_dn,
      shipped_dn,

      // 추가 지표
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