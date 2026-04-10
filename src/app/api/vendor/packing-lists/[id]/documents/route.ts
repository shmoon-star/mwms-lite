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
    .select("role, vendor_id, status")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403, error: "Forbidden", supabase };

  const role = (profile.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isVendor = role === "VENDOR" && profile.status === "ACTIVE";

  if (!isAdmin && !isVendor) return { ok: false as const, status: 403, error: "Forbidden", supabase };

  return { ok: true as const, supabase, user, isAdmin, vendorId: profile.vendor_id as string | null };
}

// GET: 파일 목록 조회
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase, isAdmin, vendorId } = auth;
  const { id: plId } = await context.params;

  // PL 소유권 확인
  const plQuery = supabase.from("packing_list_header").select("id, vendor_id").eq("id", plId);
  const { data: pl } = await (isAdmin ? plQuery : plQuery.eq("vendor_id", vendorId as string)).single();

  if (!pl) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: docs, error } = await supabase
    .from("vendor_documents")
    .select("id, file_name, file_size, mime_type, uploaded_at, storage_path, pl_id")
    .eq("pl_id", plId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, documents: docs ?? [] });
}

// POST: 파일 업로드
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase, user, isAdmin, vendorId } = auth;
  const { id: plId } = await context.params;

  // PL 조회
  const plQuery = supabase.from("packing_list_header").select("id, vendor_id, po_no").eq("id", plId);
  const { data: pl } = await (isAdmin ? plQuery : plQuery.eq("vendor_id", vendorId as string)).single();

  if (!pl) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "File required" }, { status: 400 });

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
  const storagePath = `${pl.vendor_id}/${plId}/${Date.now()}_${safeFileName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("vendor-documents")
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });

  const { data: doc, error: dbError } = await supabase
    .from("vendor_documents")
    .insert({
      pl_id: plId,
      po_no: pl.po_no,
      vendor_id: pl.vendor_id,
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

  return NextResponse.json({ ok: true, document: doc }, { status: 201 });
}
