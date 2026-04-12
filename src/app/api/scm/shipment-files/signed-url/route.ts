import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST { storage_path, file_name }
// Used by both SCM and buyer portal for secure file download
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { storage_path, file_name } = body;
  if (!storage_path) return NextResponse.json({ ok: false, error: "storage_path required" }, { status: 400 });

  const { data: signedData, error } = await supabase.storage
    .from("vendor-documents")
    .createSignedUrl(storage_path, 60 * 10); // 10분 유효

  if (error || !signedData) return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });

  return NextResponse.json({ ok: true, url: signedData.signedUrl, file_name });
}
