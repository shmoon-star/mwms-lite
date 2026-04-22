import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapExportRow } from "@/lib/export-raw-mapper";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/monitor/export-dashboard/upload?lock=true
 *
 * 오프라인 xlsx 파일을 history_export_raw에 UPSERT.
 * Google Sheet와 동일한 Korean column headers를 기대 (export-raw-mapper.ts 참조).
 *
 * - lock=true : 업로드된 row의 is_locked=true로 저장
 *   → 다음 cron sync 시 Google Sheet 데이터로 덮어쓰기되지 않음
 *   → 25fw 종결 데이터 복원용
 * - lock=false: is_locked=false (일반 upsert, sync 때 덮어쓰기 가능)
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createAdminClient();
    const lock = req.nextUrl.searchParams.get("lock") === "true";

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // 첫 시트 사용 (또는 "수출내역_Raw" 같은 이름이 있으면 그걸 우선)
    const preferredNames = ["수출내역_Raw", "Sheet1", "export_raw"];
    let sheetName = wb.SheetNames[0];
    for (const n of preferredNames) {
      if (wb.SheetNames.includes(n)) {
        sheetName = n;
        break;
      }
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ ok: false, error: "시트를 찾을 수 없습니다." }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

    let emptyCount = 0;
    const mapped = rows
      .map((obj: any, i: number) => {
        // mapper와 동일하게 완전 빈 row 제외
        if (!obj["오더시즌"] && !obj["Brand Name"] && !obj["Style-Color-Size Code"]) {
          emptyCount += 1;
          return null;
        }
        const row = mapExportRow(obj, i + 2);
        return {
          ...row,
          is_locked: lock,
        };
      })
      .filter(Boolean) as any[];

    if (mapped.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `유효한 row가 없습니다. 컬럼 헤더가 Google Sheet와 일치하는지 확인하세요. (읽음: ${rows.length}, 빈 row: ${emptyCount})`,
        },
        { status: 400 },
      );
    }

    // UPSERT — 청크 단위
    const CHUNK = 500;
    let upserted = 0;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK);
      const { error } = await sb
        .from("history_export_raw")
        .upsert(chunk, { onConflict: "row_key" });
      if (error) throw new Error(`UPSERT 실패 (${i}~): ${error.message}`);
      upserted += chunk.length;
    }

    // 로그 기록
    await sb.from("history_sync_log").insert({
      source: "offline_upload",
      sheet_name: `${file.name}${lock ? " (locked)" : ""}`,
      rows_read: rows.length,
      rows_upserted: upserted,
      rows_skipped: 0,
      rows_filtered_empty: emptyCount,
      status: "success",
      finished_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      summary: {
        file_name: file.name,
        sheet_name: sheetName,
        locked: lock,
        rows_read: rows.length,
        rows_upserted: upserted,
        rows_filtered_empty: emptyCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Upload failed" },
      { status: 500 },
    );
  }
}
