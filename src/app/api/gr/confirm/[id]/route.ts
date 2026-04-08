import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sb = await createClient();

    const { id: grId } = await context.params;

    if (!grId || typeof grId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid GR id is required" },
        { status: 400 }
      );
    }

    const { data: grHeader, error: grHeaderErr } = await sb
      .from("gr_header")
      .select("id, gr_no, asn_id, status, confirmed_at")
      .eq("id", grId)
      .maybeSingle();

    if (grHeaderErr) throw grHeaderErr;

    if (!grHeader) {
      return NextResponse.json(
        { ok: false, error: `GR not found: ${grId}` },
        { status: 404 }
      );
    }

    if (grHeader.status === "CONFIRMED") {
      return NextResponse.json({
        ok: true,
        message: "Already confirmed",
        gr_id: grHeader.id,
        gr_no: grHeader.gr_no,
      });
    }

    const { data: grLines, error: grLinesErr } = await sb
      .from("gr_line")
      .select("id, gr_id, sku, qty, qty_received, asn_line_id, po_line_id")
      .eq("gr_id", grId);

    if (grLinesErr) throw grLinesErr;

    if (!grLines || grLines.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No GR lines found" },
        { status: 400 }
      );
    }

    for (const line of grLines) {
      const receivedQty = Number(line.qty_received ?? line.qty ?? 0);

      if (!line.sku) {
        throw new Error(`Missing sku in GR line ${line.id}`);
      }

      if (!Number.isFinite(receivedQty) || receivedQty < 0) {
        throw new Error(`Invalid qty in GR line ${line.id}`);
      }

      // 0 수량은 inventory / tx 반영 스킵
      if (receivedQty === 0) {
        continue;
      }

      const { data: existingInv, error: invSelectErr } = await sb
        .from("inventory")
        .select("sku, qty_onhand")
        .eq("sku", line.sku)
        .maybeSingle();

      if (invSelectErr) throw invSelectErr;

      if (existingInv) {
        const { error: invUpdateErr } = await sb
          .from("inventory")
          .update({
            qty_onhand: Number(existingInv.qty_onhand ?? 0) + receivedQty,
          })
          .eq("sku", line.sku);

        if (invUpdateErr) throw invUpdateErr;
      } else {
        const { error: invInsertErr } = await sb
          .from("inventory")
          .insert({
            sku: line.sku,
            qty_onhand: receivedQty,
            qty_reserved: 0,
            allocated: 0,
          });

        if (invInsertErr) throw invInsertErr;
      }

      const { error: txErr } = await sb
        .from("inventory_tx")
        .insert({
          sku: line.sku,
          tx_type: "GR",
          qty_delta: receivedQty,
          ref_type: "GR",
          ref_id: grId,
          created_at: new Date().toISOString(),
        });

      if (txErr) throw txErr;
    }

    const now = new Date().toISOString();

    const { error: confirmErr } = await sb
      .from("gr_header")
      .update({
        status: "CONFIRMED",
        confirmed_at: now,
      })
      .eq("id", grId);

    if (confirmErr) throw confirmErr;

    // ASN 상태도 같이 종료 처리
    if (grHeader.asn_id) {
      const { data: asnHeader, error: asnHeaderErr } = await sb
        .from("asn_header")
        .select("id, po_id, po_no")
        .eq("id", grHeader.asn_id)
        .maybeSingle();

      if (asnHeaderErr) throw asnHeaderErr;

      const { data: asnLines, error: asnLinesErr } = await sb
        .from("asn_line")
        .select("id, qty, qty_expected, qty_received")
        .eq("asn_id", grHeader.asn_id);

      if (asnLinesErr) throw asnLinesErr;

      const totalExpected = (asnLines || []).reduce((sum: number, row: any) => {
        return sum + Number(row.qty ?? row.qty_expected ?? 0);
      }, 0);

      const totalReceived = (asnLines || []).reduce((sum: number, row: any) => {
        return sum + Number(row.qty_received ?? 0);
      }, 0);

      let nextAsnStatus = "OPEN";
      if (totalReceived > 0 && totalReceived < totalExpected) {
        nextAsnStatus = "PARTIAL_RECEIVED";
      }
      if (totalExpected > 0 && totalReceived >= totalExpected) {
        nextAsnStatus = "FULL_RECEIVED";
      }

      const { error: asnUpdateErr } = await sb
        .from("asn_header")
        .update({
          status: nextAsnStatus,
        })
        .eq("id", grHeader.asn_id);

      if (asnUpdateErr) throw asnUpdateErr;

      // PO status도 같이 갱신
      const poId = asnHeader?.po_id ?? null;
      const poNo = asnHeader?.po_no ?? null;

      if (poId || poNo) {
        let relatedAsns: any[] = [];

        if (poId) {
          const { data, error } = await sb
            .from("asn_header")
            .select("id, status")
            .eq("po_id", poId);

          if (error) throw error;
          relatedAsns = data || [];
        } else if (poNo) {
          const { data, error } = await sb
            .from("asn_header")
            .select("id, status, po_no")
            .eq("po_no", poNo);

          if (error) throw error;
          relatedAsns = data || [];
        }

        let nextPoStatus = "ASN_CREATED";

        if (relatedAsns.length > 0) {
          const statuses = relatedAsns.map((x: any) =>
            String(x.status || "").toUpperCase()
          );

          const hasAnyReceived = statuses.some((s: string) =>
            ["PARTIAL_RECEIVED", "FULL_RECEIVED", "RECEIVED"].includes(s)
          );

          const allFullyReceived =
            statuses.length > 0 &&
            statuses.every((s: string) =>
              ["FULL_RECEIVED", "RECEIVED"].includes(s)
            );

          if (allFullyReceived) {
            nextPoStatus = "RECEIVED";
          } else if (hasAnyReceived) {
            nextPoStatus = "PARTIAL_RECEIVED";
          } else {
            nextPoStatus = "ASN_CREATED";
          }
        }

        if (poId) {
          const { error: poUpdateErr } = await sb
            .from("po_header")
            .update({
              status: nextPoStatus,
            })
            .eq("id", poId);

          if (poUpdateErr) throw poUpdateErr;
        } else if (poNo) {
          const { error: poUpdateErr } = await sb
            .from("po_header")
            .update({
              status: nextPoStatus,
            })
            .eq("po_no", poNo);

          if (poUpdateErr) throw poUpdateErr;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      gr_id: grHeader.id,
      gr_no: grHeader.gr_no,
      asn_id: grHeader.asn_id ?? null,
      confirmed_count: grLines.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}