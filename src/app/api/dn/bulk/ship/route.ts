import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const uploadJobId = String(body.uploadJobId ?? "");
    const selectedLineIds = (body.selectedLineIds ?? []) as string[];

    if (!uploadJobId) {
      return NextResponse.json({ error: "uploadJobId is required" }, { status: 400 });
    }

    if (!Array.isArray(selectedLineIds) || selectedLineIds.length === 0) {
      return NextResponse.json({ error: "selectedLineIds are required" }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from("upload_jobs")
      .select("*")
      .eq("id", uploadJobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Upload job not found" }, { status: 404 });
    }

    const { data: lines, error: lineError } = await supabase
      .from("upload_job_lines")
      .select("*")
      .eq("upload_job_id", uploadJobId)
      .in("id", selectedLineIds)
      .eq("validation_status", "VALID");

    if (lineError) throw new Error(lineError.message);

    for (const line of lines ?? []) {
      const { data: dnLine, error: dnLineError } = await supabase
        .from("dn_lines")
        .select("id, sku, qty_reserved, qty_shipped")
        .eq("id", line.ref_line_id)
        .single();

      if (dnLineError || !dnLine) {
        throw new Error(`DN line not found for ${line.sku}`);
      }

      const qtyReserved = Number(dnLine.qty_reserved ?? 0);
      const qtyToShip = Number(line.input_qty ?? 0);
      const nextQtyShipped = qtyToShip;

      if (qtyToShip > qtyReserved) {
        throw new Error(`qty_to_ship exceeds reserved qty for ${line.sku}`);
      }

      const { error: updateDnError } = await supabase
        .from("dn_lines")
        .update({
          qty_shipped: nextQtyShipped,
        })
        .eq("id", dnLine.id);

      if (updateDnError) throw new Error(updateDnError.message);

      const { data: inventoryRow, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, qty_onhand, qty_reserved")
        .eq("sku", line.sku)
        .single();

      if (inventoryError || !inventoryRow) {
        throw new Error(`Inventory not found for ${line.sku}`);
      }

      const nextOnhand = Number(inventoryRow.qty_onhand ?? 0) - qtyToShip;
      const nextReserved = Number(inventoryRow.qty_reserved ?? 0) - qtyToShip;

      if (nextOnhand < 0) {
        throw new Error(`Insufficient qty_onhand for ${line.sku}`);
      }

      if (nextReserved < 0) {
        throw new Error(`Insufficient qty_reserved for ${line.sku}`);
      }

      const { error: updateInventoryError } = await supabase
        .from("inventory")
        .update({
          qty_onhand: nextOnhand,
          qty_reserved: nextReserved,
        })
        .eq("id", inventoryRow.id);

      if (updateInventoryError) throw new Error(updateInventoryError.message);

      const { error: txError } = await supabase
        .from("inventory_tx")
        .insert({
          ref_type: "DN",
          ref_id: job.ref_id,
          sku: line.sku,
          tx_type: "DN_SHIP",
          qty: qtyToShip,
        });

      if (txError) throw new Error(txError.message);

      const { error: markError } = await supabase
        .from("upload_job_lines")
        .update({
          is_applied: true,
          applied_qty: qtyToShip,
          validation_status: "APPLIED",
        })
        .eq("id", line.id);

      if (markError) throw new Error(markError.message);
    }

    const appliedRows = lines?.length ?? 0;

    const { data: allDnLines } = await supabase
      .from("dn_lines")
      .select("qty_reserved, qty_shipped")
      .eq("dn_id", job.ref_id);

    const isFullyShipped = (allDnLines ?? []).every(
      (x) => Number(x.qty_shipped ?? 0) >= Number(x.qty_reserved ?? 0)
    );

    const nextDnStatus = isFullyShipped ? "SHIPPED" : "PACKED";

    const { error: updateDnHeaderError } = await supabase
      .from("dn_header")
      .update({ status: nextDnStatus })
      .eq("id", job.ref_id);

    if (updateDnHeaderError) throw new Error(updateDnHeaderError.message);

    const { error: jobUpdateError } = await supabase
      .from("upload_jobs")
      .update({
        status: isFullyShipped ? "APPLIED" : "PARTIALLY_APPLIED",
        applied_rows: appliedRows,
      })
      .eq("id", uploadJobId);

    if (jobUpdateError) throw new Error(jobUpdateError.message);

    return NextResponse.json({
      status: isFullyShipped ? "APPLIED" : "PARTIALLY_APPLIED",
      appliedRows,
      dnStatus: nextDnStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}