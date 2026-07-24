# C-TOKENS — 살롱 상담용 미니멀 토큰

## 1. 계승 vs 신규 결정문

**결정: 원본 warm Atelier 토큰을 계승하되, 화면 장식은 더 줄이고 헤어 이미지·염색 칩이 주인공이 되도록 살롱 미니멀 alias를 추가한다.** 원본의 beige/ivory/cocoa/berry는 유지하지만, berry는 CTA/focus/selected에만 제한하고 컬러 표현은 실제 염색 스와치가 담당한다.

### PLAN.md §2-4 판단 기준별 근거

1. **(a) 원본과의 브랜드 연속성 가치**
   - warm Atelier는 살롱 조명과 상담 분위기에 잘 맞으므로 유지한다.
2. **(b) 헤어 살롱 무드에 warm blush/cocoa가 그대로 맞는가**
   - 맞지만 과하면 화장품 앱처럼 보인다. 배경은 ivory/cocoa로 조용하게 두고, 헤어 사진과 컬러 칩을 전면화한다.
3. **(c) 토큰 재사용 이득 vs 차별화 손실**
   - base token 재사용으로 유지보수 이득을 취하고, 차별화는 `--salon-*`, `--board-*`, `--swatch-*` alias에서 만든다.

## 1-1. 01-ui-polish-diagnosis REPORT 토큰/스와치 발견 사항 반영

- REPORT는 warm beige/ivory/muted rose/cocoa, berry primary, glass card, serif headline, sans body를 기준선으로 잡았다.
- REPORT의 문제점은 `:root` 밖 hardcoded 색/rgba 반복, 날짜별 override 누적, 모바일 샘플 카드 34~36px 압축, 한글 라벨 ellipsis, selected 상태 의미색 흔들림이다.
- 반영 결정:
  - hardcoded 색 대신 의미 alias 사용.
  - 샘플 카드는 최소 폭을 보장하고 2줄 한글 라벨을 허용.
  - selected는 `berry ring + rose fill + SELECTED/선택됨 라벨`로 통일.
  - 핫핑크/노랑은 주요 UI에서 배제하고 OSS/주의 점에만 제한.
  - glass/shadow는 hero와 selected/preview에만 약하게 사용한다.

## 2. 토큰 표

| 이름 | 값 | 용도 | 원본 대비 |
| --- | --- | --- | --- |
| `--bg` | `#f8f3ed` | 전체 배경 | 동일 |
| `--workspace` | `#f4ede6` | 살롱 보드 배경 | 동일 |
| `--chrome` | `#251d1c` | Gate 어두운 텍스트/헤더 | 동일 |
| `--panel` | `#fffdfb` | 카드/시안 표면 | 동일 |
| `--panel-strong` | `#f4ede6` | 보조 표면 | 동일 |
| `--text` | `#251d1c` | 본문/라벨 | 동일 |
| `--muted` | `#6d564e` | 보조 캡션 | 동일 |
| `--line` | `#e7d3c8` | 얇은 구분선 | 동일 |
| `--accent` | `#a45767` | 선택 ring, CTA, focus | 동일(사용 범위 축소) |
| `--accent-strong` | `#7e3f4e` | 작은 강조 텍스트 | 동일 |
| `--salon-ivory` | `#fffaf4` | Gate/Preview의 밝은 여백 | 신규 |
| `--salon-charcoal` | `#1f1817` | 프리미엄 살롱 텍스트 | 신규 |
| `--salon-cocoa` | `#6f4f40` | 헤어/브라운 보조 톤 | 신규 |
| `--salon-rose-fill` | `#f3e2df` | selected fill | 신규 |
| `--board-gap` | `24px` | 스타일/컬러 보드 카드 간격 | 신규 |
| `--board-card-min` | `180px` | 손님용 카드 최소 폭 | 신규 |
| `--board-card-ratio` | `4 / 5` | 헤어 이미지 카드 비율 | 신규 |
| `--swatch-size-sm` | `20px` | 보조 색칩 | 신규 |
| `--swatch-size-md` | `44px` | 컬러 보드 카드 색칩 | 신규 |
| `--swatch-size-lg` | `84px` | 대표 컬러 칩 | 신규 |
| `--selected-ring` | `0 0 0 3px rgba(164, 87, 103, 0.30)` | 선택 상태 비색상 신호 | 신규 |
| `--type-display` | `600 56px/0.98 var(--serif)` | Gate 대형 타이틀 | 신규 |
| `--type-card-title` | `650 18px/1.15 var(--sans)` | 스타일 카드 영문/한글 이름 | 신규 |
| `--type-caption` | `500 13px/1.35 var(--sans)` | 짧은 보조 캡션 | 신규 |
| `--space-xs/sm/md/lg/xl/xxl` | `4/10/18/28/48/80px` | 기본 spacing scale | 동일 |
| `--space-gutter` | `32px` | 태블릿/데스크톱 그리드 여백 | 동일 |
| `--rad-sm/md/lg/xl/full` | `8/14/22/32/9999px` | radius scale | 동일 |
| `--shadow` | `0 28px 80px rgba(91, 59, 48, 0.13)` | 기본 그림자 | 동일(사용 축소) |
| `--shadow-preview` | `0 30px 90px rgba(33, 24, 22, 0.16)` | Before/After 대표 프레임 | 신규 |
| `--glass-bg` | `rgba(255, 253, 251, 0.98)` | 상단 floating panel | 동일(제한 사용) |
| `--glass-border` | `rgba(231, 211, 200, 0.86)` | glass border | 동일 |
| `--glass-blur` | `blur(16px)` | floating blur | 동일 |
| `--banana` | `#f2c85f` | OSS/주의 점 | 폐기(주요 UI 사용 금지) |
| 핫핑크 radial stop | 미사용 | 주요 UI | 폐기 |

## 3. 한글 타이포

- **헤드라인 serif fallback:** `"Playfair Display", "Cormorant Garamond", "Instrument Serif", Georgia, "Times New Roman", serif`.
- **본문 sans fallback:** `Pretendard, SUIT, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`.
- **살롱 카드 라벨 정책:** 영문 1줄 + 한글 1줄까지 허용. 한글 스타일명은 ellipsis 금지, 최소 2줄 영역 확보.
- **손님용 화면 문장 길이:** 한 블록당 20자 내외. 상세 설명은 디자이너용 접힘 패널로 이동.
- **줄바꿈:** `word-break: keep-all; overflow-wrap: anywhere;`를 기본으로 하되 스타일명은 2줄 clamp.

## 4. WCAG AA 대비비 사전 계산

| 조합 | 대비비 | AA 판정 | 사용 결정 |
| --- | ---: | --- | --- |
| `--text #251d1c` on `--bg #f8f3ed` | 14.97 | 통과 | 본문 가능 |
| `--text` on `--panel #fffdfb` | 16.28 | 통과 | 본문/카드 제목 가능 |
| `--muted #6d564e` on `--bg` | 6.16 | 통과 | 보조 캡션 가능 |
| `--muted` on `--panel` | 6.69 | 통과 | 보조 캡션 가능 |
| `--accent #a45767` on `--bg` | 4.60 | 통과 | 작은 강조 텍스트 가능 |
| `--accent` on `--panel` | 5.00 | 통과 | CTA/선택 텍스트 가능 |
| `--accent` on `--workspace #f4ede6` | 4.38 | 실패 | 텍스트 금지, ring/그래픽만 |
| `--accent-strong #7e3f4e` on `--panel` | 7.64 | 통과 | 텍스트 가능 |
| `--salon-charcoal #1f1817` on `--bg` | 15.8 이상 | 통과 | Gate/카드 제목 가능 |
| `--salon-cocoa #6f4f40` on `--panel` | 7.22 | 통과 | 보조 텍스트 가능 |
| `--panel #fffdfb` text on `--chrome #251d1c` | 16.28 | 통과 | 어두운 hero 역상 텍스트 가능 |

## 자기검증

이 토큰 결정은 UI 색을 줄이고 헤어 이미지·컬러 칩을 주인공으로 만들어, 준오헤어식 미니멀 살롱 상담 화면에 맞춘다.
