# HANDOFF.md — mwms-lite

> 프로젝트 인수인계 문서. 전체 구조, 기능, 기술 스택을 정리.

---

## 1. 프로젝트 개요

**mwms-lite**는 패션 물류 SCM/WMS 경량 시스템이다.  
구매발주(PO)부터 입고(ASN/GR), 출고(DN/Shipment), 재고까지 전 흐름을 커버하며,  
내부 어드민과 외부 벤더(공급업체) 두 포털로 분리 운영된다.

---

## 2. 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| React | React 19 |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| Styling | Tailwind CSS v4 |
| Excel/CSV 처리 | ExcelJS |
| 이메일 발송 | Resend |
| Linting | ESLint 9 (eslint-config-next) |

---

## 3. 프로젝트 구조

```
mwms-lite/
├── src/
│   ├── app/
│   │   ├── (app)/              # 내부 어드민 메인 앱
│   │   │   ├── inbound/        # 입고 모듈
│   │   │   │   ├── po/         # 발주서(PO) 목록 및 상세
│   │   │   │   ├── asn/        # ASN (사전출하통지) v1
│   │   │   │   ├── asn-v2/     # ASN v2 (실험적)
│   │   │   │   └── gr/         # 입고확인서(GR)
│   │   │   ├── outbound/       # 출고 모듈
│   │   │   │   ├── dn/         # 출고지시서(DN)
│   │   │   │   └── shipment/   # 출고 Shipment
│   │   │   ├── inventory/      # 재고 모듈
│   │   │   │   ├── page.tsx    # 재고 현황
│   │   │   │   ├── ledger/     # 재고 원장
│   │   │   │   └── tx/         # 재고 트랜잭션
│   │   │   ├── master/         # 마스터 데이터
│   │   │   │   └── products/   # 상품 마스터
│   │   │   ├── scm/            # SCM 뷰
│   │   │   │   └── shipment/   # Shipment 목록/상세
│   │   │   ├── monitor/        # 운영 모니터
│   │   │   └── layout.tsx      # 내부 어드민 레이아웃 (Sidebar)
│   │   │
│   │   ├── (vendor)/           # 벤더 포털
│   │   │   ├── vendor/
│   │   │   │   └── packing-lists/   # 패킹리스트 CRUD
│   │   │   └── layout.tsx      # 벤더 레이아웃 (VendorSidebar)
│   │   │
│   │   ├── (wms-shell)/        # WMS 실행 콘솔 (창고 작업자용)
│   │   │   └── wms/
│   │   │       ├── asn/        # ASN 작업 화면
│   │   │       ├── dn/         # DN 작업 화면
│   │   │       ├── shipment/   # Shipment 작업 화면
│   │   │       └── monitor/    # WMS 모니터
│   │   │
│   │   ├── (auth)/             # 인증 관련
│   │   │   └── change-password/
│   │   │
│   │   ├── admin/              # 어드민 전용 페이지 (서버 렌더링)
│   │   │   ├── packing-lists/  # 패킹리스트 관리
│   │   │   └── vendors/        # 벤더/벤더유저 관리
│   │   │
│   │   ├── vendor-login/       # 벤더 로그인 페이지
│   │   │
│   │   └── api/                # Next.js Route Handlers (REST API)
│   │       ├── po/             # PO CRUD, 템플릿, CSV 업로드
│   │       ├── asn/            # ASN CRUD, 생성, 템플릿
│   │       ├── asn-v2/         # ASN v2 API
│   │       ├── gr/             # GR CRUD, 확인, 벌크 업로드
│   │       ├── dn/             # DN CRUD, pick/pack/ship, 벌크
│   │       ├── gi/             # GI(출고지시) post
│   │       ├── inventory/      # 재고 조회, 원장, 트랜잭션, 조정
│   │       ├── shipment/       # Shipment 생성, 팔레트 관리, 스캔
│   │       ├── scm/shipment/   # SCM Shipment 조회/내보내기
│   │       ├── wms/            # WMS 전용 API (asn/dn/monitor)
│   │       ├── monitor/        # 운영 모니터 API
│   │       ├── products/       # 상품 마스터 CRUD, 업로드
│   │       ├── packing-list/   # 패킹리스트 단건 조회
│   │       ├── vendor/         # 벤더용 패킹리스트/PO API
│   │       ├── admin/          # 어드민용 패킹리스트/벤더 API
│   │       └── auth/           # 비밀번호 변경
│   │
│   ├── components/
│   │   ├── Sidebar.tsx         # 내부 어드민 사이드바
│   │   ├── WmsSidebar.tsx      # WMS 콘솔 사이드바
│   │   ├── PageToolbar.tsx     # 페이지 공통 툴바
│   │   ├── CsvUploadButton.tsx # CSV 업로드 버튼 공통 컴포넌트
│   │   ├── common/
│   │   │   ├── pagination.tsx
│   │   │   └── status-badge.tsx
│   │   ├── admin/              # 어드민 전용 컴포넌트
│   │   ├── dn/                 # DN 벌크 업로드 패널
│   │   ├── gr/                 # GR 벌크 업로드 패널
│   │   ├── upload/             # 업로드 공통 UI (PreviewGrid, SummaryCard, TemplateCard)
│   │   └── vendor/             # 벤더 포털 전용 컴포넌트
│   │
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts       # 클라이언트 사이드 Supabase
│       │   ├── server.ts       # 서버 사이드 Supabase (SSR)
│       │   └── admin.ts        # Service Role (관리자 권한)
│       ├── authz.ts            # 인증/인가 헬퍼 (역할, 벤더 접근 제어)
│       ├── notify.ts           # 이메일 알림 (Resend)
│       ├── csv.ts              # CSV 파싱/생성 유틸
│       ├── csv-template.ts     # CSV 템플릿 생성
│       ├── vendor-scope.ts     # 벤더 범위 제한 유틸
│       ├── auth/
│       │   └── require-password-change.ts
│       ├── types/
│       │   └── upload.ts
│       └── validators/
│           ├── dn-bulk-validator.ts
│           └── gr-bulk-validator.ts
│
├── public/
│   └── templates/
│       └── packing-list-upload-template.csv
│
├── package.json
├── next.config.ts
├── tailwind.config (postcss.config.mjs)
└── eslint.config.mjs
```

---

## 4. 사용자 역할 (Role)

| 역할 | 접근 범위 |
|------|-----------|
| `ADMIN` (내부) | 모든 기능 접근. PO 생성, ASN/GR/DN 관리, 벤더 관리, 패킹리스트 승인 |
| `VENDOR` (외부) | 자사 패킹리스트 CRUD, PO 조회, 패킹리스트 제출 |

- Supabase Auth 기반 세션 관리
- `user_profiles` 테이블에서 `role`, `vendor_id`, `status` 관리
- 서버 컴포넌트/Route Handler에서 `authz.ts`로 권한 체크

---

## 5. 주요 기능 모듈

### 5-1. 내부 어드민 (`/app/(app)/`)

#### Master
- **상품 마스터** (`/master/products`): 상품 등록, CSV 업로드/다운로드

#### Inbound (입고)
- **PO (발주서)** (`/inbound/po`):
  - PO 헤더/라인 CSV 업로드 (2단계: 헤더 먼저, 라인 나중)
  - PO 목록 (연결된 ASN 현황 포함), PO 상세
  - PO 생성 시 벤더에게 이메일 알림 발송

- **ASN (사전출하통지)** (`/inbound/asn`):
  - PO 기반 또는 패킹리스트 기반 ASN 생성
  - ASN 목록, 상세, CSV 템플릿 다운로드
  - ASN v2 (`/inbound/asn-v2`): 개선된 ASN 버전

- **GR (입고확인서)** (`/inbound/gr`):
  - ASN 기반 GR 생성
  - 벌크 CSV 업로드 (미리보기 → 적용 2단계)
  - GR 확인(Confirm), CSV 내보내기

#### Outbound (출고)
- **DN (출고지시서)** (`/outbound/dn`):
  - DN 목록, 상세 (Pick → Pack → Ship 워크플로우)
  - 벌크 업로드 (CSV), 벌크 출고(Ship)
  - Open DN 목록 (`/outbound/dn/open`)
  - CSV 내보내기

- **Shipment** (`/scm/shipment`):
  - Shipment 목록, 상세
  - Header/Detail CSV 내보내기

#### Inventory (재고)
- **재고 현황** (`/inventory`): 재고 조회, CSV 내보내기, 조정 업로드
- **재고 원장** (`/inventory/ledger`): 입출고 내역 원장, CSV 내보내기
- **재고 트랜잭션** (`/inventory/tx`): 트랜잭션 이력 조회

#### Monitor
- **운영 모니터** (`/monitor`):
  - PL/ASN/GR/DN 요약 카드 (Total/Open/Closed)
  - 최근 데이터 테이블 (All/Open/Closed 필터)
  - Trace 기능 (`TraceClient.tsx`)

---

### 5-2. 벤더 포털 (`/app/(vendor)/`)

- **패킹리스트 목록** (`/vendor/packing-lists`)
- **패킹리스트 생성** (`/vendor/packing-lists/new`): PO 선택 → 라인 입력
- **패킹리스트 상세/편집** (`/vendor/packing-lists/[id]`): 라인 CSV 가져오기, 제출(Submit)
- CSV 템플릿 다운로드, 라인 내보내기
- 패킹리스트 제출 시 어드민에게 이메일 알림

---

### 5-3. WMS 콘솔 (`/app/(wms-shell)/`)

창고 작업자 전용 실행 화면.

- **Open ASN** (`/wms/asn`): 입고 작업 대상 ASN 목록, 실행(Save)
- **Open DN** (`/wms/dn`): 출고 작업 대상 DN 목록, Box 등록, Confirm
- **Open Shipment** (`/wms/shipment`): 팔레트 스캔/관리
- **Monitor** (`/wms/monitor`): WMS 전용 ASN/DN 모니터, 데이터 내보내기

---

### 5-4. 어드민 관리 (`/app/admin/`)

- **패킹리스트 관리** (`/admin/packing-lists`): 전체 PL 조회, 상태 액션 (Review/Confirm/Cancel)
- **벤더 관리** (`/admin/vendors/[id]`): 벤더 상세, 벤더유저 생성/비밀번호 초기화

---

## 6. 이메일 알림 이벤트 (Resend)

| 이벤트 | 수신자 | 내용 |
|--------|--------|------|
| PO 생성 | 해당 벤더 사용자 | PO 번호, 패킹리스트 생성 링크 |
| 패킹리스트 제출 | 내부 어드민 | PL 번호, 상세 링크 |
| 패킹리스트 기반 ASN 생성 | 내부 어드민 | PL/ASN 번호, 링크 |

> 현재 `TEST_MODE = true` 설정으로 모든 메일이 `MAIL_TO_TEST` 주소로만 발송됨.

---

## 7. 데이터베이스 주요 테이블

| 테이블 | 설명 |
|--------|------|
| `user_profiles` | 사용자 프로필 (role, vendor_id, status) |
| `vendor` | 벤더(공급업체) 마스터 |
| `po_header` | 발주서 헤더 |
| `po_line` | 발주서 라인 |
| `asn_header` | ASN 헤더 (source_type: MANUAL / PACKING_LIST) |
| `asn_line` | ASN 라인 |
| `gr_header` | 입고확인서 헤더 |
| `gr_line` | 입고확인서 라인 |
| `dn_header` | 출고지시서 헤더 |
| `dn_line` | 출고지시서 라인 |
| `packing_list` | 패킹리스트 헤더 |
| `packing_list_line` | 패킹리스트 라인 |
| `shipment` | 출고 Shipment |
| `shipment_pallet` | 팔레트 |
| `inventory` | 재고 현황 |
| `inventory_ledger` | 재고 원장 |

---

## 8. 상태 플로우

### 패킹리스트 (PL)
```
DRAFT → SUBMITTED → REVIEW → CONFIRMED → (ASN 생성) → INBOUND_COMPLETED
                           ↘ CANCELLED
```

### ASN
```
CREATED → PARTIAL_RECEIVED → FULL_RECEIVED
```

### GR
```
PENDING → CONFIRMED
```

### DN
```
OPEN → RESERVED → PICKED → PACKED → SHIPPED → CONFIRMED
```

---

## 9. 환경 변수

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 (서버 전용) |
| `RESEND_API_KEY` | 이메일 발송용 Resend API 키 |
| `MAIL_FROM` | 발신자 이메일 |
| `MAIL_TO_TEST` | 테스트 모드 수신자 이메일 |
| `MAIL_TO_INTERNAL` | 내부 어드민 수신자 (쉼표 구분) |
| `APP_BASE_URL` | 앱 기본 URL (이메일 링크 생성용) |
| `TEST_VENDOR_CODE` | 테스트 벤더 코드 (기본: VND-001) |

---

## 10. 개발 실행

```bash
npm install
npm run dev        # http://localhost:3000 (기본)
npm run build
npm run start
npm run lint
```

---

## 11. 라우트 레이아웃 분리 구조

| Route Group | URL 패턴 | 레이아웃 | 대상 |
|-------------|----------|---------|------|
| `(app)` | `/inbound/*`, `/outbound/*`, `/inventory/*`, `/master/*`, `/monitor/*`, `/scm/*` | Sidebar (SCM System) | 내부 어드민 |
| `(vendor)` | `/vendor/*` | VendorSidebar (Vendor Portal) | 외부 벤더 |
| `(wms-shell)` | `/wms/*` | WmsSidebar (WMS Console) | 창고 작업자 |
| `(auth)` | `/change-password` | 없음 | 인증 플로우 |
| `admin` | `/admin/*` | 없음 (서버 렌더링) | 내부 어드민 전용 |

---

## 12. 알려진 특이사항

- PO 라인 테이블에 `qty`와 `qty_ordered` 두 컬럼이 혼재. 코드에서 `qty_ordered ?? qty`로 fallback 처리.
- ASN v2(`/inbound/asn-v2`)는 실험적 버전으로 별도 API(`/api/asn-v2/`)를 사용.
- 이메일 알림은 `TEST_MODE = true` 하드코딩 상태 — 프로덕션 배포 시 반드시 `false`로 변경 필요.
- WMS 콘솔(`/wms/`)은 별도 레이아웃으로 창고 작업자 UX에 최적화됨.
- CSV 업로드는 Route Handler (`/api/*/upload`)로 처리하며, 벌크 작업은 미리보기 → 적용 2단계 방식.
