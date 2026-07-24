# 사용자군별 브랜치 전략

## 권장 방식

사용자군별 영구 포크를 만들지 않는다. 영구 브랜치가 늘어나면 DESIGN LOCK, API, 보안, 생성 실패 처리 수정이 각 브랜치에서 달라진다.

브랜치는 UX 가설 검증용으로 만들고, 검증된 기능은 `main`에 합친 뒤 제품 프로필 설정으로 분기한다.

```text
main
├── ux/client-self-serve
├── ux/stylist-consultation
├── ux/salon-operations
├── ux/enterprise-governance
├── ux/enterprise-commerce
├── ux/academy-learning
├── ux/studio-production
└── ux/care-consultation
```

## 1차 추천 브랜치

### `ux/stylist-consultation`

가장 먼저 진행한다.

- 전문 필터
- 고객 상담 카드
- 3각 결과 승인
- 길이·컬 굵기 명세
- 시술 메모
- 후보 비교

### `ux/client-self-serve`

동시에 작은 범위로 실험한다.

- 질문 3~5개
- 후보 3개
- 전문 용어 숨김
- 공유·예약 CTA
- 즉시 삭제와 개인정보 안내

## 2차 브랜치

- `ux/salon-operations`: 고객 기록·직원·예약·통계
- `ux/enterprise-governance`: 브랜드 카탈로그·권한·비용 한도
- `ux/enterprise-commerce`: 스타일-상품 매핑·캠페인 전환

## 3차 브랜치

- `ux/academy-learning`
- `ux/studio-production`
- `ux/care-consultation`

## 병합 규칙

`main`에 합칠 기능:

- 디자인 검색 엔진
- DESIGN LOCK
- 이미지 생성 상태 관리
- 개인정보 삭제
- 비용·쿼터
- 결과 비교
- 저장 포맷

프로필별로만 유지할 기능:

- 화면 문구
- 기본 후보 수
- 필터 복잡도
- 내보내기 템플릿
- 권한과 승인 단계
- 성공 지표

## 브랜치 시작점

현재 공통 기준점:

```text
main
v0.1.0  # 최초 DESIGN LOCK 기준 태그
```

최신 공통 코어에서 실험 브랜치를 만들고, UX 결과를 확인한 뒤 main으로 병합한다.
