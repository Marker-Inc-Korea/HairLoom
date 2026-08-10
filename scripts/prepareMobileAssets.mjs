import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputRoot = resolve(root, 'mobile-dist');
const PUBLIC_ASSETS = Object.freeze([
  'manifest.webmanifest',
  'icons/hairloom-icon.svg',
  'icons/hairloom-192.png',
  'icons/hairloom-512.png',
  'consultation/index.html',
  'consultation/styles.css',
  'consultation/app.mjs',
  'src/exploreCore.mjs',
  'src/consultationCore.mjs',
  'src/hairAnalysis.mjs',
  'src/hairColorPalette.mjs',
  'src/trendRegistry.mjs',
  'src/hairTrendData.mjs',
  'src/mobileProviderBridge.mjs',
  'docs/hair-design-master/catalog.json',
  'docs/hair-design-master/catalog-index.json'
]);

const ROOT_ENTRY = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="refresh" content="0;url=./consultation/index.html">
  <title>Hairloom</title>
</head>
<body>
  <a href="./consultation/index.html">Hairloom 열기</a>
  <script>location.replace('./consultation/index.html');<\/script>
</body>
</html>
`;

async function assertRegularFile(relativePath) {
  const source = resolve(root, relativePath);
  const info = await stat(source).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing required mobile asset: ${relativePath}`);
  return source;
}

async function copyAllowedAsset(relativePath) {
  const source = await assertRegularFile(relativePath);
  const destination = resolve(outputRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all(PUBLIC_ASSETS.map(copyAllowedAsset));
await writeFile(resolve(outputRoot, 'index.html'), ROOT_ENTRY, 'utf8');

console.log(`Prepared ${PUBLIC_ASSETS.length + 1} allowlisted Hairloom mobile assets.`);
