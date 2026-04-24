import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHeaderKeys } from "@/lib/export-raw-mapper";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/customs/watch/bulk
 *   form-data: file=<xlsx|csv>
 *
 * Watchlist 벌크 등록.
 * 허용 컬럼 (한글/영문/스네이크 모두 인식):
 *   HBL | HBL 번호 | hbl_no | hblNo
 *   MBL | MBL 번호 | mbl_no | mblNo
 *   BL 년도 | 년도 | bl_yy | blYy   (미입력 시 현재 년도)
 *   화물관리번호 | carg_mt_no | cargMtNo
 *   메모 | memo
 *
 * HBL/MBL/화물관리번호 중 하나 이상 있어야 row 인정.
 */

function firstVal(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const sb = createAdminClient();

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ ok: false, error: "시트가 없습니다." }, { status: 400 });
    }
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
    const rows = rawRows.map((r: any) => normalizeHeaderKeys(r));

    const defaultYear = String(new Date().getFullYear());
    const toInsert: any[] = [];
    const skipped: Array<{ rowNum: number; reason: string }> = [];

    rows.forEach((r: any, idx: number) => {
      const hbl = firstVal(r, ["HBL", "HBL 번호", "hbl_no", "hblNo"]);
      const mbl = firstVal(r, ["MBL", "MBL 번호", "mbl_no", "mblNo"]);
      const cargMt = firstVal(r, ["화물관리번호", "carg_mt_no", "cargMtNo"]);
      let yy = firstVal(r, ["BL 년도", "년도", "bl_yy", "blYy"]);
      const memo = firstVal(r, ["메모", "memo"]);

      if (!hbl && !mbl && !cargMt) {
        skipped.push({ rowNum: idx + 2, reason: "HBL/MBL/화물관리번호 모두 없음" });
        return;
      }
      if (yy && !/^\d{4}$/.test(yy)) {
        skipped.push({ rowNum: idx + 2, reason: `BL 년도 형식 오류: ${yy}` });
        return;
      }
      if ((hbl || mbl) && !yy) yy = defaultYear;

      toInsert.push({
        hbl_no: hbl || null,
        mbl_no: mbl || null,
        bl_yy: yy || null,
        carg_mt_no: cargMt || null,
        memo: memo || null,
      });
    });

    if (toInsert.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "등록 가능한 row가 없습니다.",
          data: { read: rows.length, skipped },
        },
        { status: 400 },
      );
    }

    // 중복(unique 제약) 처리를 위해 한 건씩 insert (chunk insert은 1건 실패 시 전체 롤백)
    let inserted = 0;
    const duplicates: Array<{ rowNum: number; key: string }> = [];
    const errors: Array<{ rowNum: number; error: string }> = [];

    for (let i = 0; i < toInsert.length; i++) {
      const row = toInsert[i];
      const { error } = await sb.from("customs_watch").insert(row);
      if (error) {
        if (error.code === "23505") {
          duplicates.push({
            rowNum: i + 2,
            key: `${row.mbl_no || "-"}/${row.hbl_no || "-"}/${row.bl_yy || "-"}`,
          });
        } else {
          errors.push({ rowNum: i + 2, error: error.message });
        }
      } else {
        inserted += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        read: rows.length,
        inserted,
        duplicates: duplicates.length,
        skipped: skipped.length,
        errors: errors.length,
        details: { duplicates, skipped, errors },
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Bulk upload failed" },
      { status: 500 },
    );
  }
}
