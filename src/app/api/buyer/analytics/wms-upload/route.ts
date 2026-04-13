import { NextRequest, NextResponse } from "next/server";
import { parseWmsExcel } from "@/lib/wms-parser";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = parseWmsExcel(buffer);

    try {
      const sb = await createClient();
      const today = new Date().toISOString().slice(0, 10);
      await sb.from("wms_daily_upload").upsert({
        upload_date: today,
        file_name: file.name,
        source: "manual",
        total_rows: result.totalRows,
        total_in: result.summary.totalIN,
        total_out: result.summary.totalOUT,
        raw_data: result,
      }, { onConflict: "upload_date" });
    } catch {}

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
