import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function getAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Unauthorized", supabase };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, status")
    .eq("auth_user_id", user.id)
    .single();

  const role = String(profile?.role || "").toUpperCase();
  if (role !== "ADMIN" && role !== "SCM" && role !== "WMS")
    return { ok: false as const, status: 403, error: "Forbidden", supabase };

  return { ok: true as const, supabase, user };
}

// GET: 파일 목록
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase } = auth;
  const { id: shipmentId } = await context.params;

  const { data, error } = await supabase
    .from("shipment_files")
    .select("id, file_name, file_size, mime_type, storage_path, uploaded_at")
    .eq("shipment_id", shipmentId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, files: data ?? [] });
}

// POST: 파일 업로드
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase, user } = auth;
  const { id: shipmentId } = await context.params;

  // Shipment 존재 확인
  const { data: shipment } = await supabase
    .from("shipment_header")
    .select("id")
    .eq("id", shipmentId)
    .single();
  if (!shipment) return NextResponse.json({ ok: false, error: "Shipment not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "File required" }, { status: 400 });

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
  const storagePath = `shipments/${shipmentId}/${Date.now()}_${safeFileName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("vendor-documents")
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const { data: doc, error: dbError } = await supabase
    .from("shipment_files")
    .insert({
      shipment_id: shipmentId,
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user.id,
    })
    .select("id, file_name, file_size, mime_type, uploaded_at")
    .single();

  if (dbError) {
    await supabase.storage.from("vendor-documents").remove([storagePath]);
    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file: doc }, { status: 201 });
}

// DELETE: 파일 삭제
export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase } = auth;
  const { id: shipmentId } = await context.params;

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ ok: false, error: "fileId required" }, { status: 400 });

  const { data: file } = await supabase
    .from("shipment_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("shipment_id", shipmentId)
    .single();

  if (!file) return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });

  await supabase.storage.from("vendor-documents").remove([file.storage_path]);
  await supabase.from("shipment_files").delete().eq("id", fileId);

  return NextResponse.json({ ok: true });
}
