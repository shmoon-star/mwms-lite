import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSheet, rowsToObjects } from "@/lib/google-sheets";
import { mapExportRow } from "@/lib/export-raw-mapper";
import { masterRowsToObjects, mapProductMasterRow } from "@/lib/product-master-mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5분

/**
 * GET /api/cron/sync-export-ledger
 *
 * Vercel Cron으로 매일 KST 09:00 (UTC 00:00) 자동 실행
 * Google Sheets → Supabase UPSERT
 *
 * 수동 실행 시: ?secret=SYNC_SECRET 전달
 */
export async function GET(req: NextRequest) {
  const log = {
    sheet_name: "수출내역_Raw",
    rows_read: 0,
    rows_upserted: 0,
    rows_skipped: 0,
  };

  // 인증: Vercel Cron header 또는 SYNC_SECRET
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-vercel-cron");

  const isVercelCron = !!cronHeader;
  const isManual = secret && process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET;
  const isAuthBearer =
    authHeader &&
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isManual && !isAuthBearer) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  const sheetId = process.env.EXPORT_LEDGER_SHEET_ID;
  const sheetName = process.env.EXPORT_LEDGER_SHEET_NAME || "수출내역_Raw";

  if (!sheetId) {
    return NextResponse.json(
      { ok: false, error: "EXPORT_LEDGER_SHEET_ID 환경변수 미설정" },
      { status: 500 }
    );
  }

  // Sync 로그 시작
  const { data: logRow } = await sb
    .from("history_sync_log")
    .insert({
      source: "google_sheets",
      sheet_name: sheetName,
      status: "running",
    })
    .select()
    .single();

  try {
    // 1. Google Sheets 읽기
    const rows = await readSheet(sheetId, sheetName);
    const objects = rowsToObjects(rows);
    log.rows_read = objects.length;

    // 2. 매핑
    const mapped = objects
      .map((obj, i) => {
        // 완전 빈 row는 건너뜀
        if (!obj["오더시즌"] && !obj["Brand Name"] && !obj["Style-Color-Size Code"]) {
          return null;
        }
        return mapExportRow(obj, i + 2); // sheet row number (1=header)
      })
      .filter(Boolean) as any[];

    // 3. Locked (25fw) row 확인 — 기존 DB에서 is_locked=true인 row_key 조회
    const { data: lockedRows } = await sb
      .from("history_export_raw")
      .select("row_key")
      .eq("is_locked", true);
    const lockedKeys = new Set((lockedRows || []).map(r => r.row_key));

    // 4. UPSERT (Locked row는 업데이트 제외)
    const toUpsert = mapped.filter(m => !lockedKeys.has(m.row_key));
    log.rows_skipped = mapped.length - toUpsert.length;

    const CHUNK = 500;
    for (let i = 0; i < toUpsert.length; i += CHUNK) {
      const chunk = toUpsert.slice(i, i + CHUNK);
      const { error } = await sb
        .from("history_export_raw")
        .upsert(chunk, { onConflict: "row_key" });
      if (error) throw new Error(`UPSERT 실패 (${i}~): ${error.message}`);
      log.rows_upserted += chunk.length;
    }

    // 5. 상품 master 시트 동기화 (추가)
    const masterSheetName = process.env.PRODUCT_MASTER_SHEET_NAME || "상품 master 시트의 사본";
    const masterLog = { rows_read: 0, rows_upserted: 0 };
    try {
      const masterRows = await readSheet(sheetId, masterSheetName);
      const masterObjects = masterRowsToObjects(masterRows);
      masterLog.rows_read = masterObjects.length;

      const masterMapped = masterObjects
        .map((obj, i) => {
          // 브랜드명 없는 row는 건너뜀
          if (!obj["브랜드명"]) return null;
          return mapProductMasterRow(obj, i + 7); // data starts at row 7 (1-indexed)
        })
        .filter(Boolean) as any[];

      for (let i = 0; i < masterMapped.length; i += CHUNK) {
        const chunk = masterMapped.slice(i, i + CHUNK);
        const { error } = await sb
          .from("history_product_master")
          .upsert(chunk, { onConflict: "row_key" });
        if (error) throw new Error(`Master UPSERT 실패: ${error.message}`);
        masterLog.rows_upserted += chunk.length;
      }
    } catch (masterErr: any) {
      // Master sync 실패해도 Export sync는 성공으로 유지
      console.error("Master sync failed:", masterErr?.message);
    }

    // 6. 로그 업데이트 (성공)
    if (logRow?.id) {
      await sb
        .from("history_sync_log")
        .update({
          rows_read: log.rows_read + masterLog.rows_read,
          rows_upserted: log.rows_upserted + masterLog.rows_upserted,
          rows_skipped: log.rows_skipped,
          status: "success",
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow.id);
    }

    return NextResponse.json({ ok: true, log: { ...log, master: masterLog } });
  } catch (e: any) {
    const errorMsg = e?.message || "Sync failed";

    if (logRow?.id) {
      await sb
        .from("history_sync_log")
        .update({
          rows_read: log.rows_read,
          rows_upserted: log.rows_upserted,
          rows_skipped: log.rows_skipped,
          status: "error",
          error_message: errorMsg,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow.id);
    }

    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

/**
 * POST: 수동 Lock 처리 (25fw row 잠금)
 * POST /api/cron/sync-export-ledger?lock=25fw
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const season = url.searchParams.get("lock");
  const secret = url.searchParams.get("secret");

  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!season) {
    return NextResponse.json({ ok: false, error: "lock parameter required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("history_export_raw")
    .update({ is_locked: true })
    .eq("order_season", season)
    .select("row_key");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, locked_count: data?.length || 0, season });
}
