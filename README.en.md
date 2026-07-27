# Hairloom

[한국어 README](README.md)

Hairloom is a local-first hairstyle exploration and Design Lock application. It generates hairstyle alternatives from original customer photos while restoring protected non-hair pixels from the source image.

## Features

- Explore powered by the versioned 6,500-design v2 catalog
- 100 fixed result slots with up to 32 concurrent requests
- Fast base Explore using only the original FRONT photo
- FRONT / SIDE / BACK Design Lock workflow
- Separate six-stage PRO workstation: `SOURCE → PROFILE → STRUCTURE → VARIATION → COMPARE → LOCK`
- Balanced optional source-view allocation, horizontal-mirror augmentation, and bounded natural colors in PRO
- Lossless PNG compositing that restores source pixels outside the confirmed hair mask
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
4. When any target differs from the current tone, review and confirm the hair mask for every supplied source view. Only the translucent warm-gold region is editable.
5. STRUCTURE distributes its 100 stable slots approximately evenly across supplied views. Mirrored provider inputs are flipped back before display.
6. Refine the structure in VARIATION and COMPARE, then send 1–6 design IDs and original source views to Design Lock from LOCK.

Every PRO request uses a prepared original source photo and its confirmed hair mask. Generated outputs never become request inputs, and pixels outside the editable mask are restored from the original source.

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

## Verification

```bash
npm run verify
```

Current baseline:

```text
51 tests passing
1,080-design taxonomy check passing
6,500-design v2 master catalog check passing
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-2
```

## Main files

```text
index.html                         Explore and Design Lock UI
consultation/                      PRO consultation UI
src/exploreCore.mjs                Explore domain logic
src/consultationCore.mjs           Consultation, feasibility, and queue logic
scripts/generateHairMasterCatalog.mjs  6,500-design catalog generator
docs/hair-design-master/           Runtime catalog and generated documentation
server.mjs                         Local-only static server
```

## Development principles

- Hairloom and BeautyTape are separate repositories.
- Base Explore uses only the original FRONT photo; PRO uses only source views supplied by the user.
- Non-current color generation cannot start until every supplied-view hair mask is confirmed.
- Horizontal mirroring exists only at the provider boundary; final results return to the original orientation.
- Protected non-hair areas are restored from source pixels in a lossless PNG.
- High-damage profiles exclude perm and extension designs.
- Customer photos, generated images, API keys, and QA artifacts never belong in the repository.
