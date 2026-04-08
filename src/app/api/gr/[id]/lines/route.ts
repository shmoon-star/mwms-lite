import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const sb = await createClient();
  const { id } = await context.params;
  const gr_id = String(id ?? "").trim();

  if (!gr_id) {
    return NextResponse.json(
      { ok: false, error: "id required" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const lines = Array.isArray(body?.lines) ? body.lines : [];

    // lines: [{ line_id, qty_received }]
    for (const row of lines) {
      const line_id = String(row?.line_id ?? "").trim();
      const qty = Number(row?.qty_received ?? 0);
      if (!line_id) continue;

      const { error } = await sb
        .from("gr_line")
        .update({ qty_received: qty })
        .eq("id", line_id)
        .eq("gr_id", gr_id);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}