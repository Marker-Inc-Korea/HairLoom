# D-MODULES — 살롱 상담용 모듈 재사용/신규/폐기 판단

## V1/V3 확인 요약

- `src/modules.mjs:42-61`에 헤어 샘플 20종 경로가 있고 실제 파일도 `docs/assets/samples/*hair*` 기준 20개 존재한다.
- 원본 헤어 염색 데이터는 Black/Brown/Blonde/Ash/Vivid 상담용 컬러 차트로 재분류 가능하다.
- `src/colorTheory.mjs`, `src/paletteVariants.mjs`는 색상 보조 태그 계산에 재사용하되, 손님용 메인 UI에는 상세 수치를 노출하지 않는다.
- `src/editHistory.mjs`, `src/imageComparison.mjs`는 Lookbook/Compare Board에 재사용한다.
- `LICENSE`는 MIT, `OSS_REUSE.md`는 외부 upstream code/assets copied none 정책을 명시한다.

## 1. 원본 파일 경로 기준 3분류 표

| 분류 | 원본 경로 | 판단 근거 |
| --- | --- | --- |
| 재사용(수정 후) | `src/modules.mjs` | 헤어 스타일/염색 데이터는 유지하되 4모듈 앱 구조가 아니라 Style Board/Color Board 데이터 adapter로 변환한다. |
| 재사용(수정 후) | `docs/assets/samples/hair-*-only.jpg` | 살롱 스타일 보드의 핵심 이미지 자산. 카드 최소 폭과 4:5 비율로 크게 보여준다. |
| 재사용(수정 후) | `src/colorTheory.mjs` | 웜/쿨/밝기 태그의 내부 계산에만 사용. 색상환 메인 UI는 만들지 않는다. |
| 재사용(수정 후) | `src/paletteVariants.mjs` | 컬러 차트의 tone variation 칩에 사용. |
| 재사용(수정 후) | `src/editHistory.mjs` | Lookbook 저장/목록/파일 stream에 사용. |
| 재사용(수정 후) | `src/imageComparison.mjs` | A/B/C Compare Board 후보 정렬/선택에 사용하되 점수 UI는 숨긴다. |
| 재사용(수정 후) | `styles.css` | base token은 계승하고 salon/board/swatch alias를 추가한다. |
| 재사용(그대로) | `LICENSE` | MIT 출처 표기를 유지한다. |
| 재사용(그대로) | `OSS_REUSE.md` | 외부 자산 복사 금지와 출처 경계를 유지한다. |
| 신규 | `salonGateView` | 준오헤어식 큰 이미지 진입 화면. |
| 신규 | `styleBoardView` | CUT 중심 스타일 카탈로그. |
| 신규 | `colorBoardView` | 색상환 대신 살롱 컬러 차트. |
| 신규 | `clientPreviewView` | Before/After 고객 시안. |
| 신규 | `compareBoardView` | A/B/C 후보 비교. |
| 신규 | `lookbookView` | 저장 결과를 상담 룩북으로 재구성. |
| 폐기 | 원본 4모듈 홈 셸 | 살롱 손님에게 눈썹/립렌즈/톤 카드가 보이면 초점이 흐려진다. |
| 폐기 | 눈썹/립렌즈/퍼스널컬러 UI 연결 | 헤어 살롱 상담용 범위 밖이다. |
| 폐기 | 추천 점수 중심 winner/runner-up UI | 상담에서는 A/B/C 선택이 더 자연스럽다. |
| 폐기 | 긴 설명/진단 문구 | 손님용 화면에서는 이미지와 짧은 이름이 우선이다. |
| 폐기 | 색상환 메인 화면 | 살롱 컬러 차트보다 직관성이 낮다. 내부 보조 정보로만 유지. |

## 2. MIT 출처 표기 방법

앱 정보/OSS 섹션에 “Derived from BeautyTape, Copyright (c) 2026 BeautyTape contributors, MIT License”를 표기하고, 재사용 범위(`src/modules.mjs` 헤어 데이터, `docs/assets/samples/hair-*`, 색/저장/비교 모듈)를 함께 적는다.

## 3. 저장 포맷(`saved-edits/`) 호환 결정

**호환 유지.** 기존 hairstyle JSON/PNG 구조를 읽고, 새 Lookbook은 `moduleId: "hairstyle"`와 새 `moduleId: "hair"`를 모두 허용한다. 새 저장도 이미지 파일 + JSON summary 구조를 유지한다.

## 자기검증

이 모듈 결정은 원본의 실재 헤어 자산은 살리고, 4모듈 앱 구조와 긴 설명 UI를 제거해 살롱 상담용 비주얼 보드에 맞춘다.
