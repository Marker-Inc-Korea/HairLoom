# SALON-PROMPTS — 헤어 살롱 상담 UI 프롬프트

## 목표

미용실 손님에게 헤어 스타일을 직관적으로 보여주는 **고급 살롱 상담용 웹 UI**를 만든다. 설명문은 거의 없고, 큰 헤어 이미지·컬러칩·Before/After·A/B/C 후보 비교가 중심이다.

## 메인 디자인 프롬프트

```text
Create a premium Korean hair salon consultation web interface inspired by high-end salon brand websites such as Juno Hair, but do not copy any exact layout, logo, images, or brand assets.

The product is a local in-salon consultation board used by hair designers to show clients haircut, perm, dye color, before/after preview, and A/B/C hairstyle options.

Design direction:
- Minimal editorial luxury salon website
- Very little text, mostly large visual cards
- Quiet warm ivory / beige / cocoa / charcoal palette
- Hair images and dye color swatches are the main visual focus
- No busy dashboard feeling
- No app-like recommendation clutter
- No long explanations, no score-heavy UI
- Use generous whitespace and strong image hierarchy
- Premium but approachable Korean salon mood

Required screens in one coherent design system:
1. Gate screen: large split hero images, short labels CUT / COLOR / PREVIEW, almost no paragraph text
2. Style Board: large hair style cards for women and men, each card has only image + English style name + Korean name
3. Color Board: salon color chart style, large dye swatches grouped by Black, Brown, Beige, Ash, Vivid
4. Client Preview: large Before / After comparison, selected recipe shown as one short line
5. Compare Board: A / B / C hairstyle candidates shown equally, no ranking score
6. Lookbook: saved consultation looks as clean image cards

Typography:
- Elegant serif display title for large hero words only
- Clean Korean sans-serif for labels
- Korean labels must be readable and not truncated
- Card text max two lines

Interaction feel:
- Designer can tap a style or color while consulting a client
- Selected state should be visible with a subtle berry ring and small SELECTED label
- Client-facing area must feel calm and visual, not technical

Layout:
- Prioritize tablet and desktop salon consultation screens
- Use big cards, minimum card width around 180px
- Use 4:5 or portrait image ratio for hairstyle cards
- Before/After should be large and centered

Avoid:
- Do not use generic SaaS dashboard UI
- Do not use neon colors, hot pink gradients, childish beauty app visuals
- Do not use dense forms or long diagnostic questionnaires
- Do not show technical words like AI model, token, API, prompt
- Do not make it look like e-commerce checkout or booking software
```

## 짧은 버전

```text
Premium Korean hair salon consultation web UI, Juno Hair-like minimal luxury mood without copying. Very little text. Large haircut images, salon dye color chart, big Before/After preview, A/B/C hairstyle comparison. Warm ivory, beige, cocoa, charcoal, subtle berry selected ring. Designer uses it on tablet/desktop to show clients styles visually. No dashboard clutter, no long explanations, no scores, no neon, no technical AI words.
```

## 시안 생성용 화면별 프롬프트

### 1. Gate

```text
Design a minimal premium hair salon gate screen for an in-salon consultation board. Split hero with two large hair visual panels, one women style and one men style. Only short labels: HAIR DESIGN, CUT, COLOR, PREVIEW. Warm ivory background, charcoal text, editorial whitespace, luxury Korean salon mood, almost no paragraph text.
```

### 2. Style Board

```text
Design a salon hairstyle selection board. Large portrait hairstyle cards in a clean grid, each card shows one hair sample image, English style name, Korean style name. Filters are short pills: Women, Men, Short, Medium, Long. Minimal text, generous spacing, selected card has subtle berry ring and SELECTED label. No long descriptions.
```

### 3. Color Board

```text
Design a hair dye color chart for salon consultation. Large dye swatch cards grouped by Black, Brown, Beige, Ash, Vivid. Each swatch card has color gradient/chip, short color name like Ash Brown, Cacao, Rose Brown, Copper, and tiny warm/cool tag. No color wheel as primary UI. Looks like premium salon color chart, not a dashboard.
```

### 4. Client Preview

```text
Design a large client before/after hairstyle preview screen for a salon tablet. Two equal large panels: BEFORE and AFTER. Under it, one short recipe line: Airy Layer · Ash Brown · Soft Wave. Buttons are minimal: Other Style, Add to Compare, Save. Image-first, calm premium salon feel, no scores or long explanation.
```

### 5. Compare Board

```text
Design an A/B/C hairstyle comparison board for a hair salon consultation. Three equal candidate cards labeled A, B, C with large hairstyle images and short style names. No ranking, no score, no analytics. Client chooses visually. Warm ivory background, premium minimal card design.
```

### 6. Lookbook

```text
Design a saved salon consultation lookbook. Clean grid of saved hairstyle preview cards, each with image, style name, date or short color tag. Filters: Today, Cut, Color, Client. Looks like a premium salon portfolio, not a file manager.
```

## 네거티브 프롬프트

```text
Avoid: busy SaaS dashboard, dense controls, long text blocks, medical diagnosis UI, beauty game UI, neon pink, purple gradients, yellow callout boxes, ecommerce checkout, reservation calendar, social feed, low-end mobile app, tiny thumbnails, unreadable Korean ellipsis, technical AI labels, score ranking, cluttered tabs.
```

## 핵심 판단 문장

이 방향은 “앱을 설명하는 화면”이 아니라 “살롱 손님에게 스타일을 보여주는 화면”이다. 텍스트는 결정을 보조하고, 이미지는 결정을 만든다.
