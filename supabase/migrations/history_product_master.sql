-- ============================================
-- 상품 Master 테이블 (Google Sheets 동기화)
-- 시트: 상품 master 시트의 사본
-- 헤더: Row 6 (Excel 1-indexed)
-- ============================================

CREATE TABLE IF NOT EXISTS history_product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UPSERT 키 (SKU + size 조합)
  row_key text UNIQUE NOT NULL,

  -- 핵심 정규화 필드 (피벗/대시보드용)
  brand_name text,
  style_number text,             -- 스타일넘버 * 컬러코드 제외
  style_color_code text,         -- 스타일넘버 (컬러까지)
  size text,                     -- 사이즈
  logistics_status text,         -- 물류 현황
  total_order_qty integer,       -- 발주 수량

  -- 레거시 잠금 플래그 (필요 시)
  is_locked boolean DEFAULT false,

  -- 나머지 모든 컬럼은 raw_data로 보존
  raw_data jsonb,
  sheet_row_number integer,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_brand ON history_product_master(brand_name);
CREATE INDEX IF NOT EXISTS idx_master_logistics ON history_product_master(logistics_status);
CREATE INDEX IF NOT EXISTS idx_master_style_color ON history_product_master(style_color_code);

-- RLS
ALTER TABLE history_product_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin_all" ON history_product_master
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'ADMIN')
  );
