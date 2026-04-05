import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function idFromPath(req: Request) {
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request, context: { params: any }) {
  try {
    const p = await context?.params;
    const id = String((p?.id || idFromPath(req) || "")).trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const sb = await createClient();

    const { data: header, error: hErr } = await sb
      .from("dn_header")
      .select("id, dn_no, status")
      .eq("id", id)
      .single();

    if (hErr) throw hErr;
    if (!header) throw new Error("DN not found");

    if (header.status === "SHIPPED") {
      return NextResponse.json({ ok: false, error: "Already shipped DN" }, { status: 400 });
    }

    const { data: lines, error: lErr } = await sb
      .from("dn_line")
      .select("id, qty, qty_picked")
      .eq("dn_id", id);

    if (lErr) throw lErr;

    for (const line of lines ?? []) {
      const qty = Number(line.qty ?? 0);
      const picked = Number(line.qty_picked ?? 0);

      if (qty <= 0 || picked > 0) continue;

      const { error: updErr } = await sb
        .from("dn_line")
        .update({
          qty_picked: qty,
        })
        .eq("id", line.id);

      if (updErr) throw updErr;
    }

    const { error: hdrUpdErr } = await sb
      .from("dn_header")
      .update({
        status: "PICKED",
        picked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .in("status", ["RESERVED", "PICKED"]);

    if (hdrUpdErr) throw hdrUpdErr;

    return NextResponse.json({ ok: true, status: "PICKED" }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}