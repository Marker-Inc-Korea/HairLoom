# E-BREAKDOWN — 살롱 상담용 구현 분해

## 1. 마일스톤

1. **M1 상담 디자인 확정**
   - Gate, Style Board, Color Board, Client Preview의 이미지 중심 구조와 토큰을 확정한다.
2. **M2 정적 상담 보드**
   - 로직 없이 살롱 화면을 태블릿/데스크톱 기준으로 빠르게 구현한다.
3. **M3 원본 데이터 연결**
   - 헤어 스타일/염색/저장/비교 데이터를 상담 UI에 연결한다.

## 2. 순서 제약

**M1이 끝나기 전에는 M3 작업을 시작하지 않는다.** 살롱 서비스의 핵심은 추천 로직이 아니라 손님이 한눈에 이해하는 큰 이미지/짧은 라벨/Before-After 비교다.

## 3. 작업 항목

| ID | 마일스톤 | 내용 | 선행 작업 | 완료 기준(검증 가능한 문장) |
| --- | --- | --- | --- | --- |
| M1-01 | M1 | 살롱 화면 원칙 확정 | 없음 | 손님용 화면에서 문장/점수/긴 설명을 숨기는 규칙이 문서화된다. |
| M1-02 | M1 | Style Board 카드 규격 확정 | M1-01 | 카드 최소 폭, 4:5 이미지 비율, 영문 1줄+한글 1줄 라벨 규칙이 확정된다. |
| M1-03 | M1 | Color Board 컬러 차트 구조 확정 | M1-01 | Black/Brown/Beige/Ash/Vivid 계열 탭과 대표 칩 크기가 정의된다. |
| M1-04 | M1 | Client Preview/Compare 구조 확정 | M1-02, M1-03 | Before/After 2분할과 A/B/C 비교 규칙이 확정된다. |
| M2-01 | M2 | Gate 정적 화면 작성 | M1 완료 | 큰 이미지 2개와 `CUT / COLOR / PREVIEW`만으로 진입 화면이 보인다. |
| M2-02 | M2 | Style Board 정적 화면 작성 | M2-01 | 헤어 샘플 카드가 큰 이미지와 짧은 이름으로 표시된다. |
| M2-03 | M2 | Color Board 정적 화면 작성 | M2-01 | 컬러 차트와 계열 탭이 색상환 없이 표시된다. |
| M2-04 | M2 | Client Preview 정적 화면 작성 | M2-02, M2-03 | Before/After와 선택 레시피 한 줄이 보인다. |
| M2-05 | M2 | Compare/Lookbook 정적 화면 작성 | M2-04 | A/B/C 비교와 룩북 카드가 표시된다. |
| M2-06 | M2 | 태블릿/데스크톱 시각 점검 | M2-01~M2-05 | 1024px 이상에서 카드와 비교 이미지가 작게 찌그러지지 않는다. |
| M3-01 | M3 | 헤어 데이터 adapter 작성 | M2 완료 | 헤어 스타일 20개가 Style Board 카드로 변환된다. |
| M3-02 | M3 | 염색 데이터 Color Board 연결 | M3-01 | 염색 계통별 칩이 Black/Brown/Beige/Ash/Vivid로 표시된다. |
| M3-03 | M3 | 사진 적용 flow 연결 | M3-02 | 선택한 스타일/컬러가 Preview summary에 반영된다. |
| M3-04 | M3 | Lookbook 저장 연결 | M3-03 | 생성 결과가 기존 `saved-edits/` 구조와 호환 저장된다. |
| M3-05 | M3 | A/B/C 비교 연결 | M3-04 | 저장 결과 2~3개를 Compare Board에 추가할 수 있다. |
| M3-06 | M3 | 회귀 검증 | M3-01~M3-05 | 기존 verify/test와 살롱 smoke 시나리오가 통과한다. |

## 4. 첫 커밋 후보 3개

1. **`docs: retarget hair derivative to salon consultation`**
   - A~E 문서를 살롱 상담용으로 수정한다.
2. **`feat: add static salon gate and style board`**
   - Gate + Style Board 정적 화면만 추가한다.
3. **`feat: add static color board and client preview`**
   - Color Board + Client Preview 정적 화면만 추가한다.

## 자기검증

이 작업 분해는 로직 연결 전에 살롱 손님이 이해할 수 있는 이미지 중심 상담 화면을 먼저 검증하도록 강제한다.
