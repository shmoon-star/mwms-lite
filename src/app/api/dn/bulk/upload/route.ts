import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateDNRows } from "@/lib/validators/dn-bulk-validator";
import { DNUploadRowInput } from "@/lib/types/upload";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const dnId = String(body.dnId ?? "");
    const fileName = String(body.fileName ?? "dn_upload.csv");
    const rows = (body.rows ?? []) as DNUploadRowInput[];

    if (!dnId) {
      return NextResponse.json({ error: "dnId is required" }, { status: 400 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows are required" }, { status: 400 });
    }

    const { data: dnHeader, error: dnError } = await supabase
      .from("dn_header")
      .select("id, status")
      .eq("id", dnId)
      .single();

    if (dnError || !dnHeader) {
      return NextResponse.json({ error: "DN not found" }, { status: 404 });
    }

    const validated = await validateDNRows({ supabase, dnId, rows });

    const totalRows = validated.length;
    const validRows = validated.filter((x) => x.validationStatus === "VALID").length;
    const errorRows = validated.filter((x) => x.validationStatus === "INVALID").length;

    const { data: uploadJob, error: jobError } = await supabase
      .from("upload_jobs")
      .insert({
        upload_type: "DN_BULK",
        ref_type: "DN",
        ref_id: dnId,
        file_name: fileName,
        status: "VALIDATED",
        total_rows: totalRows,
        valid_rows: validRows,
        error_rows: errorRows,
      })
      .select()
      .single();

    if (jobError || !uploadJob) {
      throw new Error(jobError?.message ?? "Failed to create upload job");
    }

    const linePayload = validated.map((line, idx) => ({
      upload_job_id: uploadJob.id,
      line_no: idx + 1,
      ref_line_id: line.refLineId,
      sku: line.sku,
      description: line.description ?? String(rows[idx]?.description ?? "").trim() || null,
      expected_qty: line.expectedQty,
      input_qty: line.inputQty,
      validation_status: line.validationStatus,
      validation_message: line.validationMessage,
      is_selected: line.isSelected,
      raw_payload: rows[idx],
    }));

    const { error: lineError } = await supabase
      .from("upload_job_lines")
      .insert(linePayload);

    if (lineError) {
      throw new Error(lineError.message);
    }

    return NextResponse.json({
      uploadJobId: uploadJob.id,
      status: "VALIDATED",
      summary: {
        totalRows,
        validRows,
        errorRows,
      },
      lines: validated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}