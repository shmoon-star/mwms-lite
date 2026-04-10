import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// SCM: PO에 연결된 모든 PL의 첨부파일 조회
export async function GET(_req: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: poId } = await context.params;

  // PO 정보 조회
  const { data: po } = await supabase
    .from("po_header")
    .select("id, po_no")
    .eq("id", poId)
    .single();

  if (!po) return NextResponse.json({ ok: false, error: "PO not found" }, { status: 404 });

  // 해당 PO의 모든 PL 조회
  const { data: pls } = await supabase
    .from("packing_list_header")
    .select("id, pl_no, status")
    .eq("po_no", po.po_no);

  const plIds = (pls ?? []).map((p: { id: string }) => p.id);

  if (plIds.length === 0) {
    return NextResponse.json({ ok: true, documents: [] });
  }

  // 해당 PLs의 모든 첨부파일 조회
  const { data: docs, error } = await supabase
    .from("vendor_documents")
    .select("id, pl_id, file_name, file_size, mime_type, uploaded_at")
    .in("pl_id", plIds)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // PL 정보 맵
  const plMap = new Map((pls ?? []).map((p: { id: string; pl_no: string | null; status: string | null }) => [p.id, p]));

  const enriched = (docs ?? []).map((doc: any) => ({
    ...doc,
    pl_no: plMap.get(doc.pl_id)?.pl_no ?? null,
    pl_status: plMap.get(doc.pl_id)?.status ?? null,
  }));

  return NextResponse.json({ ok: true, documents: enriched });
}

// SCM: signed URL 발급
export async function POST(req: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { storage_path, file_name } = body;

  if (!storage_path) return NextResponse.json({ ok: false, error: "storage_path required" }, { status: 400 });

  const { data: signedData, error } = await supabase.storage
    .from("vendor-documents")
    .createSignedUrl(storage_path, 60 * 10);

  if (error || !signedData) return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });

  return NextResponse.json({ ok: true, url: signedData.signedUrl, file_name });
}
