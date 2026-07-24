# Hairloom

Hairloom is a standalone local-first hairstyle exploration and Design Lock application. It is developed separately from BeautyTape.

## Project boundary

```text
Hairloom
- Repository: https://github.com/Hyunwook-Kwon/hairloom
- Local root: /Users/kwon/vscode/hairloom
- App URL: http://127.0.0.1:4180/
- Health URL: http://127.0.0.1:4180/healthz

BeautyTape
- Repository: https://github.com/NomaDamas/beauty-tape
- Local root: /Users/kwon/vscode/duct-tape-beauty-recommender
- App URL: http://127.0.0.1:4173/
```

Hairloom source, catalogs, tests, and local image-provider configuration belong only in this repository. BeautyTape keeps its separate multi-studio beauty recommendation product.

## Product flows

### Explore

```text
Original front photo
→ six hair settings
→ deterministic selection from 6,500 designs
→ 100 fixed progressive result slots
→ neighbor exploration
→ select 1–6 design IDs
```

Explore uses the same prepared original front photo for every generated result and limits concurrent requests to 32 per tab.

### Design Lock

```text
Selected design IDs
→ original front, side, and back photos
→ separate high-quality front, side, and back edits
```

Explore-generated pixels are never reused as Design Lock inputs.

## Local setup

Requires Node.js 20 or newer.

```bash
cd /Users/kwon/vscode/hairloom
npm install
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

Expected verification baseline:

```text
26 tests passing
1,080-design catalog drift check passing
6,500-design catalog drift check passing
```

## Image provider

Use the settings button in Hairloom or copy the local example:

```bash
cp imagen.web.example.js imagen.web.js
```

Never commit `imagen.web.js`, API keys, customer photos, generated customer images, `.gjc/`, or `docs/assets/test-subjects/`.

## Main files

```text
index.html                                Hairloom UI and browser orchestration
server.mjs                                local-only static server
src/exploreCore.mjs                       deterministic Explore domain logic
scripts/generateHairDesignCatalog.mjs     1,080-design taxonomy generator
scripts/generateHairMasterCatalog.mjs     6,500-design catalog generator
docs/hair-design-master/                  catalog documentation and runtime payloads
exploreCore.test.mjs                      Explore behavior tests
catalogRuntime.test.mjs                   full catalog and size-budget tests
server.test.mjs                           local server boundary tests
```

The original BeautyTape derivative design documents are preserved under `docs/archive/beautytape-derivative-plan/` for history only. Current implementation contracts live in the Hairloom source and tests.
