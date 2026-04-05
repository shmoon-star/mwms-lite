import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid DN id is required" },
        { status: 400 }
      );
    }

    const { data: dnHeader, error: dnHeaderErr } = await supabase
      .from("dn_header")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (dnHeaderErr) throw dnHeaderErr;

    if (!dnHeader) {
      return NextResponse.json(
        { ok: false, error: `DN not found: ${id}` },
        { status: 404 }
      );
    }

    const { data: dnLines, error: dnLinesErr } = await supabase
      .from("dn_lines")
      .select("*")
      .eq("dn_id", id)
      .order("created_at", { ascending: true });

    if (dnLinesErr) throw dnLinesErr;

    return NextResponse.json({
      ok: true,
      dn: {
        ...dnHeader,
        dn_lines: dnLines ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}