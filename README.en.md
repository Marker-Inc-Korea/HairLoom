# Hairloom

[한국어 README](README.md)

Hairloom is the public app for generating hairstyle designs from prepared customer originals and a freeform request.

## Features

- Standalone Capacitor iOS and Android apps with camera capture and gallery selection
- Personal image API credentials stored only in iOS Keychain or Android Keystore
- Conservative local hair profile from the prepared customer original and `REQUEST`
- `SOURCE → RESULTS → LOCK` flow
- Restart-resumable 100 fixed results, fullscreen image enlargement, and direct 1–6 selection
- Original-only Provider lineage; generated images are never request inputs

## Routes

```text
Hairloom:    http://127.0.0.1:4180/
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

Open `http://127.0.0.1:4180/` in a browser.

### Standalone mobile app

Hairloom never asks a browser to enter or store the image API credential. Generation runs inside the Capacitor native app.

```bash
npm run mobile:prepare
npm run mobile:doctor
npm run mobile:sync
npm run mobile:open:ios      # requires Xcode
npm run mobile:open:android  # use Android Studio or Gradle
```

- iOS requires Xcode and CocoaPods. `이미지 생성 연결` stores the personal key in a non-synchronizing, device-only Keychain item.
- Android requires Java 21 and Android SDK 35. The key is encrypted with an Android Keystore AES-GCM key.
- Prepared originals, generated outputs, and the fixed-slot journal remain in private app storage and are excluded from backup/file sharing. Completed or cancelled customer records and opaque output handles are removed by startup cleanup after seven days.
- Long iOS batches are most reliable in the foreground. Interrupted slots return to the same-owner retry queue and resume when the app reopens.
- `모든 고객 데이터 삭제` immediately removes prepared sources, outputs, and batch/slot/event journals. The Provider key remains until `연결 삭제` is selected separately.
- The browser/PWA shell remains useful for reviewing the catalog and flow, but Provider generation is native-only.

## Usage

1. Capture or select images. `Image 1` is required; `Images 2–6` are optional.
2. Enter the desired hairstyle, color, and known treatment history in the `REQUEST` card.
3. Select `NEXT` below the photo controls, then open any result as a fullscreen image.
4. Select 1–6 results and pass them to `LOCK`.

A prepared customer original enters only native `/responses` analysis and `/images/edits` generation. If analysis is temporarily unavailable, Hairloom uses a conservative profile from local color sampling and the REQUEST. Generated images are never reused as analysis or generation inputs.

## Image provider configuration

In the Hairloom mobile app, select `이미지 생성 연결` and enter a personal OpenAI Image API key with separate billing enabled. Native code fixes the Provider origin to `https://api.openai.com/v1`, uses `gpt-4.1-mini` for analysis, and uses `gpt-image-2` for image edits. The key never enters WebView JavaScript, `localStorage`, `sessionStorage`, the service worker, logs, or export files.

```bash
npm run mobile:doctor
npm run mobile:test
```

`imagen.web.js` and browser Bearer requests are no longer supported. Never commit API keys, customer photos, generated customer images, native signing material, or `.gjc/` QA artifacts.

## Future subscription provider TODO

ChatGPT Plus or Pro billing is separate from OpenAI API billing. A ChatGPT/Codex subscription token is not a general `/images/edits` API key and must not be copied into the mobile app.

- Official guidance: [ChatGPT subscriptions and API billing are separate](https://help.openai.com/en/articles/8156019)
- Codex can sign in with eligible ChatGPT plans: [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540)
- The current mobile MVP supports only a separately billed personal image API.
- A future `CodexSubscriptionProvider` may implement the same native provider interface only after OpenAI publishes a supported mobile Codex/App Server SDK, third-party ChatGPT OAuth image-generation surface, or documented subscription image-edit API.
- That work requires a separate compatibility/security gate proving official login, prepared-reference editing, exact-one output, cancellation, usage-limit state, logout, and token non-exposure.
- Never import ChatGPT passwords, cookies, browser tokens, `~/.codex/auth.json`, or private God Tibo authentication into the mobile app.


## Trend registry

Hairloom never uses external social images as generation inputs. The trend collector retains only style names, publication timestamps, public permalinks, sample counts, and momentum signals, then maps them to existing `HLM-C-*` design IDs. The initial registry contains 40 stylist-reviewed baseline styles. Trend is only a bounded secondary signal: at most 3 points in Explore and 5 points in public recommendations. Feasibility and original-source lineage always win.

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
92 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

## Main files

```text
server.mjs                        `/` → Hairloom redirect and public asset allowlist
consultation/                     Public Hairloom UI
explore/                          Internal Explore UI enabled only by environment flag
src/exploreCore.mjs               Shared catalog and queue domain logic
src/consultationCore.mjs          Consultation, feasibility, and queue logic
src/hairAnalysis.mjs              Local hair profile, color-request parsing, and internal conversion
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
- The internal Explore route keeps its legacy browser generation path disabled and sends no Provider request. Public Hairloom uses only user-supplied prepared originals as native generation inputs.
- The public surface does not create or send a hair mask, and non-current colors require no mask-confirmation step.
- Horizontal mirroring exists only at the provider boundary; final results return to the original orientation.
- Public results use the Provider output directly without source-pixel compositing.
- High-damage profiles exclude perm and extension designs.
- External social images are never stored, served, or used as generation inputs; only validated metadata signals are accepted.
- Customer photos, generated images, API keys, and QA artifacts never belong in the repository.
