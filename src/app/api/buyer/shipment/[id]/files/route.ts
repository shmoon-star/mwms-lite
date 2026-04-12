import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getCurrentBuyerInfo, assertBuyerAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const profile = await getCurrentUserProfile();
    assertBuyerAccess(profile);

    const buyer = await getCurrentBuyerInfo(profile);
    const sb = await createClient();
    const { id: shipmentId } = await context.params;

    // Buyer 권한 확인: buyer.id → dn_header.buyer_id → shipment_dn.shipment_id
    if (profile.role === "BUYER") {
      if (!buyer?.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

      const { data: buyerDns } = await sb
        .from("dn_header")
        .select("id")
        .eq("buyer_id", buyer.id);

      const dnIds = (buyerDns ?? []).map((d: any) => d.id).filter(Boolean);
      if (dnIds.length === 0) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

      const { data: shipmentDns } = await sb
        .from("shipment_dn")
        .select("shipment_id")
        .in("dn_id", dnIds)
        .eq("shipment_id", shipmentId);

      if (!shipmentDns || shipmentDns.length === 0)
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await sb
      .from("shipment_files")
      .select("id, file_name, file_size, mime_type, storage_path, uploaded_at")
      .eq("shipment_id", shipmentId)
      .order("uploaded_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, files: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
