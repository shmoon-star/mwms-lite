import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCargProgress, diffProgress } from "@/lib/unipass";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5분

/**
 * POST /api/customs/watch/refresh-all
 *   is_closed=false인 모든 watch를 순차적으로 재호출 (UNI-PASS rate 부담 방지).
 *   결과: { total, updated(snapshot insert 수), unchanged, errors[] }
 */
export async function POST(_req: NextRequest) {
  try {
    const sb = createAdminClient();

    const { data: watches, error } = await sb
      .from("customs_watch")
      .select("*")
      .eq("is_closed", false);
    if (error) throw new Error(error.message);

    const now = () => new Date().toISOString();
    let updated = 0;
    let unchanged = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const w of watches ?? []) {
      const result = await fetchCargProgress({
        mblNo: w.mbl_no ?? undefined,
        hblNo: w.hbl_no ?? undefined,
        blYy: w.bl_yy ?? undefined,
        cargMtNo: w.carg_mt_no ?? undefined,
      });

      if (!result.ok) {
        errors.push({ id: w.id, error: result.error });
        await sb
          .from("customs_watch")
          .update({ last_checked_at: now(), last_error: result.error })
          .eq("id", w.id);
        continue;
      }

      const diff = diffProgress(
        {
          last_prgs_stts: w.last_prgs_stts,
          last_cscl_prgs_stts: w.last_cscl_prgs_stts,
          last_etpr_dt: w.last_etpr_dt,
          last_detail_count: w.last_detail_count,
        },
        result.data,
      );
      const firstCall = !w.last_checked_at;
      const shouldSnapshot = firstCall || diff.changed;

      if (shouldSnapshot) {
        await sb.from("customs_watch_snapshot").insert({
          watch_id: w.id,
          prgs_stts: diff.snapshot.prgs_stts,
          cscl_prgs_stts: diff.snapshot.cscl_prgs_stts,
          etpr_dt: diff.snapshot.etpr_dt,
          detail_count: diff.snapshot.detail_count,
          raw_response: result.data as any,
          change_summary: firstCall ? "최초 조회" : diff.summary,
        });
        updated += 1;
      } else {
        unchanged += 1;
      }

      const patch: Record<string, any> = {
        last_checked_at: now(),
        last_prgs_stts: diff.snapshot.prgs_stts,
        last_cscl_prgs_stts: diff.snapshot.cscl_prgs_stts,
        last_etpr_dt: diff.snapshot.etpr_dt,
        last_detail_count: diff.snapshot.detail_count,
        last_error: null,
      };
      if (result.data.header) {
        patch.cargo_info = result.data.header;
        if (!w.carg_mt_no && result.data.header.cargMtNo) {
          patch.carg_mt_no = result.data.header.cargMtNo;
        }
      }
      await sb.from("customs_watch").update(patch).eq("id", w.id);
    }

    return NextResponse.json({
      ok: true,
      data: {
        total: watches?.length ?? 0,
        updated,
        unchanged,
        errors,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 },
    );
  }
}
