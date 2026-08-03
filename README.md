# Hairloom

[English README](README.en.md)

Hairloom은 원본 인물 사진을 유지하면서 다양한 헤어 디자인을 탐색하고, 선택한 스타일을 정면·측면·후면 사진에 적용하는 로컬 우선 헤어 디자인 도구입니다.

## 주요 기능

- 6,500개 v2 헤어 디자인 카탈로그 기반 Explore
- 고정 100개 결과 슬롯과 최대 동시 요청 32개
- 기본 Explore는 원본 FRONT 사진만 사용하는 빠른 탐색
- FRONT / SIDE / BACK 기반 Design Lock
- 별도 PRO 워크스테이션의 6단계 흐름: `SOURCE → PROFILE → STRUCTURE → VARIATION → COMPARE → LOCK`
- PRO의 선택 원본 뷰 균형 배분, 좌우 반전 증강, 자연색 범위 선택
- PRO는 헤어 마스크 없이 준비된 원본 한 장을 Provider에 전달하고 얼굴·의상·배경 보존을 프롬프트로 제어
- Explore, PRO, Design Lock 모두 자연스러운 저광택 새틴-매트 질감과 부드러운 분산 하이라이트를 기본으로 사용
- 여성 디자인은 연결된 곡선·부드러운 페이스 프레임·유연한 끝선을, 남성 디자인은 방향성 있는 면·넓은 모발 섹션·절제된 템플과 네이프 라인을 별도 계약으로 사용
- 버전된 트렌드 레지스트리가 Instagram·Naver·Google·Pinterest·전문가 신호를 안정된 카탈로그 ID에 연결하고 `RISING/WATCH` 근거를 표시
- 생성 이미지를 다음 생성 입력으로 재사용하지 않는 원본 계보 유지

## 화면

```text
기본 Explore: http://127.0.0.1:4180/
PRO 상담:     http://127.0.0.1:4180/consultation/
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

## 사용법

### Explore

1. FRONT 원본 사진을 업로드합니다.
2. 현재 길이, 모발 굵기, 손상도 등 6개 설정을 선택합니다.
3. 100개 헤어 결과에서 후보를 비교합니다.
4. 1–6개 디자인을 선택해 Design Lock으로 이동합니다.

### PRO 상담

1. FRONT 사진을 필수로 넣고 SIDE / BACK / CROWN / NAPE / DETAIL 사진을 선택적으로 추가합니다.
2. `PROFILE 1/2`에서 `짧은 머리 / 중간 / 장발`, 모질, 밀도, 손상도와 시술 이력을 설정합니다.
3. `COLOR 2/2`에서 FRONT 원본의 보수적인 헤어 영역 샘플로 현재 색상을 자동 선택합니다. `AUTO` 신뢰도를 확인하고 필요하면 직접 수정한 뒤, 허용된 자연 색상을 복수 선택합니다.
4. 헤어 마스크 확인 없이 현재 색상 또는 선택한 자연색으로 바로 STRUCTURE 생성을 시작합니다.
5. STRUCTURE의 100개 슬롯은 입력한 원본 뷰를 균형 있게 섞고, 좌우 반전 증강 결과는 원래 방향으로 되돌려 표시합니다.
6. VARIATION과 COMPARE에서 세부 스타일을 선택한 뒤 LOCK에서 1–6개 디자인과 원본 뷰를 Design Lock으로 전달합니다.

PRO 요청은 항상 준비된 원본 사진 한 장만 사용합니다. 생성 결과는 다음 요청의 입력이 되지 않으며, 좌우 반전 입력의 결과만 원래 방향으로 복원한 뒤 Provider 결과를 직접 표시합니다.

## 이미지 Provider 설정

예제 설정을 로컬 설정 파일로 복사합니다.

```bash
cp imagen.web.example.js imagen.web.js
```

`imagen.web.js`에서 OpenAI 호환 이미지 API의 URL, 모델, API 키를 설정합니다. 이 파일은 Git에서 제외됩니다.

```js
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  size: '1024x1024'
};
```

API 키, 고객 사진, 생성 고객 이미지, `.gjc/` QA 자료는 커밋하지 마세요.

## 생성 대기 모델 이미지

`http://127.0.0.1:4180/model-previews/`에서 AI 생성 결과가 도착하기 전 Explore와 PRO의 대기 카드에 표시할 실제 모델 사진을 등록할 수 있습니다. 기본 화면의 연결 설정과 PRO `PROFILE 1/2`에서도 관리 화면을 열 수 있습니다.

- 살롱 촬영 파일 또는 사용 권리가 확인된 HTTPS 이미지를 등록하며, 살롱 파일은 여러 장을 한 번에 추가할 수 있습니다.
- 성별, 기장, 질감과 선택적 `HLM-*` 디자인 ID·접두어로 후보에 가장 가까운 등록 모델을 결정적으로 선택합니다.
- 인터넷 URL은 브라우저가 CORS로 가져올 수 있을 때만 로컬 IndexedDB에 복사합니다. 등록 시 메타데이터를 제거한 최대 변 1,400px JPEG로 정규화하며 라이브러리는 최대 80장·160MB로 제한됩니다.
- 권리 근거, 출처·크레딧, 모델 초상 사용 동의, 동의 확인일을 기록하고 선택적으로 만료일·권리 기록 번호·검토자를 관리합니다. 만료·철회·비활성 사진은 자동으로 대기 카드에서 제외됩니다.
- 관리 화면은 수정, 사용 중지·재활성화, 삭제 확인, 검색·상태 필터, 카드 초점, 중복 감지, 저장 공간 확인을 지원합니다. 현재 목록을 선택해 디자인 태그, 사용 상태, 삭제를 여러 레코드에 원자적으로 적용할 수 있습니다.
- 라이브러리는 10자 이상 암호의 AES-GCM 보관 파일로 내보내고 다른 Hairloom 브라우저로 가져올 수 있습니다. 암호는 저장되지 않습니다.
- 등록·수정·삭제·가져오기 변경은 열린 Explore와 PRO 탭에 즉시 반영되며, 등록 모듈이나 IndexedDB가 실패해도 고객 원본 미리보기와 AI 생성은 계속 작동합니다.
- 등록 사진은 현재 브라우저에만 저장되며 서버, Git, 트렌드 데이터에 업로드되지 않습니다.
- 등록 사진은 `DISPLAY ONLY`입니다. `queued`·`active` 슬롯에만 표시되고 Provider 입력, 생성 재입력, 일반 Export, Design Lock handoff에는 포함되지 않으며 실제 생성 결과가 도착하면 같은 고정 슬롯에서 교체됩니다.

상세 상태 흐름, 데이터 경계, 권리 운영과 의도적으로 남긴 제한은 [`docs/MODEL-PREVIEW-FLOW.md`](./docs/MODEL-PREVIEW-FLOW.md)를 참고하세요.

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
83 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

## 주요 파일

```text
index.html                         기본 Explore 및 Design Lock UI
consultation/                      PRO 상담 UI
model-previews/                      대기 모델 사진 로컬 등록 UI
src/exploreCore.mjs                Explore 도메인 로직
src/consultationCore.mjs           상담·시술 가능성·큐 로직
src/trendRegistry.mjs              트렌드 검증·점수·카탈로그 매핑
src/hairTrendData.mjs              생성된 40개 런타임 트렌드 스냅샷
src/modelPreviewRegistry.mjs        권리 검증·IndexedDB·결정적 모델 매칭
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
