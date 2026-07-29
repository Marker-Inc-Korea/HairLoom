# Hairloom Agent Guide

This is the machine-operable guide for work in the standalone Hairloom repository.

## Repository contract

- Project root: `/Users/kwon/vscode/hairloom`
- Repository: `https://github.com/Marker-Inc-Korea/HairLoom`
- Runtime: Node.js 20+
- Module system: native ESM
- Build step: none
- App URL: `http://127.0.0.1:4180/`
- Health URL: `http://127.0.0.1:4180/healthz`
- Main verification: `npm run verify`
- Expected baseline: 68 tests passing

## Hard project boundary

BeautyTape is a different sibling repository:

```text
/Users/kwon/vscode/duct-tape-beauty-recommender
```

Never implement or stage Hairloom work in BeautyTape. In particular, do not create Hairloom's `src/exploreCore.mjs`, root tests, master catalog generator, runtime catalog, Design Lock UI, or `imagen.web.js` in the BeautyTape repository.

Before editing, confirm:

```bash
pwd
# must be /Users/kwon/vscode/hairloom

git remote get-url origin
# must be https://github.com/Marker-Inc-Korea/HairLoom.git
```

## Bootstrap and verification

```bash
npm install
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

`npm run verify` must cover syntax checks, both catalog drift checks, deterministic trend-registry drift checks, Explore/catalog/consultation/server/trend/scheduler/automation tests, and the 68-test baseline.

## Product invariants

- Explore is front-only, fast, and low-quality.
- Design Lock is separate, high-quality, and front/side/back.
- Explore exposes exactly six settings: current length, hair thickness, damage condition, perm allowed, extension/piece allowed, and similarity.
- Do not add face-ratio or hidden face-shape controls.
- High damage excludes every perm and extension/piece design regardless of other toggles.
- Every Explore request uses the prepared original front photo.
- Generated pixels and catalog model photos are never subsequent request inputs.
- Explore concurrency is capped at 32 per tab.
- Results use 100 fixed slots and must not reorder on completion.
- Shortlists contain 1–6 current `HLM-*` design IDs.
- Explore handoff requires the current `catalogVersion` and `promptVersion`.
- Standard Design Lock continues to use its normal recommendation path.
- PRO remains a separate six-stage route: `SOURCE → PROFILE → STRUCTURE → VARIATION → COMPARE → LOCK`.
- PRO requires FRONT and accepts optional SIDE / BACK / CROWN / NAPE / DETAIL originals.
- PRO PROFILE is two pages: diagnosis, then deterministic FRONT-based current-color selection with visible confidence and manual correction, plus bounded natural target colors.
- PRO user-facing length choices are exactly `짧은 머리 / 중간 / 장발`.
- PRO does not create, confirm, or send hair masks; current and non-current natural tones use the same maskless provider path.
- Explore, PRO, and Design Lock prompts must use the shared low-sheen satin-to-matte surface contract and reject wet, oily, glassy, plastic, metallic, lacquered, or synthetic-wig shine.
- Core female and male records must receive distinct hair-only line-treatment prompts: feminine connected curves and blended face-framing versus masculine directional planes, broader sections, and controlled temple/nape transitions. The named design remains authoritative, and these rules must never alter face, body, or identity.
- Trend signals are metadata-only and map to stable core design prefixes. External images, thumbnails, Base64, media URLs, and image data URLs must never be stored, served, or used as generation inputs.
- Trend contributes at most 3 selection points in Explore and 5 suitability points in PRO; hard feasibility, damage safety, source lineage, and deterministic diversity remain authoritative.
- `data/hair-trend-signals.json` is the reviewed source ledger and watch configuration. `src/hairTrendData.mjs` is generated only by `scripts/syncHairTrends.mjs`; never hand-edit it.
- Instagram hashtag watch configuration must stay at or below 30 unique queries and live collection must fail visibly without configured Meta or Naver credentials.
- Periodic trend updates use the managed macOS launchd label `com.hairloom.trend-update`, default to 14 days (336 hours), and accept only integer intervals from 1 to 336 hours.
- Schedule installation must require one complete Meta or Naver credential pair unless it is a dry-run. Credentials stay in ignored `.env` or the process environment and must never be embedded in the plist or printed.
- The schedule manager must refuse to overwrite or remove an unmanaged plist at the same path. Logs remain under ignored `.gjc/logs/`.
- GitHub trend refresh runs through `.github/workflows/hair-trend-refresh.yml`, checks a deterministic 14-day cadence anchored at `2026-08-03`, and permits manual dispatch to force a run.
- Automated trend refreshes may commit changes only from `data/hair-trend-signals.json` and `src/hairTrendData.mjs` on `automation/hair-trends`, must target the default branch and run full verification first, and must fail on every other tracked change or non-ignored untracked file.
- GitHub Actions credentials must remain repository secrets or variables. Never write them to generated data, workflow artifacts, commits, logs, or PR text.
- PRO fixed 100-slot allocations remain deterministic, approximately balance supplied views, and retain view/mirror/color axes through retries.
- Provider-side mirrored source images must be flipped back before display.
- PRO displays the provider result directly after orientation restoration; it does not composite protected source pixels over the result.
- Consultation handoff schema v2 must validate schema, generation-axis, source-transform, catalog, and prompt versions; legacy v1 is migration-only.

## Runtime catalog

The authoritative catalog contains exactly 6,500 validated records. Compact dictionary/tuple encoding is intentional; hydrate it through `src/exploreCore.mjs` rather than expanding the disk payload.

Current runtime versions:

```text
schemaVersion: 1
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
consultation handoff schema: 2
```

Current budgets:

```text
catalog.json        <= 2.5 MB
catalog-index.json  <= 900 KB
```

## Secrets and private assets

Never commit:

```text
imagen.web.js
.env
Meta and Naver trend credentials
API keys
customer photos
generated customer images
docs/assets/test-subjects/
.gjc/
```

API keys belong in session storage or the ignored local fallback file. Non-secret provider settings may use local storage.

## Verification by change type

Core or catalog changes:

```bash
node --test exploreCore.test.mjs catalogRuntime.test.mjs
npm run verify
```

Trend registry changes:

```bash
npm run trend:check
node --test trendRegistry.test.mjs
npm run verify
node --test trendSchedule.test.mjs
npm run trend:schedule -- --dry-run --interval-hours=336
npm run trend:cadence -- --date=2026-08-17
node --test trendAutomation.test.mjs
```

Server changes:

```bash
node --test server.test.mjs
npm run verify
```

Visual changes require Aside at minimum on:

```text
1440x1000
834x1112
390x844 CSS viewport
```

Store QA evidence in an ignored persistent Hairloom path, not `/tmp`, and do not post-process screenshots to satisfy validators.

## Repository safety

Do not commit or push unless explicitly authorized. Preserve unrelated `docs/ux-segments/` and `prototypes/` work. Treat unexpected changes as user work until their origin is established.
