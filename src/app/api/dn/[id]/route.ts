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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ ok: false, error: "DN id required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // 허용 필드: planned_gi_date, planned_delivery_date
    const update: Record<string, string | null> = {};

    if ("planned_gi_date" in body) {
      const v = body.planned_gi_date;
      if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        return NextResponse.json({ ok: false, error: "planned_gi_date must be YYYY-MM-DD" }, { status: 400 });
      }
      update.planned_gi_date = v ?? null;
    }

    if ("planned_delivery_date" in body) {
      const v = body.planned_delivery_date;
      if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        return NextResponse.json({ ok: false, error: "planned_delivery_date must be YYYY-MM-DD" }, { status: 400 });
      }
      update.planned_delivery_date = v ?? null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("dn_header")
      .update(update)
      .eq("id", id)
      .select("id, dn_no, planned_gi_date, planned_delivery_date")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, dn: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}