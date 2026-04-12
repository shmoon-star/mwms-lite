import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TxRow = {
  id: string;
  sku: string;
  tx_type: string | null;
  qty_delta: number | null;
  ref_type: string | null;
  ref_id: string | null;
  note?: string | null;
  created_at: string | null;
};

function uniq(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const sku = searchParams.get("sku");
    const txType = searchParams.get("tx_type");
    const refType = searchParams.get("ref_type");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");

    let query = supabase
      .from("inventory_tx")
      .select("id, sku, tx_type, qty_delta, ref_type, ref_id, note, created_at")
      .order("created_at", { ascending: false });

    // DN_RESERVE는 물리적 재고 이동이 아니므로 Ledger에서 제외
    query = query.neq("tx_type", "DN_RESERVE");

    if (sku) query = query.eq("sku", sku);
    if (txType) query = query.eq("tx_type", txType);
    if (refType) query = query.eq("ref_type", refType);

    if (fromDate) {
      query = query.gte("created_at", `${fromDate}T00:00:00`);
    }

    if (toDate) {
      query = query.lte("created_at", `${toDate}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const txRows = (data ?? []) as TxRow[];

    const grRefIds = uniq(
      txRows
        .filter((r) => r.tx_type === "GR" && r.ref_id)
        .map((r) => r.ref_id)
    );

    const dnRefIds = uniq(
      txRows
        .filter((r) => r.tx_type === "DN_SHIP" && r.ref_id)
        .map((r) => r.ref_id)
    );

    const grMap = new Map<string, any>();
    const dnMap = new Map<string, any>();
    const asnMap = new Map<string, any>();
    const poMap = new Map<string, any>();
    const vendorMap = new Map<string, any>();

    if (grRefIds.length > 0) {
      const { data: grHeaders, error: grError } = await supabase
        .from("gr_header")
        .select("*")
        .in("id", grRefIds);

      if (grError) {
        return NextResponse.json({ error: grError.message }, { status: 500 });
      }

      for (const row of grHeaders ?? []) {
        grMap.set(row.id, row);
      }

      const asnIds = uniq(
        (grHeaders ?? []).map((g: any) => g.asn_id ?? g.asn_header_id ?? null)
      );

      if (asnIds.length > 0) {
        const { data: asnHeaders, error: asnError } = await supabase
          .from("asn_header")
          .select("*")
          .in("id", asnIds);

        if (asnError) {
          return NextResponse.json({ error: asnError.message }, { status: 500 });
        }

        for (const row of asnHeaders ?? []) {
          asnMap.set(row.id, row);
        }

        const poIds = uniq(
          (asnHeaders ?? []).map((a: any) => a.po_id ?? a.po_header_id ?? null)
        );

        if (poIds.length > 0) {
          const { data: poHeaders, error: poError } = await supabase
            .from("po_header")
            .select("*")
            .in("id", poIds);

          if (poError) {
            return NextResponse.json({ error: poError.message }, { status: 500 });
          }

          for (const row of poHeaders ?? []) {
            poMap.set(row.id, row);
          }

          const vendorIds = uniq(
            (poHeaders ?? []).map((p: any) => p.vendor_id ?? null)
          );

          if (vendorIds.length > 0) {
            const { data: vendors, error: vendorError } = await supabase
              .from("vendor")
              .select("id, vendor_code, vendor_name, vendor_name_en")
              .in("id", vendorIds);

            if (vendorError) {
              return NextResponse.json(
                { error: vendorError.message },
                { status: 500 }
              );
            }

            for (const row of vendors ?? []) {
              vendorMap.set(row.id, row);
            }
          }
        }
      }
    }

    if (dnRefIds.length > 0) {
      const { data: dnHeaders, error: dnError } = await supabase
        .from("dn_header")
        .select("*")
        .in("id", dnRefIds);

      if (dnError) {
        return NextResponse.json({ error: dnError.message }, { status: 500 });
      }

      for (const row of dnHeaders ?? []) {
        dnMap.set(row.id, row);
      }
    }

    const rows = txRows.map((r) => {
      let displayRefType = r.ref_type ?? r.tx_type ?? "";
      let refNo = r.ref_id;
      let relatedNo = "";
      let linkHref = "";
      let displayTime = r.created_at ?? "";

      if (r.tx_type === "GR" && r.ref_id) {
        const gr = grMap.get(r.ref_id);

        const asn =
          asnMap.get(gr?.asn_id) ??
          asnMap.get(gr?.asn_header_id) ??
          null;

        const po =
          poMap.get(asn?.po_id) ??
          poMap.get(asn?.po_header_id) ??
          null;

        const grNo =
          safeString(gr?.gr_no) ||
          safeString(gr?.gr_number) ||
          safeString(gr?.doc_no) ||
          safeString(r.ref_id);

        const asnNo =
          safeString(gr?.asn_no) ||
          safeString(asn?.asn_no) ||
          safeString(asn?.doc_no);

        const poNo =
          safeString(gr?.po_no) ||
          safeString(asn?.po_no) ||
          safeString(po?.po_no) ||
          safeString(po?.doc_no);

        const vendorId =
          gr?.vendor_id ||
          asn?.vendor_id ||
          po?.vendor_id ||
          null;

        const vendor = vendorId ? vendorMap.get(vendorId) : null;

        const vendorCode =
          safeString(vendor?.vendor_code) ||
          safeString(vendor?.vendor_name) ||
          safeString(vendor?.vendor_name_en);

        displayRefType = "GR";
        refNo = grNo;

        const relatedParts: string[] = [];
        if (vendorCode) relatedParts.push(`Vendor: ${vendorCode}`);
        if (asnNo) relatedParts.push(`ASN: ${asnNo}`);
        if (poNo) relatedParts.push(`PO: ${poNo}`);
        relatedNo = relatedParts.join(" / ");
      }

      if (r.tx_type === "DN_SHIP" && r.ref_id) {
        const dn = dnMap.get(r.ref_id);

        const dnNo =
          safeString(dn?.dn_no) ||
          safeString(dn?.doc_no) ||
          safeString(r.ref_id);

        const shipTo =
          safeString(dn?.ship_to) ||
          safeString(dn?.customer) ||
          safeString(dn?.customer_name);

        const tracking =
          safeString(dn?.tracking_no) ||
          safeString(dn?.tracking);

        displayRefType = "DN";
        refNo = dnNo;
        linkHref = `/outbound/dn/${r.ref_id}`;

        const relatedParts: string[] = [];
        if (shipTo) relatedParts.push(`Ship To: ${shipTo}`);
        if (tracking) relatedParts.push(`Tracking: ${tracking}`);
        relatedNo = relatedParts.join(" / ");
      }

      return {
        ...r,
        ref_display_type: displayRefType,
        ref_no: refNo,
        related_no: relatedNo,
        link_href: linkHref,
        display_time: displayTime,
      };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}