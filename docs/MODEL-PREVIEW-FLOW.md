# 등록 모델 생성 대기 플로우와 운영 계약

기준일: 2026-08-03  
대상 브랜치: `ux/stylist-consultation`  
관리 화면: `http://127.0.0.1:4180/model-previews/`

이 문서는 Hairloom 등록 모델 라이브러리의 현재 구현을 설명한다. 렌더러에 따라 깨질 수 있는 Mermaid 대신 일반 텍스트 플로우차트를 사용한다.

## 1. 핵심 정의

등록 모델 사진은 AI 생성 결과가 도착하기 전 `queued` 또는 `active` 슬롯에만 표시하는 **브라우저 로컬 전시 자산**이다.

```text
등록 모델 사진
  → queued/active 카드 표시: 허용
  → 암호화 운영자 라이브러리 보관 파일: 허용
  → Provider 이미지 입력: 금지
  → 생성 결과 재입력: 금지
  → 캐시 키: 금지
  → 카탈로그·트렌드 데이터: 금지
  → 일반 Export·Design Lock handoff: 금지
```

실제 AI 요청은 기존 고객 원본 계약을 그대로 사용한다.

```text
Explore Provider 입력 = EX.preparedFrontBlob
PRO Provider 입력     = inputs.sourceBlob
```

등록 모듈 로딩이나 IndexedDB 조회가 실패해도 고객 원본 미리보기와 AI 생성은 계속 동작한다.

## 2. 전체 플로우

```text
[미용실 운영자]
        │
        ▼
/model-previews/
        │
        ├── 살롱 사진 파일 1장 또는 여러 장
        └── 자격 증명이 없는 HTTPS 이미지 URL 1개
        │
        ▼
성별 · 기장 · 질감
선택적 HLM 디자인 ID/접두어
        │
        ▼
권리 근거 · 출처/크레딧 · 모델 동의 확인일
선택적 만료일 · 권리 기록 번호 · 검토자
        │
        ▼
파일·URL·권리·이미지 디코딩 검증
        │
        ▼
메타데이터 제거 + 최대 변 1,400px JPEG 정규화
        │
        ▼
SHA-256 중복 검사
        │
        ▼
현재 브라우저 IndexedDB 저장
최대 80장 · 160MB
        │
        ├── 수정 / 사용 중지 / 재활성화 / 삭제
        ├── 검색 / 상태 필터 / 카드 초점
        ├── 선택 레코드 디자인 태그 / 상태 / 삭제 일괄 적용
        └── 암호화 보관 파일 내보내기·가져오기
        │
        ▼
BroadcastChannel + storage-event 변경 알림
        │
        ▼
열린 Explore / PRO가 목록과 object URL 갱신
        │
        ▼
100개 고정 슬롯
        │
        ├── queued → 등록 모델 · 생성 대기
        ├── active → 등록 모델 · 생성 중
        ├── ready/done → Provider 결과
        └── failed/aborted/superseded → 등록 모델 표시 안 함
```

## 3. 등록·수정 플로우

```text
/model-previews/
        │
        ▼
사진 출처 선택
        │
        ├── 살롱 파일
        │     ├── JPEG / PNG / WebP
        │     └── 중복·용량을 사전 검증한 원자적 다중 파일 등록
        │
        └── 인터넷 URL
              └── username/password가 없는 HTTPS + CORS 성공
        │
        ▼
표시 메타데이터
        ├── 이름
        ├── 성별
        ├── 기장
        ├── 질감
        ├── 선택적 HLM 디자인 ID/접두어 최대 20개
        └── 가로/세로 카드 초점
        │
        ▼
권리 메타데이터
        ├── 권리 근거
        ├── 출처·크레딧
        ├── 동의 확인일
        ├── 선택적 만료일
        ├── 선택적 권리 기록 번호
        └── 선택적 검토자
        │
        ▼
입력 검증
        ├── 개별 파일 최대 8MB
        ├── 가로·세로 최소 200px
        ├── 최대 변 8,192px
        ├── 이미지 디코딩 가능 여부
        └── HTTPS/CORS 응답 성공 여부 · 20초 제한
        │
        ▼
JPEG 품질 0.86 · 최대 변 1,400px 정규화
        │
        ▼
SHA-256 중복 거부
        │
        ▼
IndexedDB `hairloom-model-previews` 저장
```

등록 후에는 이미지와 메타데이터를 수정하고, 권리를 철회하거나 일시 중지하고, 만료일을 갱신하고, 삭제할 수 있다. 삭제에는 확인 단계가 있다. 현재 필터 목록을 선택하면 여러 레코드의 디자인 태그, 사용 상태, 삭제를 하나의 직렬화된 쓰기 작업으로 적용한다.

## 4. 권리 상태

```text
active
  → 매칭과 표시 허용

expired
  → rightsExpiresAt 경과
  → 자동 매칭 제외
  → 관리 화면에서 권리 갱신 필요

revoked
  → 사용 중지 시 revokedAt 기록
  → 자동 매칭 제외
  → 재활성화 가능

disabled
  → enabled=false
  → 자동 매칭 제외
```

관리 화면의 add/update/delete/import는 열린 같은 origin 탭에 전파된다. 삭제·철회 이벤트를 받은 Explore와 PRO는 기존 object URL을 revoke하고 현재 슬롯을 다시 렌더링한다. 생성 배치 자체는 재시작하거나 재정렬하지 않는다. BroadcastChannel을 사용할 수 없으면 storage event로 보완하며, 알림 채널 장애는 이미 완료된 IndexedDB 저장을 실패로 되돌리지 않는다. BFCache 이동은 기존 구독과 object URL을 유지한다.

## 5. 결정적 매칭

기본 매칭:

```text
성별 + 목표 기장 + 질감 버킷
```

선택적 정밀 매칭:

```text
designRefs
  → 전체 HLM 디자인 ID
  → 또는 하이픈 경계의 안정적 HLM ID 접두어
```

`designRefs`가 등록된 사진은 해당 ID 또는 접두어와 일치하는 후보에만 표시된다. 정확한 전체 ID가 접두어 매칭보다 높은 점수를 받고, 같은 점수는 디자인 ID·슬롯 번호·등록 모델 ID의 안정적 해시로 결정한다.

`designRefs`를 비워 두면 성별·기장·질감 기반 일반 모델로 사용된다.

## 6. Explore 플로우

```text
고객 FRONT 업로드
        │
        ▼
정확히 6개 Explore 조건 설정
        │
        ▼
100개 디자인 + 100개 고정 슬롯
        │
        ▼
등록 모델 목록 읽기
실패 시 고객 FRONT fallback
        │
        ▼
권리 상태 + 디자인 ID + 성별 + 기장 + 질감 매칭
        │
        ├── queued → 등록 모델 · 생성 대기
        ├── active → 등록 모델 · 생성 중
        └── 매칭 없음 → 고객 FRONT 미리보기
        │
        ▼
32개 생성 시작 / 68개 대기
        │
        ▼
고객 FRONT의 준비된 JPEG만 Provider 입력
        │
        ▼
결과 도착 순서와 무관하게 원래 slotIndex 교체
        │
        ▼
1~6개 선택 → Design Lock
```

## 7. PRO 플로우

```text
SOURCE
FRONT 필수 + 추가 원본 뷰 선택
        │
        ▼
PROFILE 1/2
        │
        ▼
COLOR 2/2
        │
        ▼
STRUCTURE 100개 고정 슬롯
        │
        ├── queued → 등록 모델 · 생성 대기
        ├── active → 등록 모델 · 생성 중
        └── 매칭 없음 → 고객 SOURCE 미리보기
        │
        ▼
Provider 결과의 동일 슬롯 교체
        │
        ▼
VARIATION
        │
        ▼
COMPARE
같은 등록 모델 정책과 실시간 철회 반영
        │
        ▼
LOCK
```

## 8. 상태별 표시 계약

| 슬롯 상태 | 표시 이미지 | 등록 모델 라벨 |
|---|---|---|
| `queued` | 등록 모델, 없으면 고객 원본 | `등록 모델 · 생성 대기` |
| `active` | 등록 모델, 없으면 고객 원본 | `등록 모델 · 생성 중` |
| `ready` / `done` | Provider 결과 | 없음 |
| `failed` | 실패 처리된 고객 원본 미리보기 | 없음 |
| `aborted` / `superseded` | 현재 배치에서 제거 | 없음 |

등록 모델 badge는 9px 이상이며 이미지 alt와 카드 aria-label에도 전체 상태를 제공한다. 카드 초점은 등록 메타데이터의 `focalX`·`focalY`로 적용한다.

## 9. 저장·전송 경계

```text
저장 위치             현재 브라우저 IndexedDB
서버 사진 업로드      없음
Git 사진 저장         없음
원격 hotlink 표시     없음
이미지 메타데이터     JPEG 재인코딩 과정에서 제거
개별 입력 제한        8MB
라이브러리 제한       80장 / 160MB
중복 기준             정규화 JPEG SHA-256
브라우저 용량 표시    navigator.storage.estimate()
영구 저장 요청        navigator.storage.persist()
기기 이동             암호화 로컬 보관 파일
```

보관 파일 계약:

```text
암호 최소 길이       10자
키 파생              PBKDF2-SHA-256
반복                 250,000
암호화               AES-GCM 256
salt                  16 bytes random
IV                    12 bytes random
평문 사진 바이트      envelope에 없음
암호 저장             없음
```

암호를 잃으면 보관 파일을 복구할 수 없다. 가져오기는 레코드 수·총 바이트·MIME·메타데이터·SHA-256을 다시 검증하고 중복 이미지를 건너뛴다.

## 10. 스키마와 마이그레이션

현재 메타데이터 스키마는 v2다. v1 레코드는 읽을 때 다음 보수적 기본값으로 마이그레이션된다.

```text
updatedAt            = createdAt
consentVerifiedAt    = createdAt
rightsExpiresAt      = 없음
rightsReference      = 없음
reviewedBy           = 없음
designRefs           = 없음
focalX / focalY      = 0.5 / 0.5
contentHash          = Blob에서 지연 계산
```

손상되거나 지원할 수 없는 한 개의 레코드는 전체 라이브러리를 막지 않고 개별 제외하며 관리 화면에 제외 개수를 경고한다. 쓰기 작업은 Web Locks를 사용하고, 지원하지 않는 환경에서는 모듈 내부 직렬 큐로 처리한다. 용량 조회, 영구 저장 요청, 변경 알림과 원격 URL 가져오기는 각각 격리되어 라이브러리 조회나 생성 흐름을 막지 않는다.

## 11. 자동 검증 계약

```text
메타데이터 v2 검증
v1 → v2 마이그레이션
만료·철회·비활성 자동 제외
HLM 디자인 ID/접두어 매칭
IndexedDB save → list → disable → enable → delete
손상 레코드 개별 격리
80장 / 160MB 제한과 quota 실패
원자적 다중 파일 등록
선택 레코드 태그 / 상태 / 삭제 원자적 적용
동시 쓰기 직렬화와 중복 경쟁 방지
SHA-256 중복 거부
AES-GCM 보관 파일 round-trip
잘못된 암호·변조 거부
same-origin 변경 알림과 채널 장애 격리
queued/active 전용 표시와 terminal 상태 거부
선택 모듈 fail-safe
Provider 원본 입력 불변
```

브라우저 QA는 관리 화면, Explore와 PRO의 100개 슬롯, 32 active / 68 queued, 실시간 삭제·철회, 카드 초점 전파, 데스크톱·태블릿·390px 모바일 overflow를 확인한다. 현재 검증 근거는 ignored 경로 `.gjc/qa/hairloom-pro/preview-hardening-browser-qa.json`과 같은 폴더의 원본 스크린샷에 보관한다.

## 12. 해결된 보완 항목

```text
[완료] 실패·중단 슬롯의 잘못된 생성 대기 라벨 제거
[완료] 삭제·철회 same-origin 실시간 전파
[완료] 권리 확인일·만료일·기록 번호·검토자
[완료] 수정·중지·재활성화·삭제 확인
[완료] 안정적 HLM 디자인 ID/접두어 정밀 매칭
[완료] 선택 모듈 실패 격리
[완료] 9px 이상 badge와 상태별 접근성 문구
[완료] 실제 IndexedDB lifecycle 테스트
[완료] SHA-256 중복 감지
[완료] 카드 초점 조정
[완료] 다중 파일 일괄 등록
[완료] 검색·상태 필터
[완료] 선택 레코드 디자인 태그·상태·삭제 일괄 관리
[완료] 저장공간 확인과 영구 저장 요청
[완료] 암호화 export/import 기기 이동
[완료] IndexedDB quota·동시 쓰기·알림 채널 장애 회귀 테스트
[완료] HTTPS 20초·이미지 디코딩 15초 제한과 저장 용량 API 장애 격리
[완료] BFCache 복귀 시 실시간 구독 유지
```

## 13. 의도적으로 남긴 제한

다음은 누락이 아니라 현재 로컬 우선·권리 안전 경계다.

```text
실시간 서버/클라우드 사진 동기화 없음
  → 인증·조직 권한·암호화·철회 감사 설계 없이 추가하지 않음
  → 현재는 암호화 로컬 보관 파일로 기기 이동

외부 소셜 이미지 자동 수집 없음
  → 트렌드 시스템은 메타데이터만 사용

등록 모델의 AI 자동 스타일 분류 없음
  → 운영자가 안정적 HLM ID/접두어를 명시

법적 동의의 진위 자동 판정 없음
  → 시스템은 운영자가 입력한 권리 기록과 만료/철회를 기술적으로 집행

브라우저 데이터 삭제 자체를 차단하지 않음
  → 영구 저장 요청과 암호화 보관 파일 제공
```

## English summary

Registered model photos are browser-local display assets used only for queued or active Explore/PRO slots. Schema v2 adds rights verification and expiry, revocation, stable HLM design references, focal positioning, SHA-256 duplicate detection, live same-origin change propagation, resilient optional loading, atomic multi-file registration, selected-record tag/status/delete operations, quota and concurrent-write handling, storage reporting, and passphrase-protected AES-GCM archive transfer. Provider requests still use customer originals only. Real-time cloud photo synchronization remains intentionally excluded until authentication, organizational authorization, encryption, and revocation auditing are designed.
