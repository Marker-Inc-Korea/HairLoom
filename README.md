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

## 검증

```bash
npm run verify
```

현재 기준:

```text
51 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-3
```

## 주요 파일

```text
index.html                         기본 Explore 및 Design Lock UI
consultation/                      PRO 상담 UI
src/exploreCore.mjs                Explore 도메인 로직
src/consultationCore.mjs           상담·시술 가능성·큐 로직
scripts/generateHairMasterCatalog.mjs  6,500개 카탈로그 생성기
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
- 고객 사진, 생성 이미지, API 키와 QA 자료를 저장소에 포함하지 않습니다.
