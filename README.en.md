# Hairloom

[한국어 README](README.md)

Hairloom is a local-first hairstyle exploration and Design Lock application. It generates hairstyle alternatives from original customer photos while keeping generated images out of subsequent requests.

## Features

- Explore powered by the versioned 6,500-design v2 catalog
- Installable mobile PWA with camera capture and gallery selection
- AI hair analysis driven by the original customer photo and one freeform prompt
- 100 fixed result slots with up to 32 concurrent requests and no manual constraint stage
- Fast base Explore using only the original FRONT photo
- FRONT / SIDE / BACK Design Lock workflow
- Separate three-stage PRO workstation: `SOURCE → STRUCTURE → LOCK`
- Balanced optional source-view allocation, horizontal-mirror augmentation, and automatic hair/color profiles in PRO
- Maskless PRO requests that send one prepared original and rely on strict prompt preservation for face, clothing, and background
- Explore, PRO, and Design Lock default to natural low-sheen satin-to-matte texture with soft diffuse highlights
- Feminine designs use connected curves, nuanced face-framing, and fluid ends; masculine designs use directional planes, broader sections, and controlled temple/nape lines
- A versioned trend registry maps Instagram, Naver, Google, Pinterest, and stylist signals to stable catalog IDs with visible `RISING/WATCH` provenance
- Generated images are never reused as generation inputs

## Routes

```text
Explore:          http://127.0.0.1:4180/
PRO consultation: http://127.0.0.1:4180/consultation/
Health check:     http://127.0.0.1:4180/healthz
```

## Installation

Hairloom requires Node.js 20 or newer.

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm install
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

Open `http://127.0.0.1:4180/` in a browser.

### Install as a mobile app

- Android Chrome: use the install icon in the address bar or choose `Install app` from the menu.
- iPhone/iPad Safari: choose `Add to Home Screen` from the share menu.
- Installed mode keeps the Explore `/`, PRO `/consultation/`, and model manager `/model-previews/` routes.
- Only the public app shell is cached. Customer photos, AI analysis, Provider traffic, generated images, and API keys are never cached.

## Usage

### Explore

1. Capture a FRONT photo with the camera or select one from the gallery.
2. Describe the desired hair, color, and mood in a natural sentence.
3. AI analyzes current length, texture, density, color, and conservative feasibility defaults.
4. Review 100 results, select 1–6 candidates, and continue to Design Lock.

### PRO consultation

1. Capture or select the required FRONT photo and optionally add SIDE / BACK / CROWN / NAPE / DETAIL originals.
2. Enter the desired hair, color, and mood as a free prompt. There is no separate PROFILE or COLOR constraint screen.
3. AI analyzes the original photo. Treatment history that cannot be observed uses conservative defaults with explicit uncertainty.
4. In STRUCTURE, click an image to enlarge it and use the checkbox to select 1–6 designs directly.
5. From LOCK, hand off the selected design IDs and original source views to Design Lock.

Explore and PRO analysis and generation requests use only prepared original customer photos. Generated outputs and registered model photos never become analysis or generation inputs; only mirrored outputs are flipped back before the Provider result is displayed directly.

## Image provider configuration

Copy the local provider example:

```bash
cp imagen.web.example.js imagen.web.js
```

Configure the OpenAI-compatible endpoint, image model, analysis model, and API key in `imagen.web.js`. If vision analysis is unavailable, Hairloom continues with local color estimation and conservative defaults. The file is ignored by Git.

```js
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  analysisModel: 'gpt-4.1-mini',
  size: '1024x1024'
};
```

Never commit API keys, customer photos, generated customer images, or `.gjc/` QA artifacts.

## Loading model images

Open `http://127.0.0.1:4180/model-previews/` to register real model photos shown in Explore and PRO cards until generated results arrive. The manager is also linked from the Explore and PRO SOURCE surfaces.

- Register salon-owned files or rights-cleared HTTPS images; salon mode supports multi-file registration.
- Gender, length, texture, and optional stable `HLM-*` design IDs/prefixes deterministically match the closest registered model.
- Internet URLs are copied into local IndexedDB only when CORS permits. Registration strips metadata and normalizes each copy to a JPEG with a 1,400px maximum edge; the library is capped at 80 images and 160MB.
- Record the rights basis, attribution, confirmed model-image consent, and consent verification date, with optional expiry, rights-reference, and reviewer metadata. Expired, revoked, or disabled photos are automatically excluded.
- The manager supports editing, disable/re-enable, confirmed deletion, search/status filters, focal positioning, duplicate rejection, and storage status. Select the visible list to atomically apply design tags, activation state, or deletion across multiple records.
- Export or transfer the local library only through the passphrase-protected AES-GCM archive. Passphrases are never persisted.
- Add/update/delete/import changes propagate to open Explore and PRO tabs. Registry or IndexedDB failures fall back to customer source previews without blocking generation.
- Photos remain only in the current browser and are never uploaded to the server, Git, or trend data.
- Registered photos are `DISPLAY ONLY`: they appear only for `queued` or `active` slots, never enter provider requests, generation chains, normal exports, or Design Lock handoffs, and are replaced in the same fixed slot when provider output arrives.

See [`docs/MODEL-PREVIEW-FLOW.md`](./docs/MODEL-PREVIEW-FLOW.md) for the render-safe flow, data boundaries, rights operations, and intentionally retained limitations.

## Trend registry

Hairloom never uses external social images as generation inputs. The trend collector retains only style names, publication timestamps, public permalinks, sample counts, and momentum signals, then maps them to existing `HLM-C-*` structure IDs. The initial registry contains 40 stylist-reviewed baseline styles. Trend contributes at most a 0–3 Explore selection bonus and 5 PRO suitability points; feasibility and original-source lineage always win.

Verify or rebuild the deterministic local snapshot:

```bash
npm run trend:check
npm run trend
```

Run live collection only when Meta Hashtag Search or Naver DataLab credentials are available:

```bash
cp .env.example .env
# Fill only the provider credentials you use.
npm run trend:live
```

### Periodic updates on macOS

Preview the launchd configuration without changing files or system services:

```bash
npm run trend:schedule -- --dry-run --interval-hours=336
```

When `.env` contains one complete Meta or Naver credential pair, install the schedule at the default biweekly interval of 14 days (336 hours). Intervals are bounded to 1–336 hours.

```bash
npm run trend:schedule
npm run trend:schedule -- --interval-hours=168
```

Inspect status, run one update immediately, or remove the schedule:

```bash
npm run trend:schedule:status
npm run trend:update
npm run trend:schedule:remove
```

The launchd label is `com.hairloom.trend-update`. The plist never embeds credentials; the update command reads Hairloom's ignored `.env` at runtime. Logs go to ignored `.gjc/logs/hair-trends.log` and `.gjc/logs/hair-trends.error.log`. The manager refuses to overwrite or remove an unmanaged launch agent at the same path. Reinstall the schedule after changing the Node executable path.

### GitHub biweekly data pull requests

`.github/workflows/hair-trend-refresh.yml` starts every Monday at 00:30 UTC, then deterministically checks whether the date is on the 14-day cadence anchored at `2026-08-03`. A manual `workflow_dispatch` bypasses the date gate.

```bash
npm run trend:cadence
npm run trend:cadence -- --date=2026-08-17
```

Configure these GitHub Actions secrets for the repository. One complete Meta or Naver pair is sufficient.

```text
HAIRLOOM_META_ACCESS_TOKEN
HAIRLOOM_META_IG_USER_ID
HAIRLOOM_NAVER_CLIENT_ID
HAIRLOOM_NAVER_CLIENT_SECRET
```

Optionally configure the repository variable `HAIRLOOM_META_API_VERSION`. In the repository Actions settings, enable `Allow GitHub Actions to create and approve pull requests`. Without one complete provider pair, live collection fails visibly and creates no pull request.

After full verification, the biweekly workflow commits changes only from these two files on `automation/hair-trends` and creates or updates a pull request against the default branch:

```text
data/hair-trend-signals.json
src/hairTrendData.mjs
```

Any other tracked change or non-ignored untracked file fails the workflow. No data change means no commit and no pull request. Provider credentials and external images are never committed.

Import reviewed metadata batches from Google Trends, Pinterest Trends, Instagram Business Discovery, or editorial sources:

```bash
npm run trend -- --import=./local-trend-batch.json
```

Imports must use `metadata-only` rights. Image URLs, thumbnails, Base64, and image data URLs are rejected. `data/hair-trend-signals.json` is the source configuration and metadata ledger; `src/hairTrendData.mjs` is the deterministic browser-runtime snapshot.

Official integration references: [Meta Hashtag Search](https://developers.facebook.com/docs/instagram-api/guides/hashtag-search/), [Meta App Review](https://developers.facebook.com/docs/instagram-platform/app-review), [Naver DataLab](https://developers.naver.com/docs/serviceapi/datalab/search/search.md), [Google Trends](https://trends.google.com/trends/), and [Pinterest Trends](https://trends.pinterest.com/).

## Verification

```bash
npm run verify
```

Current baseline:

```text
91 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

## Main files

```text
index.html                         Explore and Design Lock UI
consultation/                      PRO consultation UI
model-previews/                      Local loading-model registration UI
src/exploreCore.mjs                Explore domain logic
src/consultationCore.mjs           Consultation, feasibility, and queue logic
src/hairAnalysis.mjs               Original-photo AI analysis, conservative fallback, and internal setting conversion
src/trendRegistry.mjs              Trend validation, scoring, and catalog mapping
src/hairTrendData.mjs              Generated 40-record runtime trend snapshot
src/modelPreviewRegistry.mjs        Rights validation, IndexedDB, and deterministic matching
scripts/generateHairMasterCatalog.mjs  6,500-design catalog generator
scripts/syncHairTrends.mjs         Local checks, imports, and optional live collection
scripts/manageHairTrendSchedule.mjs macOS periodic install, status, and removal
scripts/checkHairTrendCadence.mjs   Deterministic biweekly date gate
scripts/checkHairTrendChanges.mjs   Automated commit path allowlist guard
.github/workflows/hair-trend-refresh.yml Data-only automated commit and PR
docs/hair-design-master/           Runtime catalog and generated documentation
server.mjs                         Local-only static server
```

## Development principles

- Hairloom and BeautyTape are separate repositories.
- Base Explore uses only the original FRONT photo; PRO uses only source views supplied by the user.
- PRO does not create or send a hair mask, and non-current colors require no mask-confirmation step.
- Horizontal mirroring exists only at the provider boundary; final results return to the original orientation.
- PRO uses the provider result directly without source-pixel compositing.
- High-damage profiles exclude perm and extension designs.
- External social images are never stored, served, or used as generation inputs; only validated metadata signals are accepted.
- Customer photos, generated images, API keys, and QA artifacts never belong in the repository.
