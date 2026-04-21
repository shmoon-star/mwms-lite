-- ============================================
-- history_export_raw 중복 row 정리 (2026-04-21)
--
-- 배경: mapExportRow의 row_key 공식에 sheet_row_number가 포함되어 있었음.
--      Google Sheet에서 같은 SKU의 행 번호가 바뀌면 sync마다 새 row가 쌓이면서
--      같은 (invoice_no, bl_no, style_color_size_code) 조합 row가 2~N개씩 중복
--      저장되는 버그. 매퍼를 고쳤으니 기존 중복도 정리.
--
-- 방식: (invoice_no, bl_no, style_color_size_code) 파티션별로 가장 최신
--      synced_at row만 남기고 나머지 삭제. is_locked=true(예: 25fw 종결 row)는
--      건드리지 않음.
--
-- 실행 후: Export Dashboard의 "🔄 Sync Now"를 한 번 돌리면 남은 row들이
--         새 row_key 공식으로 다시 UPSERT되어 완전히 일관된 상태가 됨.
-- ============================================

-- 사전 스냅샷 (실행 안전장치 — 롤백용)
-- 필요 없으면 이 블록만 주석 처리해도 됨
CREATE TABLE IF NOT EXISTS history_export_raw_backup_20260421 AS
SELECT * FROM history_export_raw;

-- unlocked row 중 (invoice_no, bl_no, style_color_size_code) 기준 중복 제거
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(invoice_no, ''),
        COALESCE(bl_no, ''),
        COALESCE(style_color_size_code, '')
      ORDER BY synced_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM history_export_raw
  WHERE is_locked = FALSE
)
DELETE FROM history_export_raw
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 확인용 쿼리 (수동 실행)
-- SELECT COUNT(*) FROM history_export_raw_backup_20260421;
-- SELECT COUNT(*) FROM history_export_raw;
-- SELECT COUNT(*) FROM history_export_raw_backup_20260421 - (SELECT COUNT(*) FROM history_export_raw) AS deleted_rows;
