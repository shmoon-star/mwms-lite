# MWMS-Lite — 최종 핸드오프 문서

> **작성일:** 2026-04-14
> **최종 커밋:** `4516b6b` (master, origin/master)
> **문서 목적:** 기존 시스템 가이드 + 2026-04-13~14 업데이트 + WMS DN 추가 조정까지 통합 정리

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [포털별 기능](#2-포털별-기능)
3. [프로세스 플로우](#3-프로세스-플로우)
4. [주요 특징 및 공통 규칙](#4-주요-특징-및-공통-규칙)
5. [2026-04-13 업데이트 내역](#5-2026-04-13-업데이트-내역)
6. [2026-04-14 업데이트 내역 (WMS DN Box Packing)](#6-2026-04-14-업데이트-내역-wms-dn-box-packing)
7. [Supabase 스키마 변경사항](#7-supabase-스키마-변경사항)
8. [운영 대기 항목 (DNS / 설정)](#8-운영-대기-항목)
9. [기술 부채 및 향후 작업](#9-기술-부채-및-향후-작업)

---

## 1. 시스템 개요

**MWMS-Lite**는 수출입 물류를 위한 통합 SCM(공급망 관리) 시스템입니다. 발주(PO)부터 입고(GR), 출고(DN), 선적(Shipment), 바이어 GR까지 전체 물류 프로세스를 하나의 플랫폼에서 관리합니다.

### 포지셔닝

- **ERP 대체가 아닌 Overlay 구조** — SAP 없는 환경의 운영 브리지
- **WMS = Execution**, **SCM = Visibility** (명확한 역할 분리)
- **Core(mwms-lite)**는 상태/데이터 관리만 담당, 실행은 WMS Console 또는 Scanner로 분리

### 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| React | React 19 |
| DB / Auth | Supabase (PostgreSQL + Auth) |
| Styling | Tailwind CSS v4 |
| Excel/CSV | ExcelJS, xlsx |
| Email | Resend |
| Charts | recharts |
| Barcode | Code128B SVG (pure JS) |
| 배포 | Vercel (GitHub master 자동 배포) |

---

## 2. 포털별 기능

시스템은 **4개 포털**로 구성되며, 각 역할별로 필요한 기능만 접근할 수 있습니다.

| 포털 | 대상 | 주요 기능 | 권한 |
|------|------|-----------|------|
| **SCM System** | 내부 운영팀 | 전체 물류 관리 + 모니터링 + 유저관리 | 읽기/쓰기 |
| **Vendor Portal** | 벤더 담당자 | 패킹리스트 작성/제출 | 제한된 쓰기 |
| **Buyer Portal** | 바이어 담당자 | PO/DN/Shipment 조회 | 읽기 전용 |
| **WMS Console** | 물류센터 작업자 | 입출고 실행 + 박스 패킹 | 실행 권한 |

### 2.1 SCM System (메인 관리자)

**Master**
- `Products` — 상품 마스터 관리 (SKU, 바코드, 브랜드, 카테고리). CSV/Excel 업로드

**Inbound (입고)**
- `PO` — 발주서 업로드/관리. ETA 수정 시 벤더에게 자동 이메일
- `ASN` — 직접 CSV 업로드로 ASN 생성
- `ASN v2` — 벤더 패킹리스트 기반 자동 생성
- `GR` — WMS에서 수신된 입고 결과 확인

**Outbound (출고)**
- `DN` — 출고지시서 생성/확인/출고
- `Shipment` — BL No, ETD/ETA/ATD/ATA, 선박, 컨테이너, Buyer GR Date, Invoice No

**Inventory (재고)**
- `Stock` — 재고 현황 스냅샷 (보유/예약/가용)
- `Ledger` — 재고 거래 원장
- `Adjustment` — 수동 재고 보정

**Monitor (모니터링)**
- `Monitor` — PL/ASN/GR/DN/Shipment 요약 카드 + Open/Closed 필터 + CSV 다운로드
- `Analytics` — ETA Compliance 도넛 + Inbound/Outbound Lead Time 워터폴
- `Buyer Trend` — 바이어별 일별 입출고 트렌드
- `Settlement` — 월정산 (포워딩비/입고비/기타비 안분)
- `WMS Daily` — Excel 업로드 기반 일별 입출고 대시보드
- `Upcoming` — 60일 일정 (ETA/ETD 기준)

**Admin**
- `Users` — 계정 생성 (이메일+임시PW), 역할 변경, 비활성화, PW 리셋. Vendor/Buyer 신규 등록

### 2.2 Vendor Portal

| 기능 | 설명 |
|------|------|
| 패킹리스트 조회 | 본인 벤더의 PL 목록 (DRAFT/SUBMITTED/FINALIZED) |
| 패킹리스트 생성 | PO 선택 → CSV 업로드로 라인 입력 |
| PO Lines 확인 | SKU 설명(description) 포함 표시 |
| 제출 | 제출 시 SCM 측 알림 + ASN 자동 생성 연동 |

### 2.3 Buyer Portal (읽기 전용)

| 기능 | 설명 |
|------|------|
| PO 조회 | 발주서 목록 + GR 상태 |
| DN 조회 | 출고지시서 목록 + 출고일 |
| Shipment 조회 | 선적 목록 + ATA + Buyer GR Date (편집 가능) |
| Monitor | 요약 카드로 전체 현황 |
| WMS Dashboard | MUSINSA JP 전용 일별 입출고 대시보드 |

### 2.4 WMS Console

| 기능 | 설명 |
|------|------|
| Open ASN | 입고 작업: 라인별 수량 확인, GR 생성, 재고 반영 |
| Open DN | 출고 작업: 박스 생성 → 바코드 스캔 → 아이템 추가 → 박스 마감 → Ship Confirm |
| Open Shipment | 선적 작업: 팔레타이징, 선적 관리 |
| Monitor | ASN/DN 실시간 모니터링 |
| Box Label Print | 박스 패킹리스트 라벨 (10×20cm, Code128 바코드) |

---

## 3. 프로세스 플로우

### Inbound Flow (입고)

```
1. PO 생성 (ETA 설정)
    ↓
2. Vendor PL 작성/제출
    ↓
3. ASN 자동 생성 (PL 기반)
    ↓
4. WMS 입고 (실 수량 확인 → GR 생성)
    ↓
5. 재고 반영 (GR 확정 시 자동 증가)
```

### Outbound Flow (출고)

```
1. DN 생성
    ↓
2. WMS 박스 패킹 (박스 생성 → SKU 스캔 → 수량 입력 → 박스 마감)
    ↓
3. Ship Confirm (재고 차감)
    ↓
4. Shipment 입력 (BL, 선박, 컨테이너, ETD)
    ↓
5. ATD → ATA (실 출항/도착)
    ↓
6. Buyer GR (현지 도착 후 바이어 GR 날짜 기록)
```

---

## 4. 주요 특징 및 공통 규칙

| 특징 | 설명 |
|------|------|
| **CSV Export** | 모든 SKU 레벨 CSV에 `sku → barcode → description` 3개 컬럼 항상 포함 |
| **날짜 표시** | KST(UTC+9) 기준 `YYYY-MM-DD` 형식 통일 (40+ 파일 `src/lib/fmt.ts` 사용) |
| **이메일 알림** | ETA 변경, PL 제출, PO 생성, WMS 입고 시 자동 발송 (Resend) |
| **사이드바 고정** | 전 포털 Sticky 적용 (SCM/Vendor/Buyer/WMS) |
| **Performance Analytics** | ETA Compliance 도넛 (±2일 허용, Qty 기준) + Lead Time 워터폴 |
| **Box Label** | 10×20cm, Code128 바코드, DN No + Box No + SKU 바코드 포함 |
| **Admin 유저 관리** | 시스템에서 직접 계정 생성/수정/PW 리셋 |

### 역할별 접근 권한

| 포털 | 접근 가능 역할 | 비고 |
|------|--------------|------|
| SCM System | `ADMIN` | 전체 관리자 |
| Vendor Portal | `VENDOR`, `ADMIN` | 자신의 Vendor 데이터만 |
| Buyer Portal | `BUYER`, `ADMIN` | 읽기 전용 |
| WMS Console | `WMS`, `ADMIN` | 물류센터 실행 권한 |

---

## 5. 2026-04-13 업데이트 내역

**총 커밋:** 15건 | **수정 파일:** 150+ | **신규 페이지:** 7개 | **신규 API:** 12개

### 5.1 UI/UX 개선
- 전 포털 사이드바 **Sticky 고정** (SCM, Vendor, Buyer, WMS)
- 모든 테이블 날짜 **UTC → KST** `YYYY-MM-DD` 변환 (40+ 파일)
- 테이블 **가로스크롤 자동 적용** + 셀 줄바꿈 방지
- 사이드바 메뉴 **하이라이트 중복 수정** (`/monitor`와 `/monitor/analytics` 동시 활성화 방지)

### 5.2 CSV Export 강화
- 모든 SKU 레벨 CSV에 `sku → barcode → description` 3개 컬럼 포함 (11개 파일)
- Shipment CSV에 `atd`, `ata`, `buyer_gr_date`, `invoice_no` 추가
- Settlement 상세/전체 CSV 다운로드 (DN별 안분 결과 + invoice/bl)

### 5.3 PO ETA 수정 + 벤더 이메일
- PO 상세에서 ETA 수정 기능
- ETA 변경 시 벤더에게 자동 이메일 (Resend)
- `PATCH /api/po/[id]` 엔드포인트 추가

### 5.4 WMS Box Label 프린트
- WMS DN 상세에서 박스 선택 → Print Label
- 10×20cm 스티커 라벨 (팝업 → Ctrl+P)
- Box No + Code128 바코드, SKU별 바코드/Description/Qty

### 5.5 Admin 유저 관리
- `/admin/users` 페이지 신규
- 유저 목록 + 생성 + 인라인 편집 + PW 리셋
- Internal/Vendor/Buyer/WMS 타입별 계정 생성
- Supabase Auth + `user_profiles` 원자적 생성
- Vendor/Buyer 신규 등록 가능 (+ New 버튼)

### 5.6 Performance Analytics
- `/monitor/analytics` 페이지 신규
- **Inbound Compliance**: ETA 대비 GR Confirmed (±2일, Qty 기준) 도넛
- **Outbound Compliance**: Planned GI Date 대비 DN Confirmed 도넛
- **Inbound/Outbound Lead Time**: 구간별 워터폴 차트 (각 구간이 이전 구간 끝에서 시작)
- 바이어(ship_to) 필터 버튼: ALL / CN / JP_TOKYO_STORE

### 5.7 Buyer Trend
- `/monitor/buyer-trend` 페이지 신규
- DN ship_to 기준 바이어별 일별 입출고 트렌드
- GR(입고) vs DN(출고) 일별 막대 + 누적 추이

### 5.8 Monthly Settlement (월정산)
- `/monitor/settlement` 페이지 신규
- **3가지 비용 입력**: 포워딩비, 입고/상품화비, 기타비용
- 미정산 DN 전체 조회 (이미 정산된 DN 자동 제외)
- DN별 비용 안분 (총비용 ÷ 총PCS × DN PCS)
- **수동 입력 모드** (과거 데이터용, DN 없이 직접 입력)
- DN 선택 화면에 Invoice No, BL No 컬럼 표시
- Analytics에 당월 정산 요약 + 바이어별 안분 테이블
- Settlement CSV 다운로드 (개별 + 전체), 통화 **₩(KRW)**

### 5.9 Shipment 필드 추가
- `buyer_gr_date`: Buyer GR Date (바이어 현지 입고일)
- `invoice_no`: Invoice Number
- SCM/Buyer Shipment 상세/목록, CSV export 모두 반영
- Buyer Portal에서 직접 편집 가능 (Edit → SCM/WMS 즉시 반영)

### 5.10 WMS Daily Dashboard
- `/analytics/wms-dashboard`: Excel 업로드 → 자동 차트 생성
- 일별 IN/OUT, 누적 추이, 유형별 비중, B2B 매장별, 브랜드별 Top 10
- DB 저장 (`wms_daily_upload` 테이블, 날짜별 UPSERT)
- 이력 조회: 저장된 날짜 선택 → 과거 데이터
- Buyer Portal에도 동일 대시보드 (MUSINSA JP 전용)

### 5.11 Resend Inbound Webhook (준비 완료)
- `POST /api/webhook/resend-inbound` 엔드포인트 구현 완료
- 이메일 수신 → 첨부파일 Excel 자동 파싱 → DB 저장
- DNS 설정 후 바로 활성화 가능 (IT팀 MX 레코드 추가 요청 필요)
- Resend Pro 플랜 업그레이드 완료

### 5.12 WMS 입고 자동 알림
- Excel 업로드/Webhook 수신 시 IN 데이터 감지
- 입고가 있으면 바이어에게 자동 이메일
- 메일: 날짜, IN 수량, 유형별 상세, Model Name별 수량
- Excel 시리얼 번호 → `YYYY-MM-DD` 자동 변환

---

## 6. 2026-04-14 업데이트 내역 (WMS DN Box Packing)

### 6.1 Box Packing UI 전면 리디자인

기존 산재된 UI를 **Scan → Key-in → Action** 3단계로 통합 정리:

| 영역 | 입력 항목 |
|------|-----------|
| **SCAN** (파란색) | ① Box No *, ② Box Type (1~5 텍스트), ③ SKU/Barcode (Enter 조회) |
| **KEY-IN** (노란색) | ④ Qty, ⑤ Weight (kg) — *박스당 1회만 표시* |
| **ACTION** | ⑥ Save 버튼 (동적 라벨), ⑦ Print Label + Close Box |

### 6.2 세부 조정 (최종 커밋 `4516b6b`)

#### Weight 필드 — 박스당 1회만 표시
- 선택된 박스에 **아이템이 없을 때만** Weight 입력 필드 표시
- 첫 번째 SKU 추가 후에는 Weight 필드가 자동 숨김
- 이유: Weight는 **박스 단위**이지 SKU 단위가 아님

#### Save 버튼 — 동적 라벨
- **새 박스** (`newBoxNo` 입력됨, 아직 생성 안 됨) → `"⑥ Save (Create Box + Add Item)"`
- **기존 박스** (이미 존재) → `"⑥ Save (Add Item)"`
- 한 번의 Save로 Create Box + Add Item 동시 처리

#### Print Label + Close Box 통합
- 기존: Print Label과 Close Box가 별도 버튼
- 변경: **Print Label 클릭 시 자동으로 Close Box까지 실행** (confirm 팝업 없음)
- 시퀀스: 라벨 프린트 창 열림 → 박스 Close → 데이터 리로드

#### Selected Box Detail 정리
- 우측 상단 **Print Label / Close Box 버튼 제거**
- 이제 해당 버튼은 좌측 하단 Box Packing 영역의 ⑦번 통합 버튼에서만 동작

#### handleCloseBox 시그니처 변경
```typescript
async function handleCloseBox(boxId: string, skipConfirm = false)
```
- `skipConfirm: true` 전달 시 confirm 다이얼로그 없이 즉시 실행 (Print Label 통합용)

### 6.3 Save (PACKING) 중간 저장 버튼
- 기존 커밋 `04bc3e2`에서 도입
- Ship Confirm 전 중간 저장을 위한 버튼
- DN 상태를 PACKING으로 전환만 하고 재고 차감 없음
- `POST /api/wms/dn/[id]/save-packing` 엔드포인트

### 6.4 관련 커밋 (4/14 세션)

```
4516b6b fix: WMS DN Box Packing UI — Weight 첫 SKU만, Print Label+Close Box 통합
ac72980 feat: WMS DN Box Packing UI 통합 — Scan/Key-in/Action 단계별 구분
ac4ec00 fix: WMS DN 작업 순서 수정 — Create Box 껍데기만, Print는 아이템 추가 후 수동
64f6aae feat: WMS DN 작업 UI 개선
96537e5 feat: WMS DN — 박스 선택 바코드 입력 + Create Box 후 자동 Print Label
04bc3e2 feat: WMS DN Save (PACKING) 버튼 추가 — Ship Confirm 전 중간 저장
cde55ff feat: Vendor PO Lines에 Description(상품명) 컬럼 추가
d7e6d25 feat: Vendor 패킹리스트 생성 시 PO Lines(SKU별 수량) 자동 표시 + CSV 다운로드
4d3cbc9 fix: Save Dimension 버튼 제거 (Close Pallet에 통합)
b1c25a0 fix: WMS Shipment — Close Pallet 박스 필수 검증 + Save Shipment 버튼
9343a64 fix: 입고 알림 날짜 포맷 수정 + Model Name별 수량 상세 추가
724b0ce fix: WMS Dashboard null 체크 수정
2a6ee0d feat: WMS 입고 알림 — Excel 업로드/Webhook 시 IN 데이터 감지 → 바이어 메일
```

---

## 7. Supabase 스키마 변경사항

Supabase SQL Editor에서 실행 필요:

### 7.1 Shipment 필드 추가
```sql
ALTER TABLE shipment_header ADD COLUMN buyer_gr_date date;
ALTER TABLE shipment_header ADD COLUMN invoice_no VARCHAR(100);
```

### 7.2 Monthly Settlement 테이블
```sql
-- 정산 헤더
CREATE TABLE monthly_settlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,
  buyer_code text NOT NULL,
  forwarding_cost numeric DEFAULT 0,
  processing_cost numeric DEFAULT 0,
  other_cost numeric DEFAULT 0,
  total_pcs integer DEFAULT 0,
  manual_mode boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 정산 DN 라인 (안분 결과)
CREATE TABLE monthly_settlement_dn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid REFERENCES monthly_settlement(id) ON DELETE CASCADE,
  dn_id uuid,
  dn_no text,
  pcs integer,
  allocated_cost numeric,
  created_at timestamptz DEFAULT now()
);
```

### 7.3 WMS Daily Upload 테이블
```sql
CREATE TABLE wms_daily_upload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_date date UNIQUE NOT NULL,
  raw_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

RLS 정책은 프로젝트 표준에 따라 개별 설정.

---

## 8. 운영 대기 항목

### 8.1 Resend Inbound DNS 설정 (IT팀 요청 필요)
- IT팀에 `inbound.musinsa.com` 서브도메인 **MX 레코드** 추가 요청
- Resend Dashboard Webhook URL: `https://mwms-lite.vercel.app/api/webhook/resend-inbound`
- Gmail 외부 WMS 메일 → 자동 포워딩 룰 설정 필요
- Resend Pro 플랜 업그레이드 완료 ($20/월)

### 8.2 SCM Login 페이지 (Production 전 필수)
- 현재 SCM System은 로그인 페이지 없음 (Auth 흐름만 있음)
- 프로덕션 배포 전 로그인 UI 구축 필요

### 8.3 Resend 도메인 인증
- `musinsa.com` DKIM/SPF 설정 (프로덕션 이메일 발송용)
- 현재 `TEST_MODE = true` 하드코딩 — 프로덕션 시 `false` 전환 필수

### 8.4 Settlement buyer_code 마이그레이션
- 현재 `ship_to` 사용 → 실 데이터 시점에 `buyer_code` (MUSINSA-JP, MUSINSA-CN)로 전환

---

## 9. 기술 부채 및 향후 작업

### 9.1 데이터 정합성 이슈
- PO 라인: `qty`와 `qty_ordered` 혼재 → `qty_ordered ?? qty` fallback
- ASN line: `qty` / `qty_expected` / `qty_received` 컬럼 사용 기준 불명확
- 일부 GR이 `gr_lines` 없이 생성된 이력 (DB 정합성)
- `dn_line` vs `dn_lines` 테이블명 혼재 가능성
- legacy 컬럼 `po_header.vendor` 잔존 (vendor_id로 통일됨)

### 9.2 구조적 이슈
- ASN v2(`/inbound/asn-v2`) 실험적 상태 — 별도 API
- API 응답 구조 혼재: `{ ok, data }` vs `{ gr, gr_lines }` vs `{ data }`
- 환경변수 validation 로직 없음
- 에러 핸들링 표준화 미완 (raw error 노출 존재)
- logging/monitoring 구조 없음
- DN confirm 중복 insert (unique constraint) 완전 해결 필요

### 9.3 미구현 기능
- 반품/역물류 모듈
- 품질검수(QC) 단계
- 로케이션(Zone/Rack/Bin) 관리
- 감사 로그(Audit Trail)
- 웨이브 피킹
- GR/DN 지연 알림
- 재고 유형 세분화 (Available / QC Hold / Damaged)
- Shipment 상태 자동 전이 (ATD→SHIPPED, ATA→ARRIVED) 완전 자동화
- Vendor multi-tenancy 완전 구현
- PO status 자동 변경 (ASN→GR→RECEIVED)
- Scanner WMS (모바일 전용 실행 앱)
- Forwarder Portal / External API v1

---

## 10. 개발 환경

### 실행 명령
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 프로덕션 빌드
npm run start      # 프로덕션 실행
npm run lint       # 린팅
```

### 주요 환경변수

| 변수 | 설명 | 노출 여부 |
|------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | 클라이언트 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 | 클라이언트 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | service role | **서버 전용** |
| `RESEND_API_KEY` | 이메일 API | 서버 전용 |
| `MAIL_FROM` | 발신자 | — |
| `MAIL_TO_TEST` | 테스트 수신자 | TEST_MODE용 |
| `MAIL_TO_INTERNAL` | 내부 어드민 (쉼표 구분) | — |
| `APP_BASE_URL` | 앱 기본 URL | 이메일 링크용 |

---

## 11. Git 상태

- **현재 브랜치:** `master`
- **최신 커밋:** `4516b6b` (origin/master와 동기화됨)
- **리모트:** `https://github.com/shmoon-star/mwms-lite.git`
- **배포:** Vercel auto-deploy from master

### 변경사항 확인 링크
```
https://github.com/shmoon-star/mwms-lite/commit/4516b6b
```

---

**MWMS-Lite SCM System** — Powered by Next.js + Supabase + Vercel + Resend

*본 문서는 2026-04-14 기준이며, 지속적으로 업데이트됩니다.*
