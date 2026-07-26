# Hairloom

[English README](README.en.md)

Hairloom은 원본 인물 사진을 유지하면서 다양한 헤어 디자인을 탐색하고, 선택한 스타일을 정면·측면·후면 사진에 적용하는 로컬 우선 헤어 디자인 도구입니다.

## 주요 기능

- 6,500개 헤어 디자인 카탈로그 기반 Explore
- 고정 100개 결과 슬롯과 최대 동시 요청 32개
- 원본 FRONT 사진만 사용하는 결과 생성
- FRONT / SIDE / BACK 기반 Design Lock
- 미용 전문가용 상담 화면
- 헤어 외 얼굴·피부·의상·배경 원본 픽셀 보호
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
2. PROFILE에서 길이, 모질, 밀도, 손상도와 시술 이력을 설정합니다.
3. STRUCTURE에서 100개 구조를 비교합니다.
4. VARIATION과 COMPARE에서 세부 스타일을 선택합니다.
5. LOCK에서 선택 결과를 Design Lock으로 전달합니다.

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
45 tests passing
1,080-design taxonomy check passing
6,500-design master catalog check passing
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
- 원본 사진만 이미지 생성 입력으로 사용합니다.
- 헤어 외 영역은 원본 픽셀로 복원합니다.
- 고손상 조건에서는 펌과 붙임머리를 제외합니다.
- 고객 사진과 인증 정보는 저장소에 포함하지 않습니다.
