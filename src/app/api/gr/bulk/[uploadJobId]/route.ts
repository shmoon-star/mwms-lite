import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ uploadJobId: string }>;
};

export async function GET(_req: NextRequest, context: Params) {
  try {
    const { uploadJobId } = await context.params;
    const supabase = await createClient();

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
      .order("id", { ascending: true });

    if (linesError) throw new Error(linesError.message);

    return NextResponse.json({
      job,
      lines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}