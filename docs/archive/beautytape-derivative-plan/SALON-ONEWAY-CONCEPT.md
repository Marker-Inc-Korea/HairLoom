# SALON-ONEWAY-CONCEPT — 원웨이 헤어 디자인북 설계

## 1. 방향 전환

기존 `Gate / Style Board / Color Board / Preview / Compare / Lookbook`처럼 사용자가 여러 보드를 돌아다니는 구조는 살롱 상담용으로도 복잡하다. 핵심 경로는 더 단순해야 한다.

```text
사진 입력
  → 알고리즘 기반 헤어 레퍼런스 자동 적용
  → 헤어디자인 디자인북 시각화
```

사용자는 스타일을 직접 오래 고르는 사람이 아니라, **자기 사진 기반으로 제안된 디자인북을 넘겨보는 손님**이다. 디자이너는 필요한 경우 후보를 조정하지만, 손님용 화면은 거의 읽을 것이 없어야 한다.

## 2. 최종 사용자 경로

### Step 1. 사진 입력

목적: 상담 시작에 필요한 얼굴/상반신 사진을 받는다.

손님에게 보이는 것:

```text
[큰 사진 업로드 영역]

사진을 넣으면
헤어 디자인북을 만들어드릴게요
```

필요한 디테일:

- 업로드 방식
  - 드래그 앤 드롭
  - 파일 선택
  - 태블릿/PC 카메라 촬영은 후순위
- 입력 가이드
  - 정면 또는 45도
  - 얼굴과 머리 라인이 보이는 사진
  - 모자/강한 필터 피하기
- 화면 텍스트는 1~2문장 이하
- 업로드 후 원본 사진은 로컬 세션에만 유지
- 실패 시에도 긴 오류 대신 짧게 안내
  - `사진을 다시 넣어주세요`
  - `얼굴/머리 라인이 잘 보이지 않아요`

### Step 2. 알고리즘 기반 레퍼런스 적용

목적: 사용자가 스타일을 고르기 전에 시스템이 후보를 만든다.

시스템이 하는 일:

1. 사진에서 상담용 특징을 추출한다.
   - 얼굴 방향
   - 머리 길이 추정
   - 얼굴형/윤곽의 대략적 인상
   - 밝기/피부 톤 주변 대비
   - 기존 헤어 컬러의 어두움/밝음
2. 원본 헤어 레퍼런스에서 후보를 고른다.
   - 길이 후보: short / medium / long
   - 무드 후보: soft / trendy / chic / clean
   - 성별 레퍼런스: women / men / unisex
   - 컬러 후보: black / brown / beige / ash / vivid
3. 후보 조합을 만든다.
   - 컷 후보 3개
   - 컬러 후보 3개
   - 조합 후보 6~9개
4. 너무 과한 후보를 제거한다.
   - 얼굴/원본 사진 대비와 너무 동떨어진 컬러
   - 길이 변화가 지나치게 큰 후보
   - 같은 느낌이 반복되는 후보
5. 디자인북용 대표 후보 3~5개를 만든다.

손님에게 보이는 것:

```text
디자인북을 만드는 중
```

또는 텍스트 없이 얇은 진행 애니메이션만.

표시하지 말 것:

- 점수
- 알고리즘 설명
- 얼굴형 진단명
- 퍼스널컬러 진단명
- `AI`, `API`, `prompt`, `model` 같은 기술어

### Step 3. 헤어디자인 디자인북 시각화

목적: 결과를 앱 화면이 아니라 **살롱 디자인북**처럼 보여준다.

기본 구조:

```text
┌──────────────────────────────┐
│ 01                           │
│ [큰 시안 이미지]              │
│                              │
│ Airy Layer / Ash Brown        │
└──────────────────────────────┘

┌──────────────────────────────┐
│ 02                           │
│ [큰 시안 이미지]              │
│                              │
│ Soft Bob / Cacao Brown        │
└──────────────────────────────┘

┌──────────────────────────────┐
│ 03                           │
│ [큰 시안 이미지]              │
│                              │
│ Medium Wave / Rose Brown      │
└──────────────────────────────┘
```

텍스트 원칙:

- 후보 번호
- 스타일명
- 컬러명
- 최대 한 줄 메모만 허용

예:

```text
01
Airy Layer / Ash Brown
부드러운 얼굴선
```

또는 더 미니멀하게:

```text
01
Airy Layer · Ash Brown
```

## 3. 디자인북에 필요한 디테일

### 3-1. 디자인북 페이지 타입

디자인북은 여러 화면이 아니라 한 흐름 안의 페이지 묶음이다.

| 페이지 | 역할 | 표시 요소 |
| --- | --- | --- |
| Cover | 상담 결과 첫 인상 | 손님 사진 기반 대표 시안 1장, `Hair Design Book` |
| Look 01 | 안전한 변화 | 자연스러운 컷/컬러 후보 |
| Look 02 | 이미지 변화 | 분위기 변화가 큰 후보 |
| Look 03 | 컬러 제안 | 염색 중심 후보 |
| Compare | 3개 후보 나란히 | 01/02/03 이미지와 이름 |
| Save | 저장/공유용 요약 | 선택 후보, 날짜, 로컬 저장 버튼 |

단, UI에서는 탭처럼 보이지 않게 한다. 사용자는 그냥 아래로 넘기거나 좌우로 넘긴다.

### 3-2. 후보 생성 기준

후보는 무작위가 아니라 상담 의도가 달라야 한다.

| 후보 | 의도 | 예시 |
| --- | --- | --- |
| Look 01 | 안전한 변화 | 현재 길이를 크게 바꾸지 않는 레이어/브라운 |
| Look 02 | 실루엣 변화 | 단발, 허쉬컷, 커튼뱅, 쉼표머리 등 형태 변화 |
| Look 03 | 컬러 변화 | 애쉬, 카카오, 로즈 브라운, 베이지 등 컬러 중심 |
| Look 04 optional | 과감한 제안 | 비비드/블루/라벤더 등 디자이너 추천 |
| Look 05 optional | 남성/유니섹스 대안 | 투블럭, 콤마, 아이비리그 등 |

### 3-3. 화면 내 정보량

각 디자인북 페이지의 정보량은 아래를 넘지 않는다.

```text
번호: 01
이미지: 1장
스타일명: 1개
컬러명: 1개
메모: 0~1줄
액션: 저장 / 다시 만들기 / 선택
```

설명은 손님용 화면에 쓰지 않고 디자이너용 side drawer에 둔다.

디자이너용 drawer에만 허용:

- 왜 이 후보가 나왔는지
- 원본 대비 변화량
- 관리 난이도
- 컬러 유지 난이도
- 시술 상담 메모

### 3-4. 비주얼 톤

- 흰색/아이보리 배경
- 검정/차콜 타이틀
- 카드 경계 최소화
- 그림자 약하게
- 버튼은 작게
- 이미지가 화면의 80% 이상 차지
- 컬러칩은 보조 요소로 작게
- 브랜드 사이트처럼 고요하게

## 4. 시스템 구현 구조

## 4-1. 데이터 흐름

```text
Uploaded Photo
  → Photo Session
  → Image Feature Extraction
  → Reference Matching
  → Candidate Recipe Generation
  → Image Edit / Preview Generation
  → Design Book Renderer
  → Local Save
```

### 1. Photo Session

역할:

- 업로드 사진을 세션에 저장
- 원본 파일명/크기/type 확인
- 화면에는 원본 썸네일만 표시
- 저장 전까지 영구 저장하지 않음

필요 데이터:

```js
photoSession = {
  id,
  originalName,
  objectUrl,
  width,
  height,
  createdAt
}
```

### 2. Image Feature Extraction

역할:

- 추천에 필요한 최소 특징만 추출
- 전문 진단명으로 표현하지 않음

가능한 feature:

```js
photoFeatures = {
  faceVisibility: 'clear' | 'partial' | 'unclear',
  headAngle: 'front' | 'threeQuarter' | 'side' | 'unknown',
  currentHairLength: 'short' | 'medium' | 'long' | 'unknown',
  currentHairTone: 'dark' | 'brown' | 'light' | 'unknown',
  contrast: 'low' | 'medium' | 'high',
  imageBrightness: 'dark' | 'normal' | 'bright'
}
```

초기 구현에서는 실제 CV가 없어도 된다. 업로드 후 사용자가 2~3개의 짧은 칩으로 보정할 수 있다.

```text
현재 길이: Short / Medium / Long
원하는 변화: Natural / Change / Bold
컬러 관심: Dark / Brown / Ash / Vivid
```

단, 이 칩도 디자인북 생성 전 1회만 보이고, 메인 경험은 원웨이다.

### 3. Reference Matching

원본 재사용:

- `src/modules.mjs`의 헤어 스타일 20종
- `hairDyeOptions`
- `hairDyeItems`
- `docs/assets/samples/hair-*-only.jpg`

매칭 기준:

```js
referenceMatch = {
  styleId,
  dyeId,
  intent: 'safe' | 'shape-change' | 'color-change' | 'bold',
  label,
  koreanLabel,
  previewAsset,
  dyeColors
}
```

### 4. Candidate Recipe Generation

후보는 `look` 단위로 만든다.

```js
lookRecipe = {
  id: 'look-01',
  index: 1,
  intent: 'safe',
  style: {
    id: 'airy-layered',
    label: 'Airy Layer',
    ko: '에어리 레이어드'
  },
  color: {
    id: 'ash-brown',
    label: 'Ash Brown',
    ko: '애쉬 브라운',
    swatches: ['#5f5148', '#6f6258', '#a18a74', '#c1b3a2']
  },
  oneLine: '부드러운 얼굴선',
  editGuide: '손님용 화면에는 숨김. 이미지 생성/디자이너 메모에만 사용.'
}
```

### 5. Image Edit / Preview Generation

초기 단계:

- 실제 이미지 생성 전에는 원본 hair sample asset으로 디자인북 layout만 구성한다.
- 이후 `photoTape` 흐름에 연결해 사용자 사진 기반 After 이미지를 생성한다.

생성 요청에는 다음만 넣는다.

```js
imageEditInput = {
  sourcePhoto,
  styleGuide,
  dyeGuide,
  preserveIdentity: true,
  preserveFaceShape: true,
  outputMood: 'premium salon consultation preview'
}
```

### 6. Design Book Renderer

역할:

- lookRecipe 배열을 디자인북 페이지로 렌더링
- 화면에는 최소 텍스트만 노출
- 디자이너용 drawer는 별도

```js
book = {
  id,
  photoSessionId,
  createdAt,
  looks: [lookRecipe],
  selectedLookId: null
}
```

### 7. Local Save

기존 `saved-edits/` 호환:

```js
savedBook = {
  id,
  moduleId: 'hairstyle' | 'hair-design-book',
  type: 'design-book',
  createdAt,
  sourcePhotoName,
  looks,
  selectedLookId,
  imageFilenames,
  summary
}
```

## 5. UI 상태 설계

### Empty

```text
[사진 입력]
사진을 넣으면 헤어 디자인북을 만들어드릴게요
```

### Ready

```text
[사진 썸네일]
[디자인북 만들기]
```

선택 보정 칩은 최대 3줄:

```text
길이  Short / Medium / Long
변화  Natural / Change / Bold
컬러  Dark / Brown / Ash / Vivid
```

### Generating

```text
디자인북을 만드는 중
```

텍스트 하나만.

### Complete

디자인북 렌더링.

```text
01
[큰 이미지]
Airy Layer · Ash Brown
```

### Error

```text
사진을 다시 넣어주세요
```

또는

```text
시안을 만들지 못했어요
```

상세 오류는 개발자 콘솔/디자이너 drawer에만.

## 6. 프롬프트 재정의

```text
Design a one-way premium Korean hair salon consultation flow.
The user journey is: upload client photo → automatically generate algorithm-based hair references → present a visual hair design book.

The interface should not feel like a dashboard or style picker. It should feel like a luxury salon lookbook generated for one client.

Almost no text. The image should occupy most of the screen.
Each result page contains only: look number, large hairstyle preview, style name, color name, optional one-line mood.

Use warm ivory, charcoal, soft cocoa, subtle berry only for selected state.
No tabs, no dense filters, no score, no diagnostics, no long explanation.

Required flow:
1. Photo input screen with one large drop zone and one short sentence.
2. Generating screen with minimal progress state.
3. Hair Design Book with 3 to 5 large visual look pages.
4. Final compare page showing 3 looks side by side.
5. Local save action.

Target environment: salon tablet or desktop consultation screen.
Mood: premium Korean hair salon, editorial lookbook, calm, visual, high-end, minimal.
```

## 7. 다음 구현에서 제일 먼저 필요한 것

1. `photoSession` 상태 모델
2. `lookRecipe` 데이터 모델
3. 원본 `modules.mjs` 헤어/염색 데이터를 `safe / shape-change / color-change / bold` 후보로 분류하는 adapter
4. 디자인북 renderer
5. 저장 포맷 확장

## 8. 결론

화면을 많이 만들 필요가 없다. 사용자가 해야 할 일은 사진을 넣는 것뿐이고, 시스템이 헤어 디자인북을 만든다. 손님이 보는 것은 옵션 UI가 아니라 완성된 시안집이어야 한다.
