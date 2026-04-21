-- history_sync_log에 rows_filtered_empty 컬럼 추가
-- (매핑 단계에서 "완전 빈 row"로 필터링된 개수. 488 읽음 vs 481 UPSERT 같은
--  불일치 원인을 정확히 추적하기 위함)
ALTER TABLE history_sync_log
  ADD COLUMN IF NOT EXISTS rows_filtered_empty integer DEFAULT 0;
