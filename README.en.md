# Hairloom

[한국어 README](README.md)

Hairloom is a local-first hairstyle exploration and Design Lock application. It generates hairstyle alternatives from original customer photos while keeping generated images out of subsequent requests.

## Features

- Explore powered by the versioned 6,500-design v2 catalog
- 100 fixed result slots with up to 32 concurrent requests
- Fast base Explore using only the original FRONT photo
- FRONT / SIDE / BACK Design Lock workflow
- Separate six-stage PRO workstation: `SOURCE → PROFILE → STRUCTURE → VARIATION → COMPARE → LOCK`
- Balanced optional source-view allocation, horizontal-mirror augmentation, and bounded natural colors in PRO
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

## Usage

### Explore

1. Upload an original FRONT photo.
2. Choose the six hair settings, including current length, thickness, and damage.
3. Compare 100 generated hairstyle results.
4. Select 1–6 design candidates and continue to Design Lock.

### PRO consultation

1. Add the required FRONT photo and optional SIDE / BACK / CROWN / NAPE / DETAIL photos.
2. In `PROFILE 1/2`, choose `short / medium / long`, natural texture, density, damage, and treatment history.
3. In `COLOR 2/2`, Hairloom automatically selects the current tone from conservative FRONT hair-region samples. Review the `AUTO` confidence, correct it manually when needed, and select one or more allowed natural target tones.
4. Start STRUCTURE generation with the current or selected natural tones without reviewing or confirming a hair mask.
5. STRUCTURE distributes its 100 stable slots approximately evenly across supplied views. Mirrored provider inputs are flipped back before display.
6. Refine the structure in VARIATION and COMPARE, then send 1–6 design IDs and original source views to Design Lock from LOCK.

Every PRO request uses one prepared original source photo. Generated outputs never become request inputs; only mirrored outputs are flipped back before the provider result is displayed directly.

## Image provider configuration

Copy the local provider example:

```bash
cp imagen.web.example.js imagen.web.js
```

Configure an OpenAI-compatible image API in `imagen.web.js`. The file is ignored by Git.

```js
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  size: '1024x1024'
};
```

Never commit API keys, customer photos, generated customer images, or `.gjc/` QA artifacts.

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
68 tests passing
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
src/exploreCore.mjs                Explore domain logic
src/consultationCore.mjs           Consultation, feasibility, and queue logic
src/trendRegistry.mjs              Trend validation, scoring, and catalog mapping
src/hairTrendData.mjs              Generated 40-record runtime trend snapshot
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
