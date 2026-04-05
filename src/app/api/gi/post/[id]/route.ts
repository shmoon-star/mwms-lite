import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";


export async function POST(req: Request, ctx: { params:  }) {
  const { id } = await { params }: { params: { id: string } };
  const sb = supabaseServer();

  const { data, error } = await sb.rpc("rpc_post_gi", { p_dn_id: id });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
