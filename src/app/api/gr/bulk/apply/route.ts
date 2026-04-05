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

    const { data: lines, error: linesError } = await supabase
      .from("upload_job_lines")
      .select("*")
      .eq("upload_job_id", uploadJobId)
      .in("id", selectedLineIds)
      .eq("validation_status", "VALID");

    if (linesError) {
      throw new Error(linesError.message);
    }

    for (const line of lines ?? []) {
      const { data: existingGrLine } = await supabase
        .from("gr_line")
        .select("id")
        .eq("asn_line_id", line.ref_line_id)
        .maybeSingle();

      if (existingGrLine?.id) {
        const { error } = await supabase
          .from("gr_line")
          .update({
            qty_received: line.input_qty,
          })
          .eq("id", existingGrLine.id);

        if (error) throw new Error(error.message);
      } else {
        const { data: grHeader } = await supabase
          .from("gr_header")
          .select("id")
          .eq("asn_id", job.ref_id)
          .limit(1)
          .maybeSingle();

        if (!grHeader?.id) {
          throw new Error("GR header not found for ASN");
        }

        const { error } = await supabase
          .from("gr_line")
          .insert({
            gr_id: grHeader.id,
            asn_line_id: line.ref_line_id,
            sku: line.sku,
            qty_expected: line.expected_qty ?? 0,
            qty_received: line.input_qty ?? 0,
          });

        if (error) throw new Error(error.message);
      }

      const { error: markError } = await supabase
        .from("upload_job_lines")
        .update({
          is_applied: true,
          applied_qty: line.input_qty,
          validation_status: "APPLIED",
        })
        .eq("id", line.id);

      if (markError) throw new Error(markError.message);
    }

    const appliedRows = lines?.length ?? 0;

    const { error: jobUpdateError } = await supabase
      .from("upload_jobs")
      .update({
        status: "PARTIALLY_APPLIED",
        applied_rows: appliedRows,
      })
      .eq("id", uploadJobId);

    if (jobUpdateError) throw new Error(jobUpdateError.message);

    return NextResponse.json({
      status: "PARTIALLY_APPLIED",
      appliedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}