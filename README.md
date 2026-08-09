# Hairloom

[English README](README.en.md)

Hairloom은 고객 원본 사진과 요청을 기반으로 헤어 디자인을 생성하는 Hairloom PRO 앱입니다.

## 주요 기능

- 설치 가능한 모바일 PWA와 카메라 촬영·갤러리 선택
- 고객 원본 사진과 자유 입력 REQUEST 기반 AI 헤어 분석
- `SOURCE → STRUCTURE → LOCK` 3단계 흐름
- 고정 100개 결과, 이미지 전체화면 확대, 1–6개 직접 선택
- 준비된 고객 원본만 Provider 입력으로 사용하는 원본 계보 유지

## 화면

```text
Hairloom PRO: http://127.0.0.1:4180/
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

브라우저에서 `http://127.0.0.1:4180/`을 엽니다. 루트 주소는 PRO로 연결됩니다.

### 모바일 앱으로 설치

- Android Chrome: 주소창의 설치 아이콘 또는 메뉴의 `앱 설치`를 선택합니다.
- iPhone/iPad Safari: 공유 메뉴에서 `홈 화면에 추가`를 선택합니다.
- 설치 앱은 Hairloom PRO만 포함합니다.
- 오프라인 앱 셸만 캐시하며 고객 사진, AI 분석, Provider 요청·응답, 생성 이미지, API 키는 캐시하지 않습니다.

## 사용법

1. FRONT 사진을 촬영하거나 갤러리에서 선택합니다. SIDE / BACK / CROWN / NAPE / DETAIL은 선택 사항입니다.
2. `REQUEST`에 원하는 헤어와 색상, 알고 있는 시술 이력을 입력합니다.
3. `API`에 URL, 이미지 모델, 분석 모델, 크기, API 키를 설정합니다.
4. `GENERATE 100`으로 생성하고 이미지를 눌러 전체화면으로 확대합니다.
5. 1–6개를 선택해 `LOCK`으로 전달합니다.

분석과 생성에는 준비된 고객 원본 사진만 사용합니다. 생성 이미지는 다음 Provider 요청의 입력으로 재사용하지 않습니다.

## 이미지 Provider 설정

예제 설정을 로컬 설정 파일로 복사합니다.

```bash
cp imagen.web.example.js imagen.web.js
```

`imagen.web.js`에서 OpenAI 호환 API의 URL, 이미지 모델, 분석 모델, API 키를 설정합니다. 분석 API를 사용할 수 없으면 Hairloom은 로컬 색상 추정과 보수적인 기본값으로 계속 진행합니다. 이 파일은 Git에서 제외됩니다.

```js
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  analysisModel: 'gpt-4.1-mini',
  size: '1024x1024'
};
```

API 키, 고객 사진, 생성 고객 이미지, `.gjc/` QA 자료는 커밋하지 마세요.


## 트렌드 레지스트리

Hairloom은 외부 소셜 이미지를 생성 입력으로 사용하지 않습니다. 트렌드 수집기는 스타일명, 게시 시점, 공개 permalink, 표본 수와 상승 신호만 보관하고 이를 기존 `HLM-C-*` 구조 ID에 연결합니다. 현재 40개 스타일의 스타일리스트 검수 기준선을 포함하며, 트렌드는 Explore에서 최대 3점의 선택 보너스와 PRO 적합도에서 최대 5점만 차지합니다. 시술 가능성과 원본 계보가 항상 우선합니다.

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
91 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

## 주요 파일

```text
server.mjs                        `/` → PRO 연결 및 공개 자산 허용 목록
consultation/                     공개 Hairloom PRO UI
explore/                          환경 변수로만 활성화되는 내부 Explore UI
src/exploreCore.mjs               카탈로그·큐 공통 도메인 로직
src/consultationCore.mjs          상담·시술 가능성·큐 로직
src/hairAnalysis.mjs              원본 사진 AI 분석·보수적 폴백·내부 설정 변환
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
- 기본 Explore는 원본 FRONT만, PRO는 사용자가 제공한 원본 뷰만 생성 입력으로 사용합니다.
- PRO는 헤어 마스크를 생성하거나 전송하지 않으며, 다른 색상도 별도 마스크 확인 없이 생성합니다.
- 좌우 반전은 Provider 입력에만 적용하고 결과는 원래 방향으로 복원합니다.
- PRO 결과에는 원본 픽셀 합성을 적용하지 않고 Provider 결과를 직접 사용합니다.
- 고손상 조건에서는 펌과 붙임머리를 제외합니다.
- 외부 소셜 이미지는 저장·서빙·생성 입력으로 사용하지 않고 검증된 메타데이터 신호만 사용합니다.
- 고객 사진, 생성 이미지, API 키와 QA 자료를 저장소에 포함하지 않습니다.
