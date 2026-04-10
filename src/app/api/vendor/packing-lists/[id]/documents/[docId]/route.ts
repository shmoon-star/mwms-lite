import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; docId: string }> };

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

// GET: signed URL 발급 (다운로드/미리보기)
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase, isAdmin, vendorId } = auth;
  const { docId } = await context.params;

  const docQuery = supabase.from("vendor_documents").select("*").eq("id", docId);
  const { data: doc } = await (isAdmin ? docQuery : docQuery.eq("vendor_id", vendorId as string)).single();

  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: signedData, error } = await supabase.storage
    .from("vendor-documents")
    .createSignedUrl(doc.storage_path, 60 * 10); // 10분 유효

  if (error || !signedData) return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });

  return NextResponse.json({ ok: true, url: signedData.signedUrl, file_name: doc.file_name });
}

// DELETE: 파일 삭제
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await getAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { supabase, isAdmin, vendorId } = auth;
  const { docId } = await context.params;

  const docQuery = supabase.from("vendor_documents").select("*").eq("id", docId);
  const { data: doc } = await (isAdmin ? docQuery : docQuery.eq("vendor_id", vendorId as string)).single();

  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await supabase.storage.from("vendor-documents").remove([doc.storage_path]);

  const { error } = await supabase.from("vendor_documents").delete().eq("id", docId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
