# Hairloom

[한국어 README](README.md)

Hairloom is the public Hairloom PRO app for generating hairstyle designs from prepared customer originals and a freeform request.

## Features

- Installable mobile PWA with camera capture and gallery selection
- AI hair analysis from the prepared customer original and `REQUEST`
- Three-stage `SOURCE → STRUCTURE → LOCK` flow
- 100 fixed results, fullscreen image enlargement, and direct 1–6 selection
- Original-only Provider lineage; generated images are never request inputs

## Routes

```text
Hairloom PRO: http://127.0.0.1:4180/
Health check:  http://127.0.0.1:4180/healthz
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

Open `http://127.0.0.1:4180/` in a browser. The root redirects to PRO.

### Install as a mobile app

- Android Chrome: use the install icon in the address bar or choose `Install app` from the menu.
- iPhone/iPad Safari: choose `Add to Home Screen` from the share menu.
- The installed app contains Hairloom PRO only.
- Only the public shell is cached. Customer photos, AI analysis, Provider traffic, generated images, and API keys are never cached.

## Usage

1. Capture or select the required FRONT photo. SIDE / BACK / CROWN / NAPE / DETAIL are optional.
2. Enter the desired hair, color, and known treatment history in `REQUEST`.
3. Configure the URL, image model, analysis model, size, and API key under `API`.
4. Select `GENERATE 100`, then open any result as a fullscreen image.
5. Select 1–6 results and pass them to `LOCK`.

Analysis and generation use prepared customer originals only. Generated images are never reused as Provider inputs.

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
server.mjs                        `/` → PRO redirect and public asset allowlist
consultation/                     Public Hairloom PRO UI
explore/                          Internal Explore UI enabled only by environment flag
src/exploreCore.mjs               Shared catalog and queue domain logic
src/consultationCore.mjs          Consultation, feasibility, and queue logic
src/hairAnalysis.mjs              Original-photo AI analysis and internal conversion
src/trendRegistry.mjs             Trend validation, scoring, and catalog mapping
src/hairTrendData.mjs             Generated 40-record runtime trend snapshot
src/modelPreviewRegistry.mjs      Deferred future model-library module
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
