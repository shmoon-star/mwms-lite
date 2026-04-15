# Google Sheets 연동 설정 가이드

## 🎯 목표
수출내역 Google Sheets를 매일 KST 09:00에 자동으로 Supabase DB에 동기화

## 📋 1단계 — Google Cloud Console 설정

### 1-1. 프로젝트 생성 (최초 1회)
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 상단 프로젝트 선택 → **새 프로젝트 만들기**
3. 프로젝트명: `mwms-lite-sheets` (원하는 이름)
4. 생성 후 해당 프로젝트 선택

### 1-2. Google Sheets API 활성화
1. 좌측 메뉴 → **API 및 서비스** → **라이브러리**
2. "Google Sheets API" 검색 → 선택 → **사용 설정**

### 1-3. Service Account 생성
1. 좌측 메뉴 → **API 및 서비스** → **사용자 인증 정보**
2. 상단 **+ 사용자 인증 정보 만들기** → **서비스 계정**
3. 입력:
   - 서비스 계정 이름: `mwms-lite-sync`
   - 서비스 계정 ID: `mwms-lite-sync` (자동 생성)
4. **만들고 계속하기** → 역할 선택 스킵 → **완료**

### 1-4. JSON Key 생성
1. 방금 만든 서비스 계정 클릭
2. **키** 탭 → **키 추가** → **새 키 만들기**
3. 키 유형: **JSON** 선택 → **만들기**
4. JSON 파일이 다운로드됨 (예: `mwms-lite-sheets-abc123.json`)
5. ⚠️ **이 파일은 절대 Git에 올리지 말 것**

### 1-5. Service Account 이메일 확인
JSON 파일 안에서 `"client_email"` 값 확인
```json
{
  "client_email": "mwms-lite-sync@mwms-lite-sheets.iam.gserviceaccount.com",
  ...
}
```
이 이메일을 복사해 둠

---

## 📋 2단계 — Google Sheets 공유 설정

1. 수출내역 Google Sheets 열기
2. 우측 상단 **공유** 버튼 클릭
3. 이메일 입력란에 위에서 복사한 **Service Account 이메일** 붙여넣기
4. 권한: **뷰어** 선택
5. **알림 보내기 해제** → 공유

> ℹ️ Service Account는 실제 사용자가 아니므로 알림 불필요

---

## 📋 3단계 — Sheet ID 확인

Google Sheets URL에서 ID 복사:
```
https://docs.google.com/spreadsheets/d/[이 부분이 Sheet ID]/edit
```

예시:
```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
                                      ↑
                              이 문자열이 Sheet ID
```

---

## 📋 4단계 — Vercel 환경변수 설정

Vercel Dashboard → 프로젝트 → **Settings** → **Environment Variables**

### 필수 환경변수 3개 추가:

#### 1. `GOOGLE_SHEETS_CREDENTIALS`
- Value: **JSON 파일 전체 내용**을 한 줄로 복사 (그대로 붙여넣기)
```json
{"type":"service_account","project_id":"...","private_key":"-----BEGIN...","client_email":"...",...}
```

#### 2. `EXPORT_LEDGER_SHEET_ID`
- Value: 3단계에서 확인한 Sheet ID
- 예: `1AbCdEfGhIjKlMnOpQrStUvWxYz`

#### 3. `EXPORT_LEDGER_SHEET_NAME` (선택)
- Value: `수출내역_Raw` (기본값)

#### 4. `SYNC_SECRET` (수동 sync용)
- Value: 아무 랜덤 문자열 (예: `openssl rand -hex 32` 결과)
- 대시보드에서 "Sync Now" 버튼 눌렀을 때 인증용

#### 5. `CRON_SECRET` (Vercel Cron 인증용)
- Value: 아무 랜덤 문자열
- Vercel Cron 자동 호출 인증용 (선택 — Vercel Cron은 `x-vercel-cron` 헤더로 자동 인증됨)

### 적용 범위
- Production / Preview / Development 모두 체크

---

## 📋 5단계 — Supabase SQL 실행

Supabase SQL Editor에서 아래 파일 내용 실행:
```
supabase/migrations/history_export_raw.sql
```

테이블 2개가 생성됩니다:
- `history_export_raw` — 수출 원장 데이터
- `history_sync_log` — Sync 이력

---

## 📋 6단계 — 배포 및 테스트

### 6-1. 배포
```bash
git add .
git commit -m "feat: Google Sheets 수출 원장 연동"
git push origin master
```
Vercel이 자동 배포

### 6-2. 수동 Sync 테스트
1. 배포 완료 후 브라우저에서 접속: `https://mwms-lite.vercel.app/monitor/export-dashboard`
2. 우측 상단 **🔄 Sync Now** 버튼 클릭
3. `SYNC_SECRET` 값 입력
4. 성공 시 알림:
   ```
   Sync 완료
   - 읽음: 3196
   - UPSERT: 3196
   - Skip(locked): 0
   ```

### 6-3. 자동 Cron 확인
- Vercel Dashboard → 프로젝트 → **Cron Jobs** 메뉴
- `/api/cron/sync-export-ledger` 등록되어 있어야 함
- 매일 UTC 00:00 (KST 09:00) 자동 실행

---

## 📋 7단계 — 25FW 데이터 Lock 처리

최초 Sync 후, 25FW 데이터를 잠금 처리:

```bash
curl -X POST "https://mwms-lite.vercel.app/api/cron/sync-export-ledger?lock=25fw&secret=YOUR_SYNC_SECRET"
```

또는 Supabase SQL Editor에서 직접:
```sql
UPDATE history_export_raw SET is_locked = true WHERE order_season = '25fw';
```

Lock 후에는 Google Sheets에서 해당 row를 지워도 DB에 유지됩니다.

---

## 🔧 트러블슈팅

### "GOOGLE_SHEETS_CREDENTIALS 환경변수가 설정되지 않았습니다"
→ Vercel 환경변수 확인. JSON이 올바른 형식인지 검증 ([JSON 검증 사이트](https://jsonlint.com/))

### "The caller does not have permission"
→ Service Account 이메일이 Google Sheets에 **뷰어 이상 권한**으로 공유되었는지 확인

### "Unable to parse range"
→ `EXPORT_LEDGER_SHEET_NAME` 값이 실제 시트명과 정확히 일치하는지 확인 (공백/대소문자 주의)

### Sync 로그에 에러가 쌓이는 경우
→ 대시보드 하단 **최근 Sync 이력** 테이블에서 에러 메시지 확인

---

## 📌 운영 체크리스트

- [ ] Google Cloud 프로젝트 생성
- [ ] Sheets API 활성화
- [ ] Service Account 생성 + JSON 키 다운로드
- [ ] Google Sheets를 Service Account 이메일에 공유
- [ ] Vercel 환경변수 4개 등록
- [ ] Supabase 테이블 생성 SQL 실행
- [ ] Git push → Vercel 배포
- [ ] 수동 Sync 테스트
- [ ] 25FW Lock 처리
- [ ] Vercel Cron Jobs 등록 확인

---

**MWMS-Lite Export Dashboard — Powered by Google Sheets API + Vercel Cron**
