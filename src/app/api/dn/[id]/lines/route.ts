import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sb = await createClient();
    const { id: dnId } = await context.params;

    if (!dnId || typeof dnId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid DN id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await sb
      .from("dn_lines")
      .select("*")
      .eq("dn_id", dnId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      dn_lines: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sb = await createClient();
    const { id: dnId } = await context.params;

    if (!dnId || typeof dnId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Valid DN id is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const sku = String(body?.sku ?? "").trim();
    const qtyOrdered = Number(body?.qty_ordered ?? 0);
    const qtyShipped = Number(body?.qty_shipped ?? qtyOrdered);

    if (!sku) {
      return NextResponse.json(
        { ok: false, error: "sku is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(qtyOrdered) || qtyOrdered <= 0) {
      return NextResponse.json(
        { ok: false, error: "qty_ordered must be greater than 0" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(qtyShipped) || qtyShipped < 0) {
      return NextResponse.json(
        { ok: false, error: "qty_shipped must be 0 or greater" },
        { status: 400 }
      );
    }

    const { data: dnHeader, error: dnHeaderErr } = await sb
      .from("dn_header")
      .select("id, status")
      .eq("id", dnId)
      .maybeSingle();

    if (dnHeaderErr) throw dnHeaderErr;

    if (!dnHeader) {
      return NextResponse.json(
        { ok: false, error: `DN not found: ${dnId}` },
        { status: 404 }
      );
    }

    if (dnHeader.status === "CONFIRMED") {
      return NextResponse.json(
        { ok: false, error: "Cannot add lines to a confirmed DN" },
        { status: 400 }
      );
    }

    const payload = {
      dn_id: dnId,
      sku,
      qty_ordered: qtyOrdered,
      qty_shipped: qtyShipped,
    };

    const { data, error } = await sb
      .from("dn_lines")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      dn_line: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}