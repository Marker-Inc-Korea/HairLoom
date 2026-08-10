# Hairloom

[English README](README.en.md)

Hairloom은 고객 원본 사진과 요청을 기반으로 헤어 디자인을 생성하는 앱입니다.

## 주요 기능

- Capacitor 기반 iOS·Android 단독 실행 앱과 카메라 촬영·갤러리 선택
- iOS Keychain·Android Keystore에만 저장되는 개인 이미지 API 연결
- 고객 원본 사진과 자유 입력 REQUEST 기반 로컬 헤어 프로필
- `SOURCE → RESULTS → LOCK` 흐름
- 재시작 뒤 이어지는 고정 100개 결과, 이미지 전체화면 확대, 1–6개 직접 선택
- 준비된 고객 원본만 Provider 입력으로 사용하는 원본 계보 유지

## 화면

```text
Hairloom:     http://127.0.0.1:4180/
상태 확인:    http://127.0.0.1:4180/healthz
```

## 설치

Node.js 20 이상이 필요합니다.

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm install
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

브라우저에서 `http://127.0.0.1:4180/`을 엽니다.

### 단독 실행 모바일 앱

웹 브라우저에는 API 키를 입력하거나 저장하지 않습니다. 실제 이미지 생성은 Capacitor 네이티브 앱에서 실행됩니다.

```bash
npm run mobile:prepare
npm run mobile:doctor
npm run mobile:sync
npm run mobile:open:ios      # Xcode 필요
npm run mobile:open:android  # Android Studio 또는 Gradle 사용
```

- iOS: Xcode와 CocoaPods가 필요합니다. 첫 실행에서 `이미지 생성 연결`을 누르면 키가 동기화되지 않는 기기 전용 Keychain 항목에 저장됩니다.
- Android: Java 21과 Android SDK 35가 필요합니다. 키는 Android Keystore AES-GCM으로 보호됩니다.
- 준비된 원본, 생성 결과, 100슬롯 저널은 앱 전용 비공개 저장소에 보관되며 백업·파일 공유에서 제외됩니다. 완료·취소된 고객 자료와 불투명 출력 핸들은 7일 뒤 시작 시 정리됩니다.
- iOS 장시간 생성은 앱을 앞에 둔 상태가 가장 안정적입니다. 중단된 슬롯은 같은 소유권으로 재시도 대기 상태가 되고 앱을 다시 열면 이어집니다.
- `모든 고객 데이터 삭제`는 준비 원본, 생성 결과, 배치·슬롯·이벤트 저널을 즉시 지우지만 Provider 키는 별도로 `연결 삭제`하기 전까지 유지합니다.
- 브라우저/PWA 공개 셸은 카탈로그와 흐름을 확인할 수 있지만 Provider 생성은 네이티브 앱에서만 활성화됩니다.

## 사용법

1. 카메라로 촬영하거나 갤러리에서 이미지를 선택합니다. `이미지 1`은 필수이고 `이미지 2–6`은 선택 사항입니다.
2. `REQUEST` 카드에서 헤어스타일·색상·시술 이력을 자유롭게 입력합니다.
3. 사진 선택 아래의 `NEXT`로 결과 생성을 시작하고 이미지를 눌러 전체화면으로 확대합니다.
4. 1–6개를 선택해 `LOCK`으로 전달합니다.

준비된 고객 원본은 네이티브 `/responses` 분석과 `/images/edits` 생성에만 사용됩니다. 분석이 일시적으로 실패하면 사진의 로컬 색상 샘플과 REQUEST로 만든 보수적 프로필을 사용하며, 생성 이미지는 분석이나 다음 생성 요청의 입력으로 재사용하지 않습니다.

## 이미지 Provider 설정

Hairloom 모바일 앱에서 `이미지 생성 연결`을 누르고 별도 결제가 설정된 개인 OpenAI Image API 키를 입력합니다. Provider 호스트는 네이티브 코드에서 `https://api.openai.com/v1`로 고정되고, 분석은 `gpt-4.1-mini`, 이미지 편집은 `gpt-image-2`를 사용합니다. API 키는 WebView JavaScript, `localStorage`, `sessionStorage`, 서비스 워커, 로그, 내보내기 파일에 전달되지 않습니다.

```bash
npm run mobile:doctor
npm run mobile:test
```

`imagen.web.js`와 브라우저 Bearer 요청은 더 이상 제공되지 않습니다. API 키, 고객 사진, 생성 고객 이미지, 네이티브 서명 자료, `.gjc/` QA 자료는 커밋하지 마세요.

## ChatGPT 구독 Provider TODO

ChatGPT Plus·Pro 구독과 OpenAI API 결제는 별개입니다. ChatGPT/Codex 구독 토큰은 일반 `/images/edits` API 키가 아니며 모바일 앱에 복사하지 않습니다.

- 공식 안내: [ChatGPT 구독과 API 결제는 별도](https://help.openai.com/en/articles/8156019)
- Codex는 지원되는 ChatGPT 플랜으로 로그인할 수 있습니다: [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540)
- 현재 모바일 MVP는 별도 결제되는 개인 이미지 API만 지원합니다.
- 향후 OpenAI가 공식 모바일 Codex/App Server SDK, 제3자 ChatGPT OAuth 이미지 생성, 또는 문서화된 구독 이미지 편집 API를 제공하면 동일한 네이티브 Provider 인터페이스에 `CodexSubscriptionProvider`를 추가할 수 있습니다.
- 그 작업은 공식 로그인, 준비된 참조 이미지 편집, 정확히 한 개의 출력, 취소, 사용 한도, 로그아웃, 토큰 비노출을 검증하는 별도 호환성·보안 게이트를 통과해야 합니다.
- ChatGPT 비밀번호, 세션 쿠키, 브라우저 토큰, `~/.codex/auth.json`, 비공개 God Tibo 인증 정보를 모바일 앱으로 가져오는 방식은 금지합니다.


## 트렌드 레지스트리

Hairloom은 외부 소셜 이미지를 생성 입력으로 사용하지 않습니다. 트렌드 수집기는 스타일명, 게시 시점, 공개 permalink, 표본 수와 상승 신호만 보관하고 이를 기존 `HLM-C-*` 디자인 ID에 연결합니다. 현재 40개 스타일의 스타일리스트 검수 기준선을 포함하며, 트렌드는 Explore에서 최대 3점, 공개 추천에서 최대 5점의 보조 신호만 사용합니다. 시술 가능성과 원본 계보가 항상 우선합니다.

로컬 기준선과 생성 레지스트리를 검사하거나 다시 생성합니다.

```bash
npm run trend:check
npm run trend
```

Meta Hashtag Search 또는 Naver DataLab 자격 증명이 있을 때만 라이브 수집을 실행합니다.

```bash
cp .env.example .env
# .env에 사용할 Provider 자격 증명만 입력
npm run trend:live
```

### macOS 주기 업데이트

스케줄이 만들 launchd 설정을 먼저 확인합니다. 이 명령은 파일이나 시스템 서비스를 변경하지 않습니다.

```bash
npm run trend:schedule -- --dry-run --interval-hours=336
```

`.env`에 완전한 Meta 또는 Naver 자격 증명 쌍이 있으면 기본 격주(14일, 336시간) 간격으로 설치합니다. 간격은 1–336시간 범위에서 변경할 수 있습니다.

```bash
npm run trend:schedule
npm run trend:schedule -- --interval-hours=168
```

상태 확인, 즉시 한 번 실행, 제거 명령은 다음과 같습니다.

```bash
npm run trend:schedule:status
npm run trend:update
npm run trend:schedule:remove
```

스케줄 label은 `com.hairloom.trend-update`입니다. launchd plist에는 API 키를 넣지 않고 Hairloom의 무시된 `.env`를 실행 시점에 읽습니다. 로그는 Git에서 제외되는 `.gjc/logs/hair-trends.log`와 `.gjc/logs/hair-trends.error.log`에 기록됩니다. 기존에 같은 경로를 사용하는 관리되지 않은 launch agent는 덮어쓰거나 삭제하지 않습니다. Node 실행 경로가 바뀌면 스케줄을 제거한 뒤 다시 설치합니다.

### GitHub 격주 데이터 PR

`.github/workflows/hair-trend-refresh.yml`은 매주 월요일 00:30 UTC(한국 시간 09:30)에 시작한 뒤 `2026-08-03`을 기준으로 14일 간격인지 결정적으로 검사합니다. `workflow_dispatch`로 수동 실행하면 날짜 게이트를 건너뜁니다.

```bash
npm run trend:cadence
npm run trend:cadence -- --date=2026-08-17
```

저장소에 다음 GitHub Actions secrets를 설정합니다. Meta 또는 Naver 중 한 쌍만 완전해도 실행할 수 있습니다.

```text
HAIRLOOM_META_ACCESS_TOKEN
HAIRLOOM_META_IG_USER_ID
HAIRLOOM_NAVER_CLIENT_ID
HAIRLOOM_NAVER_CLIENT_SECRET
```

선택적으로 repository variable `HAIRLOOM_META_API_VERSION`을 설정할 수 있습니다. Repository의 Actions 설정에서 `Allow GitHub Actions to create and approve pull requests`도 활성화해야 합니다. 완전한 provider 쌍이 없으면 라이브 수집 단계가 명시적으로 실패하고 PR을 만들지 않습니다.

격주 실행은 전체 검증을 통과한 경우에만 `automation/hair-trends` 브랜치에 다음 두 파일에서 발생한 변경만 커밋하고 기본 브랜치 대상으로 PR을 생성하거나 기존 PR을 갱신합니다.

```text
data/hair-trend-signals.json
src/hairTrendData.mjs
```

다른 tracked 파일이나 Git이 무시하지 않는 untracked 파일이 생기면 워크플로가 실패합니다. 트렌드 데이터가 변하지 않으면 커밋과 PR을 만들지 않습니다. API 키와 외부 이미지는 커밋 대상에 포함되지 않습니다.

Google Trends, Pinterest Trends, Instagram Business Discovery 또는 전문 매체에서 검수한 메타데이터 배치는 다음처럼 가져옵니다.

```bash
npm run trend -- --import=./local-trend-batch.json
```

가져오기 데이터는 `metadata-only` 권한이어야 하며 이미지 URL, 썸네일, Base64 또는 이미지 데이터 URL이 있으면 거부됩니다. `data/hair-trend-signals.json`은 수집 설정과 메타데이터 신호의 원본이고, `src/hairTrendData.mjs`는 결정적으로 생성되는 브라우저 런타임 스냅샷입니다.

공식 연동 자료: [Meta Hashtag Search](https://developers.facebook.com/docs/instagram-api/guides/hashtag-search/), [Meta App Review](https://developers.facebook.com/docs/instagram-platform/app-review), [Naver DataLab](https://developers.naver.com/docs/serviceapi/datalab/search/search.md), [Google Trends](https://trends.google.com/trends/), [Pinterest Trends](https://trends.pinterest.com/).

## 검증

```bash
npm run verify
```

현재 기준:

```text
92 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

## 주요 파일

```text
server.mjs                        `/` → Hairloom 연결 및 공개 자산 허용 목록
consultation/                     공개 Hairloom UI
explore/                          환경 변수로만 활성화되는 내부 Explore UI
src/exploreCore.mjs               카탈로그·큐 공통 도메인 로직
src/consultationCore.mjs          상담·시술 가능성·큐 로직
src/hairAnalysis.mjs              로컬 헤어 프로필·색상 요청 해석·내부 설정 변환
src/trendRegistry.mjs             트렌드 검증·점수·카탈로그 매핑
src/hairTrendData.mjs             생성된 40개 런타임 트렌드 스냅샷
src/modelPreviewRegistry.mjs      미래 작업으로 보류된 모델 라이브러리 모듈
scripts/generateHairMasterCatalog.mjs  6,500개 카탈로그 생성기
scripts/syncHairTrends.mjs         로컬 검사·가져오기·선택적 라이브 수집
scripts/manageHairTrendSchedule.mjs macOS 주기 실행 설치·상태·제거
scripts/checkHairTrendCadence.mjs   격주 실행 날짜 게이트
scripts/checkHairTrendChanges.mjs   자동 커밋 파일 허용 목록 검사
.github/workflows/hair-trend-refresh.yml 데이터 전용 자동 커밋·PR
docs/hair-design-master/           런타임 카탈로그와 생성 문서
server.mjs                         로컬 전용 정적 서버
```

## 개발 원칙

- Hairloom과 BeautyTape는 별도 저장소입니다.
- 내부 Explore의 레거시 브라우저 생성 경로는 비활성 상태이며 Provider 요청을 보내지 않습니다. 공개 Hairloom은 사용자가 제공한 준비 원본만 네이티브 생성 입력으로 사용합니다.
- 공개 화면은 헤어 마스크를 생성하거나 전송하지 않으며, 다른 색상도 별도 마스크 확인 없이 생성합니다.
- 좌우 반전은 Provider 입력에만 적용하고 결과는 원래 방향으로 복원합니다.
- 공개 결과에는 원본 픽셀 합성을 적용하지 않고 Provider 결과를 직접 사용합니다.
- 고손상 조건에서는 펌과 붙임머리를 제외합니다.
- 외부 소셜 이미지는 저장·서빙·생성 입력으로 사용하지 않고 검증된 메타데이터 신호만 사용합니다.
- 고객 사진, 생성 이미지, API 키와 QA 자료를 저장소에 포함하지 않습니다.
