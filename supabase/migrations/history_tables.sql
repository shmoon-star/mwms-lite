-- ============================================
-- History 테이블 (과거 데이터 마이그레이션용)
-- 기존 운영 테이블과 완전 분리
-- 재고/이메일/연동 영향 없음
-- ============================================

-- 1. 단일 Document 테이블 (PO/DN/Shipment/GR 전부)
CREATE TABLE IF NOT EXISTS history_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,        -- 'PO' | 'DN' | 'SHIPMENT' | 'GR'
  doc_no text,
  doc_date date,
  year_month text,                -- '2025-06' (차트 집계용 캐시)
  vendor_code text,
  buyer_code text,
  sku text,
  description text,
  qty integer DEFAULT 0,
  unit_price numeric,
  amount numeric,
  currency text,
  -- Shipment 전용 필드
  bl_no text,
  etd date,
  eta date,
  atd date,
  ata date,
  buyer_gr_date date,
  invoice_no text,
  vessel text,
  container text,
  -- 기타
  remarks text,
  raw_data jsonb,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_doc_type_date ON history_document(doc_type, doc_date);
CREATE INDEX IF NOT EXISTS idx_history_year_month ON history_document(year_month);
CREATE INDEX IF NOT EXISTS idx_history_buyer ON history_document(buyer_code);
CREATE INDEX IF NOT EXISTS idx_history_vendor ON history_document(vendor_code);

-- 2. 월별 Settlement 비용
CREATE TABLE IF NOT EXISTS history_settlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,       -- '2025-06'
  buyer_code text,                -- NULL = 전체 공통비용
  forwarding_cost numeric DEFAULT 0,
  processing_cost numeric DEFAULT 0,
  other_cost numeric DEFAULT 0,
  notes text,
  dn_nos jsonb DEFAULT '[]'::jsonb,  -- 이 비용이 적용되는 DN 리스트 (빈 배열 = 전체 대상)
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_settlement_ym ON history_settlement(year_month);

-- 기존 테이블에 dn_nos 컬럼 추가 (이미 존재하면 skip)
ALTER TABLE history_settlement ADD COLUMN IF NOT EXISTS dn_nos jsonb DEFAULT '[]'::jsonb;

-- RLS 활성화 (ADMIN만 접근)
ALTER TABLE history_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_settlement ENABLE ROW LEVEL SECURITY;

-- ADMIN 전체 접근 정책
CREATE POLICY "history_document_admin_all" ON history_document
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'ADMIN'
    )
  );

CREATE POLICY "history_settlement_admin_all" ON history_settlement
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'ADMIN'
    )
  );
