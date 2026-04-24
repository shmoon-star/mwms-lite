-- ============================================
-- customs_watch: 화물 상세 캐시 (거의 불변 정보) 저장
-- 품명/선박/포워더/컨테이너/중량 등 header 전체를 JSON으로 보관
-- ============================================

ALTER TABLE customs_watch ADD COLUMN IF NOT EXISTS cargo_info jsonb;
