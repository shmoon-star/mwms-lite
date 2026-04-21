-- ============================================
-- History 테이블에 business_unit (BU) 컬럼 추가
-- 다중 국가 사업부 지원 (무신사 CN / JP / TW ...)
-- ============================================

-- 1) 컬럼 추가 (이미 있으면 skip)
ALTER TABLE history_document ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE history_settlement ADD COLUMN IF NOT EXISTS business_unit TEXT;

-- 2) 인덱스 추가 (BU별 필터/DELETE 빠르게)
CREATE INDEX IF NOT EXISTS idx_history_doc_bu ON history_document(business_unit);
CREATE INDEX IF NOT EXISTS idx_history_settlement_bu ON history_settlement(business_unit);

-- 3) 기존 데이터 마이그레이션
--   지금까지 업로드된 history 데이터는 전부 CN 파일이었으므로 'CN'으로 지정
--   (JP 파일 첫 업로드 이후 시점까지 이 SQL은 한 번만 실행)
UPDATE history_document   SET business_unit = 'CN' WHERE business_unit IS NULL;
UPDATE history_settlement SET business_unit = 'CN' WHERE business_unit IS NULL;
