import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * GET /api/monitor/history-search?q=키워드
 *
 * master에서 스타일넘버 / SKU / 상품명 기반 검색
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await getCurrentUserProfile();
    if (profile.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ ok: true, items: [] });

    const sb = createAdminClient();

    // master 전체 로드 후 클라이언트-식 필터링 (데이터량 적음)
    const rows: any[] = [];
    let page = 0;
    while (true) {
      const { data: chunk } = await sb
        .from("history_product_master")
        .select("style_number, style_color_code, brand_name, raw_data, total_order_qty")
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!chunk || chunk.length === 0) break;
      rows.push(...chunk);
      if (chunk.length < 1000) break;
      page++;
      if (page > 20) break;
    }

    const qLower = q.toLowerCase();
    const matches = rows
      .filter((m: any) => {
        const searchable = [
          m.style_number,
          m.style_color_code,
          m.brand_name,
          m.raw_data?.["상품명 (영문)"],
          m.raw_data?.["상품명 (중문) * 컬러명 제외하고 기입"],
          m.raw_data?.["상품명 (중문)"],
          m.raw_data?.["바코드 번호"],
          m.raw_data?.["카테고리"],
        ].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(qLower);
      })
      .slice(0, 50);

    const results = matches.map((m: any) => {
      const uid = m.raw_data?.["무신사 UID * 상품 등록 안 되어 있는 경우 추후 전달"]
        || m.raw_data?.["무신사 UID"];
      const numUid = uid ? String(uid).match(/\d+/)?.[0] : null;
      return {
        uid: numUid,
        brand: m.brand_name,
        style_number: m.style_number,
        style_color_code: m.style_color_code,
        product_name: m.raw_data?.["상품명 (영문)"] || m.raw_data?.["상품명 (중문) * 컬러명 제외하고 기입"],
        category: m.raw_data?.["카테고리"],
        barcode: m.raw_data?.["바코드 번호"],
        musinsa_url: m.raw_data?.["무신사 URL"],
        zsangmall_url: m.raw_data?.["자사몰 URL"],
        qty: m.total_order_qty || 0,
      };
    });

    return NextResponse.json({ ok: true, items: results, total: matches.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
