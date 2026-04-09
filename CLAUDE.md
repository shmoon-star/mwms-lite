# CLAUDE.md — mwms-lite 프로젝트 컨텍스트

> Claude Code가 이 프로젝트를 이해하고 작업하기 위한 통합 문서.
> 모든 핸드오프(HANDOFF-001 ~ 021 + 추가 문서)를 구조화하여 통합.

---

## 1. 프로젝트 정의

**mwms-lite**는 패션 물류 Cross-border 운영 시스템이다.
단순 WMS/ERP가 아니라 "운영 브리지 시스템(ERP Overlay)"으로 포지셔닝.
구매발주(PO)부터 입고(ASN/GR), 출고(DN/Shipment), 재고까지 전 흐름을 커버한다.

### 시스템 구조 (4-Layer)
```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Vendor Portal   │   │  mwms-lite Core  │   │  WMS Console    │
│  (외부 벤더)      │──▶│  (상태/재고/문서)  │◀──│  (창고 작업자)    │
│  PL 생성/제출     │   │  SCM 어드민       │   │  입출고 실행      │
└─────────────────┘   └─────────────────┘   └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │                   │
             ┌──────┴──────┐   ┌────────┴────────┐
             │  CSV Upload  │   │  SCM Shipment    │
             │  (Admin 보정) │   │  (Visibility)    │
             └─────────────┘   └──────────────────┘
```

### 핵심 원칙
- **Core(mwms-lite)**는 상태/데이터 관리만 담당
- **실행(입고/출고)**은 WMS Console 또는 Scanner로 분리
- **WMS = Execution**, **SCM = Visibility** (명확한 역할 분리)
- **CSV**는 제거 대상이 아닌 운영 안정 장치 (예외/보정/대량 처리)
- **Scanner/CSV 모두 동일 API 사용** (데이터 불일치 방지)
- **ERP 대체가 아닌 Overlay 구조** — SAP 없는 환경의 운영 브리지

---

## 2. 기술 스택

| 항목 | 내용 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| React | React 19 |
| DB / Auth | Supabase (PostgreSQL + Auth) |
| Styling | Tailwind CSS v4 |
| Excel/CSV | ExcelJS |
| Email | Resend |
| Lint | ESLint 9 |

---

## 3. 프로젝트 구조

```
mwms-lite/
├── src/
│   ├── app/
│   │   ├── (app)/              # 내부 어드민 (SCM System)
│   │   │   ├── inbound/        # PO / ASN / ASN-v2 / GR
│   │   │   ├── outbound/       # DN / Shipment
│   │   │   ├── inventory/      # 재고현황 / 원장 / 트랜잭션
│   │   │   ├── master/         # 상품 마스터
│   │   │   ├── scm/shipment/   # SCM Shipment (Visibility Layer)
│   │   │   └── monitor/        # 운영 모니터
│   │   │
│   │   ├── (vendor)/           # 벤더 포털 (외부)
│   │   │   └── vendor/packing-lists/
│   │   │
│   │   ├── (wms-shell)/        # WMS 콘솔 (창고 작업자)
│   │   │   └── wms/
│   │   │       ├── asn/        # ASN Key-in (입고 실행)
│   │   │       ├── dn/         # DN 실행 (Box 등록, Confirm)
│   │   │       ├── shipment/   # Shipment 실행 (Pallet/Box Scan)
│   │   │       └── monitor/    # WMS 모니터
│   │   │
│   │   ├── (auth)/             # 인증 (비밀번호 변경)
│   │   ├── admin/              # 어드민 전용 (PL관리/벤더관리)
│   │   ├── vendor-login/       # 벤더 로그인 (redirect 지원)
│   │   └── api/                # REST API (Route Handlers)
│   │
│   ├── components/             # 공통/모듈별 컴포넌트
│   └── lib/                    # Supabase/Auth/CSV/Email 유틸
│
├── CLAUDE.md                   # ← 이 파일
└── HANDOFF.md                  # 기능 상세 인수인계 문서
```

### 라우트 레이아웃 분리

| Route Group | URL | 대상 | 레이아웃 |
|-------------|-----|------|---------|
| `(app)` | `/inbound/*`, `/outbound/*`, `/inventory/*` 등 | 내부 어드민 | Sidebar |
| `(vendor)` | `/vendor/*` | 외부 벤더 | VendorSidebar |
| `(wms-shell)` | `/wms/*` | 창고 작업자 | WmsSidebar |
| `(auth)` | `/change-password` | 인증 | 없음 |
| `admin` | `/admin/*` | 내부 어드민 전용 | 서버 렌더링 |

---

## 4. 핵심 비즈니스 플로우

### 전체 흐름 (Document Flow)
```
PO(발주) → Packing List(벤더제출) → ASN(사전출하통지) → GR(입고확인) → Inventory
                                                                          ↓
                                              DN(출고지시) → Pick → Pack → Ship → Shipment
                                                                                    ↓
                                                                          SCM Shipment (Visibility)
                                                                          BL/ETD/ETA/Vessel 관리
```

### PO 생성 흐름
1. PO Header CSV 업로드 → `po_header` 생성
2. PO Line CSV 업로드 → `po_line` 생성
3. **PO Line 업로드 완료 시** 벤더에게 이메일 알림 발송 (Header 시점 아님!)
4. `po_header.po_created_notified_at`으로 중복 발송 방지

### Packing List → ASN 흐름
1. 벤더가 PO 선택 → CSV 업로드 → PL Draft 생성
2. CSV Preview 검증 (SKU/Qty/PO 비교) — **검증 없이 저장 금지**
3. PL Submit → Admin Review
4. PL Finalize(Confirm) → **ASN 자동 생성** (중복 생성 방지: asn_id 체크)
5. ASN에 `source_type: PACKING_LIST`, `source_id` 기록

### ASN 생성 경로 (이원화)
- **Vendor 경로:** PL Finalize → ASN 자동 생성 (source_type: PACKING_LIST)
- **WMS Manual 경로:** 직접 ASN 생성 (source_type: MANUAL)
- 두 경로 모두 동일한 ASN 구조, 생성 경로만 다름

### GR(입고) 흐름
- ASN 기반 GR 생성 (PO와 직접 연결 아님, 간접)
- WMS Key-in: line별 qty_received 입력 → Save(Draft) → Confirm
- Confirm 시: inventory 증가 + inventory_tx 기록
- GR Upload vs Confirm 분리: Upload = staging, Confirm = 재고 반영

### DN(출고) → Shipment 흐름
1. DN 생성 (Inventory 기반, PO와 독립)
2. Reserve → Pick → Pack → Ship
3. DN 기반 Shipment 생성
4. Pallet 생성 → Box Scan (Enter 기반 자동) → Pallet Close
5. SCM Shipment에서 BL/ETD/ETA/Vessel/Container 관리

### 상태 플로우

**Packing List:**
```
DRAFT → SUBMITTED → REVIEW → CONFIRMED → (ASN생성) → INBOUND_COMPLETED
                                       ↘ CANCELLED
```

**ASN:**
```
CREATED → GR_CREATED → PARTIAL_RECEIVED → FULL_RECEIVED
```

**GR:**
```
PENDING → CONFIRMED
```
- Confirm 시: inventory 증가 + inventory_tx 기록

**DN:**
```
OPEN → RESERVED → PICKED → PACKED → SHIPPED → CONFIRMED
```
- Reserve: reserved 증가 + ledger 기록
- Pick/Pack: 상태만 변경 (재고 변동 없음)
- Ship: onhand 감소 + reserved 감소 + ledger 기록

**Shipment:**
```
OPEN → PALLETIZING → SHIPPED(ATD입력) → ARRIVED(ATA입력) → CANCELLED
```
- Shipment 삭제 금지 — cancel만 허용 (물리 작업 이력 보존)
- 재작업은 같은 shipment에서 수행

---

## 5. 역할 및 인증

| 역할 | 접근 범위 |
|------|-----------|
| `ADMIN` | 모든 기능. PO/ASN/GR/DN 관리, 벤더 관리, PL 승인 |
| `VENDOR` | 자사 PL CRUD, PO 조회, PL 제출 |

- Supabase Auth 기반 세션 관리
- `user_profiles` 테이블: role, vendor_id, status
- `authz.ts` + `getAuthorizedVendorUser()`로 권한 체크
- vendor_id 기반 데이터 격리 필수
- Vendor Login redirect: `/vendor-login?next=/vendor/packing-lists/new?po_no=...`
  - 외부 URL 차단 (`startsWith("/")` validation)
  - `router.refresh() + push()` 적용

---

## 6. 데이터베이스 핵심 테이블

| 테이블 | 설명 | 핵심 관계 |
|--------|------|-----------|
| `po_header` / `po_line` | 발주서 | vendor_id 연결 |
| `packing_list` / `packing_list_line` | 패킹리스트 | po_no 기반, carton_no 포함 |
| `asn_header` / `asn_line` | ASN | source_type: MANUAL/PACKING_LIST, source_id |
| `gr_header` / `gr_line` | 입고확인서 | asn_id 기반 |
| `dn_header` / `dn_line` | 출고지시서 | inventory 기반 (PO 독립) |
| `dn_box` / `dn_box_item` | DN 박스 | WMS 실행용 |
| `shipment_header` | Shipment | DN 기반 생성 |
| `shipment_pallet` | 팔레트 | weight = box weight 합산 |
| `shipment_box` | 박스 | box_no 전역 unique |
| `inventory` | 재고현황 | qty_onhand, qty_reserved, allocated |
| `inventory_ledger` | 재고원장 | — |
| `inventory_tx` | 재고 트랜잭션 | ref_type, ref_id, sku, tx_type |
| `vendor` | 벤더 마스터 | — |
| `user_profiles` | 사용자 | role, vendor_id |

### 재고 구조
- `Available = OnHand - Reserved - Allocated`
- 모든 재고 변경은 `inventory_tx`를 통해서만 발생 (Single Source of Truth)
- `inventory`는 집계 결과 (캐시 개념)
- unique 제약: `(ref_type, ref_id, sku, tx_type)` — 중복 방지
- Ledger 최소화: 수량 변화 이벤트만 기록 (GR/DN_RESERVE/DN_SHIP)
- DN_PICK, DN_PACK은 ledger 제외 (상태만 변경)

### 데이터 기준 정의
- 단위 = `line_no + carton_no` (SKU는 식별자, 집계 기준 아님)
- SKU aggregation 제거 → line_no 기준 직접 매핑 (박스 단위 정확성)
- 모든 관계는 `vendor_id(UUID)` 기준 (vendor_code 아님)

### Source of Truth
- ASN = `asn_line`
- DN = `dn_box` / `dn_box_item`
- Inventory = `inventory_tx`

---

## 7. Supabase 클라이언트 구조

### ⚠️ 핵심 규칙 (과거 장애 원인)
1. **createServerClient 이름 충돌 금지** — import 함수명과 동일 이름 선언 → 빌드 에러
2. **순환참조 금지** — `api → lib → api` 구조 절대 금지
3. **API route는 독립 실행 단위** — 다른 route import 금지, 공통 로직은 lib로
4. **서버 클라이언트는 factory 함수** — `createSupabaseServerClient()` 매 요청마다 생성

### 파일 분리
```
lib/supabase/
├── client.ts    # 브라우저용 (createBrowserClient, @supabase/ssr 기반)
├── server.ts    # SSR용 (cookies 기반)
└── admin.ts     # Service Role (서버 전용, import 'server-only')
```

### 보안
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트 노출 금지
- `NEXT_PUBLIC_` 접두사 없는 변수는 서버에서만 접근
- `@supabase/auth-helpers-nextjs` 제거됨 → `@supabase/ssr` 기반으로 통일

---

## 8. Next.js App Router 주의사항

### ⚠️ 과거 장애 원인들
1. **Server/Client 컴포넌트 혼재 금지**
   - `page.tsx` = Server Component
   - `XXXClient.tsx` = Client Component (분리 필수)
   - `"use client"`와 `async` server function 충돌

2. **params 처리**
   - page.tsx에서 `const { id } = await params;` (Next.js 16 규칙)

3. **default export 중복 금지**
   - 하나의 파일에 default export 2개 → 빌드 에러

4. **API 응답 표준**
   - 통일 형식: `{ ok: true, data: { header, lines } }`
   - 에러 시 반드시 JSON 반환 (HTML 반환 → 프론트 JSON parse 실패 원인)
   - `Unexpected token '<'` 에러 = API가 HTML 에러 페이지 반환 중

5. **hydration 오류 방지**
   - 날짜 포맷은 서버-safe formatting 적용

6. **Vendor Login Suspense**
   - `useSearchParams()`는 Suspense 경계 내에서만 사용

---

## 9. WMS Console 상세

### ASN Key-in (입고 실행)
- `/wms/asn/[id]` = Execution(Key-in) 화면 (Detail/Monitor 아님!)
- API 응답: `{ ok: true, asn: { ..., lines: [] } }` (단일 객체)
- Save = GR Draft 저장만 (`/api/wms/asn/[id]/save`)
  - GR Header 재사용 (ASN당 1개, 기존 draft 있으면 재사용)
  - CONFIRMED 상태는 save 금지
  - ASN 상태 변경은 save에서 하지 않음 (confirm에서 처리)

### ⚠️ WMS 구조 주의 (과거 장애)
- Execution(Key-in) 코드와 Monitor/Detail 코드가 혼재되어 장애 발생 이력
- **page는 execution 기준**, API는 execution 응답 shape만 반환
- monitor API 응답(`header/summary/cartons`)과 execution 응답(`asn.lines`) 혼동 금지

### DN Execution
- Box 등록 → Confirm
- Partial shipment 허용 (현실 운영 반영)

### Shipment Execution
- DN 기반 Shipment 생성
- Pallet 생성 / Close / Cancel
- Box Scan: Enter 입력 시 자동 처리 (barcode gun 대응)
- Box → Pallet 적재
- Gross Weight = box weight 합산 (SKU별 분산 계산 제거)
- Box 번호 전역 unique — 중복 입력 시 에러
- DN은 active shipment에 1회만 포함 (중복 shipment 생성 방지)
- Shipment cancel 시에만 DN 재사용 가능

---

## 10. Monitor 구조

### 역할 정의
- Monitor = **운영 현황판** (작업 UI 아님)
- Document Flow View: PO → PL → ASN → GR → DN → Shipment 추적

### API 구조
- `/api/monitor` — PL/ASN/GR/DN 병렬 조회 (Promise.all)
- Summary (Open/Closed) 계산 + recent 리스트

### ⚠️ 핵심 설계 원칙
- **Status 필터는 서버가 아니라 UI에서** — API에서 status 제한하지 않고 전체 조회
- 이것이 과거 "Closed 데이터 안 보임" 버그의 원인이었음

### Vendor/Qty 표시
- vendor_id → vendor lookup (직접 name 갖고 있지 않음)
- Qty: `qty_ordered` 우선, 없으면 `qty` fallback, 없으면 `quantity` fallback

---

## 11. CSV 처리 패턴

### 공통 구조
- Route Handler (`/api/*/upload`)로 처리
- FormData 방식 파일 수신
- 벌크 작업: **미리보기(Preview) → 적용(Apply) 2단계**

### PO CSV 업로드
- 2단계: Header 먼저 → Line 나중
- Line 업로드 시 vendor 매핑 (vendor_code → vendor_id)
- **Line 업로드 완료 = PO 생성 완료** (이때 이메일 발송)

### Packing List CSV
- PO 기반 필수 (PO 선택 없이 생성 불가)
- Preview 검증 필수: SKU 존재/초과 체크, PO 불일치 = 에러
- carton_no / qty / ETA 포함

### GR CSV 업로드
- 포맷: asn_no, line_no, sku, qty_expected, qty_received
- **overwrite 방식** (기존 gr_lines 삭제 후 insert)
- Upload → insert → confirm_gr → qty_received 반영

### DN CSV 업로드
- Create Upload / Ship Upload 분리
- Bulk Confirm Shipped 지원

### CSV Export
- Header + Line flatten 구조
- UTF-8 BOM 포함
- Monitor: PL/ASN/GR/DN 타입별 통합 다운로드

---

## 12. 이메일 알림 (Resend)

### 구현 구조
- `src/lib/notify.ts` — 공통 메일 발송 로직
- `safeNotify` wrapper — fail-safe 처리 (이메일 실패해도 비즈니스 로직 중단 안 됨)
- **이메일은 비즈니스 로직 이후 실행:** DB write → 상태 변경 → 이메일 (non-blocking)

### 발송 이벤트

| 이벤트 | 수신자 | 트리거 시점 | 중복 방지 |
|--------|--------|------------|-----------|
| PO 생성 | 벤더 사용자 | PO **Line** 업로드 완료 시 | `po_created_notified_at` |
| PL 제출 | 내부 어드민 | PL Submit 시 | — |
| PL 기반 ASN 생성 | 내부 어드민 | PL Finalize 시 | — |

### 메일 링크 UX
- 링크: `/vendor-login?next=/vendor/packing-lists/new?po_no=...`
- 로그인 후 자동 redirect

> ⚠️ `TEST_MODE = true` 하드코딩 상태 — 모든 메일이 `MAIL_TO_TEST`로만 발송
> 프로덕션 시 반드시 false 변경 + DNS 인증 필요

---

## 13. 환경변수

| 변수 | 설명 | 주의 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | 클라이언트 노출 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 | 클라이언트 노출 OK |
| `SUPABASE_SERVICE_ROLE_KEY` | service role | **서버 전용** |
| `RESEND_API_KEY` | 이메일 API | 서버 전용 |
| `MAIL_FROM` | 발신자 | — |
| `MAIL_TO_TEST` | 테스트 수신자 | TEST_MODE용 |
| `MAIL_TO_INTERNAL` | 내부 어드민 | 쉼표 구분 |
| `APP_BASE_URL` | 앱 기본 URL | 이메일 링크용 |
| `TEST_VENDOR_CODE` | 테스트 벤더 코드 | 기본: VND-001 |

---

## 14. 알려진 이슈 및 기술 부채

### 데이터 정합성
- PO 라인에 `qty`와 `qty_ordered` 혼재 → `qty_ordered ?? qty` fallback
- ASN line에 `qty` vs `qty_expected` vs `qty_received` 컬럼 사용 기준 불명확
- 일부 GR은 gr_lines 없이 생성됨 (DB 정합성 문제)
- `dn_line` vs `dn_lines` 테이블명 혼재 가능성
- legacy 컬럼 잔존: `po_header.vendor` (vendor_id로 통일됨)
- `packing_list_line` 테이블명 오류 이력 있음

### 구조적 이슈
- ASN v2(`/inbound/asn-v2`)는 실험적 — 별도 API 사용
- API 응답 구조 혼재: `{ ok, data }` vs `{ gr, gr_lines }` vs `{ data }`
- 환경변수 validation 로직 없음
- 에러 핸들링 표준화 미완료 (raw error 노출 많음)
- logging/monitoring 구조 없음
- SCM DN shipped vs WMS DN shipped 정합성 불일치 가능
- WMS Console에서 Open ASN/DN → Monitor로 잘못 라우팅되는 이력
- DN confirm 중복 insert (unique constraint 에러) 완전 해결 필요

### 미구현 기능
- 반품/역물류 모듈
- 품질검수(QC) 단계
- 로케이션(Zone/Rack/Bin) 관리
- 감사 로그(Audit Trail)
- 웨이브 피킹
- GR/DN 지연 알림
- 재고 유형 세분화 (Available/QC Hold/Damaged 등)
- Shipment 상태 자동 전이 (ATD→SHIPPED, ATA→ARRIVED) 완전 자동화
- Vendor multi-tenancy 완전 구현
- PO status 자동 변경 (ASN→GR→RECEIVED)
- Scanner WMS (모바일 전용 실행 앱)
- Forwarder Portal / External API v1

---

## 15. 개발 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 프로덕션 빌드
npm run start      # 프로덕션 실행
npm run lint       # 린팅
```

---

## 16. 작업 시 지켜야 할 규칙

### 코드 구조
1. **main 브랜치 직접 수정 금지** — feature 브랜치에서 작업
2. **Server/Client 컴포넌트 분리** — page.tsx(서버) + XXXClient.tsx(클라이언트)
3. **API 응답 JSON 통일** — `{ ok: boolean, data: any }` 형식, HTML 반환 절대 금지
4. **API route는 독립 실행 단위** — 다른 route import 금지

### Supabase
5. **클라이언트 이름 충돌 주의** — 7번 섹션 참고
6. **순환참조 금지** — api → lib → api 절대 금지
7. **vendor_id 필터 필수** — 벤더 관련 쿼리에 반드시 적용

### 비즈니스 로직
8. **모든 재고 변경은 inventory_tx 경유** (Single Source of Truth)
9. **CSV 업로드는 2단계** — Preview → Apply
10. **이메일은 비즈니스 로직 이후** — DB write → 상태 변경 → 이메일
11. **Shipment 삭제 금지** — cancel만 허용

### 개발 습관
12. **코드 변경 전 빌드 확인** — `npm run build` 통과 필수
13. **통코드 교체 주의** — 구조 깨진 상태에서만 통코드, 정상 상태에서는 patch
14. **execution과 monitor 코드 혼재 금지** — WMS에서 특히 주의

---

## 17. 향후 확장 방향

### SaaS 전략
- "WMS SaaS" ❌ → "Cross-border 운영 SaaS" ✔️
- 일반 WMS 시장은 포화, 해외 운영 문제가 미해결 영역

### 배포 전략 (계획)
- Local → Dev → UAT → Pilot → Prod
- Vercel 배포 예정, env 설정 필요

### 3일 MVP 전략 원칙
- 완성도보다 흐름 우선
- 보안 최소화 (초기 MVP 기준)
- 문서 기반 개발로 전환 (대화 기반 → 스냅샷 기반)