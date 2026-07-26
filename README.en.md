# Hairloom

[한국어 README](README.md)

Hairloom is a local-first hairstyle exploration and Design Lock application. It generates hairstyle alternatives from original customer photos while restoring protected non-hair pixels from the source image.

## Features

- Explore powered by a 6,500-design hair catalog
- 100 fixed result slots with up to 32 concurrent requests
- Original FRONT-photo lineage for every generated result
- FRONT / SIDE / BACK Design Lock workflow
- Separate professional consultation interface
- Source-pixel protection for face, skin, clothing, and background
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
2. Set length, natural texture, density, damage, and treatment history in PROFILE.
3. Compare 100 hairstyle structures in STRUCTURE.
4. Refine the selected structure through VARIATION and COMPARE.
5. Send the selected designs and original source views to Design Lock in LOCK.

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
45 tests passing
1,080-design taxonomy check passing
6,500-design master catalog check passing
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
- Only original photos may be used as image-generation inputs.
- Protected non-hair areas are restored from source pixels.
- High-damage profiles exclude perm and extension designs.
- Customer photos and authentication data never belong in the repository.
