import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/monitor/export-dashboard/raw-dump?season=26ss
 *
 * `history_export_raw` 테이블 CSV 덤프 (전체 컬럼).
 * - season 파라미터로 필터 (없거나 "all"이면 전체)
 * - 비교/디버깅용: Google Sheet 원본 vs DB 현재 상태 대조
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createAdminClient();
    const season = (new URL(req.url).searchParams.get("season") || "").trim();

    const rows: any[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      let q = sb
        .from("history_export_raw")
        .select("*")
        .order("row_key", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (season && season !== "all") q = q.eq("order_season", season);

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
      page += 1;
      if (page > 30) break; // safety: 30,000행
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows" }, { status: 404 });
    }

    // 모든 row에서 나타난 key 합집합 → header 순서
    const keySet = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keySet.add(k);
    const headers = Array.from(keySet);

    // CSV 직렬화
    const escape = (v: any): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      // 따옴표/콤마/개행 있으면 quote + 내부 " 이스케이프
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines: string[] = [];
    lines.push(headers.join(","));
    for (const r of rows) {
      lines.push(headers.map((h) => escape((r as any)[h])).join(","));
    }

    // UTF-8 BOM (엑셀에서 한글 깨짐 방지)
    const csv = "\uFEFF" + lines.join("\r\n");

    const filename = `history_export_raw${season && season !== "all" ? `_${season}` : ""}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "dump failed" }, { status: 500 });
  }
}
