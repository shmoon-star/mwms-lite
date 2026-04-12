import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST body: { pl_ids: string[] }
// Returns: { counts: { [pl_id]: number } }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const pl_ids: string[] = Array.isArray(body.pl_ids) ? body.pl_ids : [];

  if (pl_ids.length === 0) {
    return NextResponse.json({ ok: true, counts: {} });
  }

  const { data, error } = await supabase
    .from("vendor_documents")
    .select("pl_id")
    .in("pl_id", pl_ids);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.pl_id] = (counts[row.pl_id] ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, counts });
}
