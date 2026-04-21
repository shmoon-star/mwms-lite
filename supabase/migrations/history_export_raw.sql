-- ============================================
-- 수출내역 Raw 테이블 (Google Sheets 동기화)
-- 매일 09:00 Cron으로 sync
-- UPSERT 방식 (시트에서 지워도 DB는 유지)
-- ============================================

CREATE TABLE IF NOT EXISTS history_export_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 식별자 (UPSERT 키)
  -- sha1(invoice_no || '|' || bl_no || '|' || style_color_size_code)[:32]
  -- (같은 SKU line은 이 셋만으로 유일하다고 확정 — 2026-04-21)
  row_key text UNIQUE NOT NULL,

  -- 시즌/상태
  order_season text,              -- 25fw / 26ss
  shipment_status text,           -- CN 창고 입고 완료 / 선적 중 / 상품화 완료 등
  is_locked boolean DEFAULT false, -- true = 25fw 종결 데이터 (sync 시 skip)

  -- 기본
  export_batch text,              -- 수출 차수
  customs_declaration_no text,    -- 수출신고 필증 번호
  invoice_no text,
  bl_no text,

  -- 상품
  brand_name text,
  style_color_code text,
  style_color_size_code text,
  description_en text,
  description_kr text,
  hs_code text,
  knit_woven text,
  country_of_origin text,
  fabric_en text,
  fabric_cn text,

  -- 수량/금액
  unit_price numeric,
  qty_ordered integer,            -- Q'ty (pcs)
  qty_shipped integer,            -- 실 선적 수량
  invoice_amount numeric,
  total_qty_fixed integer,        -- 총 발주 수량 (고정)
  total_shipped_fixed integer,    -- 총 선적 수량 (고정)

  -- 관세/수식
  cn_customs_benefit numeric,
  total_qty_calc integer,
  total_shipped_ratio numeric,

  -- 일자
  eta_warehouse date,
  shipment_date date,
  out_month text,
  container_type text,
  dc_inbound_date date,
  dc_outbound_date date,
  atd_port date,
  ata_port date,
  cn_customs_clearance_date date,
  ata_warehouse date,
  eta_date date,

  -- Lead Time
  lt_dc_out_to_cn_in integer,
  lt_dc_in_to_cn_in integer,
  lt_dc_in_to_dc_out integer,
  lt_dc_out_to_shipment integer,
  lt_arrival_to_cn_warehouse integer,
  avg_total_lt numeric,

  -- 메타
  raw_data jsonb,
  sheet_row_number integer,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_raw_season ON history_export_raw(order_season);
CREATE INDEX IF NOT EXISTS idx_export_raw_brand ON history_export_raw(brand_name);
CREATE INDEX IF NOT EXISTS idx_export_raw_status ON history_export_raw(shipment_status);
CREATE INDEX IF NOT EXISTS idx_export_raw_dc_out ON history_export_raw(dc_outbound_date);
CREATE INDEX IF NOT EXISTS idx_export_raw_locked ON history_export_raw(is_locked);

-- Sync 로그
CREATE TABLE IF NOT EXISTS history_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,           -- 'google_sheets'
  sheet_name text,
  rows_read integer DEFAULT 0,
  rows_upserted integer DEFAULT 0,
  rows_skipped integer DEFAULT 0,
  status text NOT NULL,           -- 'success' | 'error'
  error_message text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sync_log_started ON history_sync_log(started_at DESC);

-- RLS
ALTER TABLE history_export_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_raw_admin_all" ON history_export_raw
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'ADMIN')
  );

CREATE POLICY "sync_log_admin_all" ON history_sync_log
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'ADMIN')
  );
