import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BulkConfirmRequest = {
  dn_ids?: string[];
  dn_nos?: string[];
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    let body: BulkConfirmRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const dnIds = Array.isArray(body?.dn_ids)
      ? body.dn_ids.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];

    const dnNos = Array.isArray(body?.dn_nos)
      ? body.dn_nos.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];

    let query = supabase
      .from("dn_header")
      .select("*")
      .eq("status", "RESERVED");

    if (dnIds.length > 0) {
      query = query.in("id", dnIds);
    } else if (dnNos.length > 0) {
      query = query.in("dn_no", dnNos);
    }

    const { data: targetDns, error: targetDnsErr } = await query;

    if (targetDnsErr) throw targetDnsErr;

    if (!targetDns || targetDns.length === 0) {
      return NextResponse.json({
        ok: true,
        target_count: 0,
        shipped_count: 0,
        error_count: 0,
        shipped_dns: [],
        errors: [],
      });
    }

    const shippedDns: any[] = [];
    const errors: Array<{ dn_id: string; dn_no: string | null; error: string }> = [];

    for (const dnHeader of targetDns) {
      try {
        const { data: dnLines, error: dnLinesErr } = await supabase
          .from("dn_lines")
          .select("*")
          .eq("dn_id", dnHeader.id);

        if (dnLinesErr) throw dnLinesErr;
        if (!dnLines || dnLines.length === 0) {
          throw new Error("No DN lines found");
        }

        for (const line of dnLines) {
          const shipQty = Number(line.qty_reserved ?? 0);

          if (!line.sku) {
            throw new Error(`Missing sku in DN line ${line.id}`);
          }

          if (!Number.isFinite(shipQty) || shipQty <= 0) {
            throw new Error(`Invalid qty_reserved in DN line ${line.id}`);
          }

          const { data: invRow, error: invErr } = await supabase
            .from("inventory")
            .select("sku, qty_onhand, qty_reserved, allocated")
            .eq("sku", line.sku)
            .maybeSingle();

          if (invErr) throw invErr;
          if (!invRow) throw new Error(`Inventory not found for SKU ${line.sku}`);

          const currentOnhand = Number(invRow.qty_onhand ?? 0);
          const currentReserved = Number(invRow.qty_reserved ?? 0);

          if (currentOnhand < shipQty) {
            throw new Error(
              `Insufficient onhand for SKU ${line.sku}: onhand=${currentOnhand}, ship=${shipQty}`
            );
          }

          if (currentReserved < shipQty) {
            throw new Error(
              `Insufficient reserved for SKU ${line.sku}: reserved=${currentReserved}, ship=${shipQty}`
            );
          }

          const { error: invUpdateErr } = await supabase
            .from("inventory")
            .update({
              qty_onhand: currentOnhand - shipQty,
              qty_reserved: currentReserved - shipQty,
            })
            .eq("sku", line.sku);

          if (invUpdateErr) throw invUpdateErr;

          const { error: lineUpdateErr } = await supabase
            .from("dn_lines")
            .update({
              qty_shipped: shipQty,
            })
            .eq("id", line.id);

          if (lineUpdateErr) throw lineUpdateErr;

          const { data: existingTx, error: existingTxErr } = await supabase
            .from("inventory_tx")
            .select("id")
            .eq("sku", line.sku)
            .eq("tx_type", "DN_SHIP")
            .eq("ref_type", "DN")
            .eq("ref_id", dnHeader.id)
            .maybeSingle();

          if (existingTxErr) throw existingTxErr;

          if (!existingTx?.id) {
            const { error: txErr } = await supabase
              .from("inventory_tx")
              .insert({
                sku: line.sku,
                tx_type: "DN_SHIP",
                qty_delta: -shipQty,
                ref_type: "DN",
                ref_id: dnHeader.id,
                created_at: new Date().toISOString(),
              });

            if (txErr) throw txErr;
          }
        }

        const now = new Date().toISOString();

        const { data: updatedDn, error: dnUpdateErr } = await supabase
          .from("dn_header")
          .update({
            status: "SHIPPED",
            confirmed_at: now,
            shipped_at: dnHeader.shipped_at ?? now,
          })
          .eq("id", dnHeader.id)
          .select("*")
          .single();

        if (dnUpdateErr) throw dnUpdateErr;

        shippedDns.push(updatedDn);
      } catch (e: any) {
        errors.push({
          dn_id: dnHeader.id,
          dn_no: dnHeader.dn_no ?? null,
          error: e?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      target_count: targetDns.length,
      shipped_count: shippedDns.length,
      error_count: errors.length,
      shipped_dns: shippedDns,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}