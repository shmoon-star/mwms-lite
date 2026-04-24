-- ============================================
-- Customs Watchlist (수입 통관 진행 감시)
-- UNI-PASS OpenAPI가 "회사명 기반 내 화물 조회"를 지원하지 않으므로,
-- 감시할 BL을 직접 등록해놓고 주기적으로 API 재호출 → 상태 변화 시 스냅샷 적재.
--
-- 실행:
--   Supabase SQL Editor에서 이 파일 내용을 전체 복사 후 실행
-- ============================================

CREATE TABLE IF NOT EXISTS customs_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 조회 키 (하나 이상 필수 — API route에서 검증)
  mbl_no text,
  hbl_no text,
  bl_yy text,              -- 4자리 년도 (MBL/HBL 조회시 필수)
  carg_mt_no text,         -- 화물관리번호 (선택, 가장 정확)
  memo text,               -- 사용자 메모 (예: "FW26 KF001 — Hangzhou 창고 입고용")

  -- 최근 상태 캐시 (빠른 목록 조회용)
  last_checked_at timestamptz,
  last_prgs_stts text,          -- 진행상태 (예: "반출완료")
  last_cscl_prgs_stts text,     -- 통관진행상태 (예: "수입신고수리")
  last_etpr_dt text,            -- 입항일자 (YYYYMMDD)
  last_detail_count int DEFAULT 0,  -- 반출입 이력 건수
  last_error text,              -- 마지막 호출에서 에러난 경우 메시지

  -- 감시 중단 플래그 (반출 완료 등으로 종료된 건)
  is_closed boolean DEFAULT false,
  closed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 활성 watch의 조회 키 중복 방지
-- (MBL+HBL+년도+화물관리번호 조합 기준, NULL은 '' 로 취급)
CREATE UNIQUE INDEX IF NOT EXISTS customs_watch_key_active_idx
  ON customs_watch (
    COALESCE(mbl_no, ''),
    COALESCE(hbl_no, ''),
    COALESCE(bl_yy, ''),
    COALESCE(carg_mt_no, '')
  )
  WHERE is_closed = false;

CREATE INDEX IF NOT EXISTS customs_watch_is_closed_idx
  ON customs_watch (is_closed);

CREATE INDEX IF NOT EXISTS customs_watch_last_checked_at_idx
  ON customs_watch (last_checked_at);


-- 상태 변화 스냅샷 (값이 바뀌었을 때만 insert)
CREATE TABLE IF NOT EXISTS customs_watch_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id uuid NOT NULL REFERENCES customs_watch(id) ON DELETE CASCADE,

  checked_at timestamptz DEFAULT now(),

  -- 스냅샷 시점의 주요 필드
  prgs_stts text,
  cscl_prgs_stts text,
  etpr_dt text,
  detail_count int DEFAULT 0,

  -- 전체 응답 보존 (디버깅/재분석용)
  raw_response jsonb,

  -- 이전 스냅샷 대비 무엇이 변했는지 사람이 읽을 수 있는 요약
  -- (예: "진행상태: 입항대기 → 반출완료, 반출입이력: 2건 → 3건")
  change_summary text
);

CREATE INDEX IF NOT EXISTS customs_watch_snapshot_watch_id_idx
  ON customs_watch_snapshot (watch_id);

CREATE INDEX IF NOT EXISTS customs_watch_snapshot_checked_at_idx
  ON customs_watch_snapshot (checked_at DESC);


-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION customs_watch_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customs_watch_updated_at_trigger ON customs_watch;
CREATE TRIGGER customs_watch_updated_at_trigger
  BEFORE UPDATE ON customs_watch
  FOR EACH ROW EXECUTE FUNCTION customs_watch_set_updated_at();
