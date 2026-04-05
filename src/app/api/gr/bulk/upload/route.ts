import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateGRRows } from "@/lib/validators/gr-bulk-validator";
import { GRUploadRowInput } from "@/lib/types/upload";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const asnId = String(body.asnId ?? "");
    const fileName = String(body.fileName ?? "gr_upload.csv");
    const rows = (body.rows ?? []) as GRUploadRowInput[];

    if (!asnId) {
      return NextResponse.json({ error: "asnId is required" }, { status: 400 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows are required" }, { status: 400 });
    }

    const { data: asnHeader, error: asnError } = await supabase
      .from("asn_header")
      .select("id, status")
      .eq("asn_no", asnNo)
      .single();

    if (asnError || !asnHeader) {
      return NextResponse.json({ error: "ASN not found" }, { status: 404 });
    }

    const validated = await validateGRRows({ supabase, asnId, rows });

    const totalRows = validated.length;
    const validRows = validated.filter((x) => x.validationStatus === "VALID").length;
    const errorRows = validated.filter((x) => x.validationStatus === "INVALID").length;

    const { data: uploadJob, error: jobError } = await supabase
      .from("upload_jobs")
      .insert({
        upload_type: "GR_BULK",
        ref_type: "ASN",
        ref_id: asnId,
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