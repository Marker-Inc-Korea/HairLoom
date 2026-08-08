import assert from 'node:assert/strict';
import { connect } from 'node:net';
import test from 'node:test';
import { createHairloomServer } from './server.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function rawHttpRequest(port, requestText) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let response = '';

    socket.setEncoding('utf8');
    socket.setTimeout(1000);
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Timed out waiting for raw HTTP response'));
    });
    socket.on('data', (chunk) => {
      response += chunk;
    });
    socket.once('connect', () => {
      socket.end(requestText);
    });
    socket.once('end', () => resolve(response));
  });
}

function statusCode(rawResponse) {
  const match = /^HTTP\/1\.1 (\d{3})/.exec(rawResponse);
  assert.ok(match, rawResponse);
  return Number(match[1]);
}

test('serves Hairloom page and isolated static assets', async () => {
  const server = createHairloomServer();
  const port = await listen(server);
  try {
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootResponse.status, 200);
    const rootHtml = await rootResponse.text();
    assert.match(rootHtml, /HAIRLOOM · Design Book/);
    assert.match(rootHtml, /미니 단발/);
    assert.match(rootHtml, /웨이브 단발/);
    assert.doesNotMatch(rootHtml, /ko:'미니 보브'/);
    assert.match(rootHtml, /SURFACE FINISH LOCK/);
    assert.match(rootHtml, /low-sheen satin-to-matte/);
    assert.match(rootHtml, /synthetic wig sheen/);
    assert.match(rootHtml, /자연스러운 저광택/);
    assert.match(rootHtml, /genderLineTreatmentPrompt\(record\.genderId\)/);
    assert.match(rootHtml, /genderLine=ExploreCore\.genderLineTreatmentPrompt/);
    assert.match(rootHtml, /id="exploreCameraFile"/);
    assert.match(rootHtml, /capture="user"/);
    assert.match(rootHtml, /id="exploreGalleryFile"/);
    assert.match(rootHtml, /id="explorePrompt"/);
    assert.match(rootHtml, /id="exploreAnalysis"/);
    assert.match(rootHtml, /requestHairAnalysis/);
    assert.match(rootHtml, /hairAnalysisToExploreSettings/);
    assert.doesNotMatch(rootHtml, /id="exploreColorGrid"/);
    assert.doesNotMatch(rootHtml, /id="exploreSettings"/);
    assert.match(rootHtml, /imageDataUrl:EX\.preparedFrontDataUrl/);
    assert.match(rootHtml, /sourceVersion:\s*0/);
    assert.match(rootHtml, /sourceVersion!==EX\.sourceVersion/);
    assert.match(rootHtml, /frontOriginalDataUrl:EX\.preparedFrontDataUrl/);
    assert.doesNotMatch(rootHtml, /imageDataUrl:EX\.originalFrontDataUrl/);
    assert.match(rootHtml, /mosaic-3x3/);
    assert.match(rootHtml, /RANDOM FILL/);
    assert.doesNotMatch(rootHtml, /id="exploreProgress"/);
    assert.match(rootHtml, /id="exploreImageLightbox"/);
    assert.match(rootHtml, /class="explore-similar"/);
    assert.match(rootHtml, /openExploreImageLightbox/);
    assert.match(rootHtml, /tile\.querySelector\('\.tile-id'\)\.textContent=number/);
    assert.doesNotMatch(rootHtml, /tile\.querySelector\('\.tile-id'\)\.textContent=slot\?\.designId/);
    assert.match(rootHtml, /registered-preview\.active img\{object-fit:contain/);
    assert.match(rootHtml, /function fitExploreMosaicTile/);
    assert.match(rootHtml, /aspectRatio>0&&aspectRatio<\.9/);
    assert.equal(rootResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.match(rootHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(rootHtml, /serviceWorker\.register\('\/service-worker\.js'\)/);
    assert.match(rootResponse.headers.get('cache-control') || '', /no-store/);

    for (const path of ['/imagen.web.example.js', '/docs/assets/test-mannequin/front.png', '/docs/assets/test-mannequin-female/front.png', '/docs/assets/samples/hair-female-soft-bob-only.jpg']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0, path);
    }

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, service: 'hairloom', localOnly: true });
    assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status, 404);
    for (const path of ['/src/exploreCore.mjs', '/src/hairColorPalette.mjs', '/src/hairAnalysis.mjs', '/manifest.webmanifest', '/service-worker.js', '/icons/hairloom-icon.svg', '/icons/hairloom-192.png', '/icons/hairloom-512.png', '/docs/hair-design-master/catalog.json', '/docs/hair-design-master/catalog-index.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      const contentType = response.headers.get('content-type') || '';
      if (path.endsWith('.json')) assert.match(contentType, /^application\/json/);
      else if (path.endsWith('.webmanifest')) assert.match(contentType, /^application\/manifest\+json/);
      else if (path.endsWith('.svg')) assert.match(contentType, /^image\/svg\+xml/);
      else if (path.endsWith('.png')) assert.match(contentType, /^image\/png/);
      else assert.match(contentType, /^text\/javascript/);
      if (path.endsWith('catalog.json') || path.endsWith('catalog-index.json')) {
        const payload = await response.json();
        assert.equal(payload.schemaVersion, 1);
        assert.equal(payload.records.length, 6500);
      }
    }
    const manifest = await (await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512', 'any']);
    const serviceWorkerSource = await (await fetch(`http://127.0.0.1:${port}/service-worker.js`)).text();
    assert.match(serviceWorkerSource, /NEVER_CACHE_PREFIXES/);
    assert.match(serviceWorkerSource, /'\/imagen\.web\.js'/);
    assert.match(serviceWorkerSource, /'\/api\/'/);
    assert.match(serviceWorkerSource, /request\.headers\.has\('authorization'\)/);
    assert.match(serviceWorkerSource, /url\.origin !== self\.location\.origin/);
    assert.match(serviceWorkerSource, /cache\.put\(request, response\.clone\(\)\)/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/docs/hair-design-master/VALIDATION.json`)).status, 404);
  } finally {
    await close(server);
  }
});

test('serves only consultation route and allowlisted consultation assets', async () => {
  const server = createHairloomServer();
  const port = await listen(server);
  try {
    for (const path of ['/consultation/', '/consultation/index.html']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') || '', /^text\/html/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      const html = await response.text();
      assert.match(html, /styles\.css\?v=20260808-zoom-only-v2/);
      assert.match(html, /app\.mjs\?v=20260808-zoom-only-v2/);
      assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
      assert.match(html, /serviceWorker\.register\('\/service-worker\.js'\)/);
      assert.match(html, /id="imageLightbox"/);
      assert.match(html, /class="image-lightbox-shell"/);
      assert.doesNotMatch(html, /lightbox-variation-options/);
      assert.doesNotMatch(html, /이 스타일로 더 생성해보기/);
    }
    for (const [path, mime] of [['/consultation/styles.css', /^text\/css/], ['/consultation/app.mjs', /^text\/javascript/], ['/src/consultationCore.mjs', /^text\/javascript/], ['/src/hairAnalysis.mjs', /^text\/javascript/], ['/src/hairColorPalette.mjs', /^text\/javascript/], ['/src/trendRegistry.mjs', /^text\/javascript/], ['/src/hairTrendData.mjs', /^text\/javascript/], ['/src/modelPreviewRegistry.mjs', /^text\/javascript/]]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') || '', mime, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    const appSource = await (await fetch(`http://127.0.0.1:${port}/consultation/app.mjs`)).text();
    const coreSource = await (await fetch(`http://127.0.0.1:${port}/src/consultationCore.mjs`)).text();
    const exploreCoreSource = await (await fetch(`http://127.0.0.1:${port}/src/exploreCore.mjs`)).text();
    const trendRegistrySource = await (await fetch(`http://127.0.0.1:${port}/src/trendRegistry.mjs`)).text();
    const trendDataSource = await (await fetch(`http://127.0.0.1:${port}/src/hairTrendData.mjs`)).text();
    const paletteSource = await (await fetch(`http://127.0.0.1:${port}/src/hairColorPalette.mjs`)).text();
    assert.match(coreSource, /export function classifyHairColorSamples/);
    assert.match(paletteSource, /export const HAIR_COLOR_TONES/);
    assert.match(paletteSource, /lavender-ash/);
    assert.equal((paletteSource.match(/Object\.freeze\(\{ id:/g) || []).length, 19);
    assert.match(exploreCoreSource, /MASCULINE LINE TREATMENT/);
    assert.match(exploreCoreSource, /stronger directional planes/);
    assert.match(exploreCoreSource, /FEMININE LINE TREATMENT/);
    assert.match(exploreCoreSource, /softer connected arcs/);
    assert.match(exploreCoreSource, /hair only; never alter the face, body, or identity/);
    assert.match(trendRegistrySource, /trendBadgeForCandidate/);
    assert.match(trendDataSource, /HLM-TRENDS-2026-07-1/);
    assert.match(trendDataSource, /"sourcePolicy": "metadata-only"/);
    assert.doesNotMatch(trendDataSource, /"(?:imageUrl|media_url|thumbnail|base64|dataUrl)"\s*:/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/data/hair-trend-signals.json`)).status, 404);
    for (const [path, mime] of [['/model-previews/', /^text\/html/], ['/model-previews/index.html', /^text\/html/], ['/model-previews/styles.css', /^text\/css/], ['/model-previews/app.mjs', /^text\/javascript/]]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') || '', mime, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    const modelPreviewHtml = await (await fetch(`http://127.0.0.1:${port}/model-previews/`)).text();
    assert.match(modelPreviewHtml, /대기 모델 사진/);
    assert.match(modelPreviewHtml, /사진을 선택하고 사용 권리만 확인하면 바로 사용할 수 있습니다/);
    assert.match(modelPreviewHtml, /styles\.css\?v=20260804-stylist-compact-v5/);
    assert.match(modelPreviewHtml, /app\.mjs\?v=20260804-stylist-compact-v5/);
    assert.match(modelPreviewHtml, /class="photo-picker"/);
    assert.match(modelPreviewHtml, /사진 사용 정보/);
    assert.match(modelPreviewHtml, /표시 조건과 기록 더보기/);
    assert.match(modelPreviewHtml, /사진 백업·복원/);
    assert.match(modelPreviewHtml, /선택 사진 관리/);
    assert.doesNotMatch(modelPreviewHtml, /Loading Model Library|DISPLAY ONLY|LOCAL STORAGE|Design Lock|AES-GCM|디자인 ID|인터넷 URL|bulkApplyDesignRefs/);
    assert.match(appSource, /const visibleStages = Object\.freeze/);
    assert.match(appSource, /\{ label: 'SOURCE', stateIndex: 0 \}/);
    assert.match(appSource, /\{ label: 'STRUCTURE', stateIndex: 2 \}/);
    assert.doesNotMatch(appSource, /\{ label: 'COMPARE', stateIndex:/);
    assert.match(appSource, /\{ label: 'LOCK', stateIndex: 5 \}/);
    assert.doesNotMatch(appSource, /\{ label: 'PROFILE', stateIndex:/);
    assert.doesNotMatch(appSource, /\{ label: 'VARIATION', stateIndex:/);
    assert.match(appSource, /\/ 03/);
    assert.match(appSource, /FRONT REQUIRED/);
    assert.match(appSource, /purpose: 'structure'/);
    assert.match(appSource, /id="backToList"/);
    assert.match(appSource, /state\.stage = state\.structureSlots\.length \? 2 : 0/);
    assert.match(appSource, /<button class="single-view-upload/);
    assert.match(appSource, /data-upload-input=/);
    assert.match(appSource, /#\$\{button\.dataset\.uploadInput\}/);
    assert.doesNotMatch(appSource, /<label class=\"single-view-upload/);
    assert.match(appSource, /class="source-view-dots"/);
    assert.match(appSource, /required} \/ 1 REQUIRED/);
    assert.match(appSource, /state\.sourceViewIndex === 0 \? 'REQUIRED' : 'OPTIONAL'/);
    assert.match(appSource, /assignConsultationSourceViews/);
    assert.match(appSource, /selectConsultationStructureDesignIds/);
    assert.doesNotMatch(appSource, /assignConsultationGenerationAxes/);
    assert.match(appSource, /sourceViewBlobs/);
    assert.doesNotMatch(appSource, /sourceViewMasks/);
    assert.doesNotMatch(appSource, /profileStep/);
    assert.doesNotMatch(appSource, /PROFILE 1\/2/);
    assert.doesNotMatch(appSource, /COLOR 2\/2/);
    assert.match(appSource, /HAIR_COLOR_TONES/);
    assert.match(appSource, /deriveAllowedHairColorTones/);
    assert.doesNotMatch(appSource, /data-current-tone/);
    assert.doesNotMatch(appSource, /data-target-tone/);
    assert.match(appSource, /detectCurrentHairTone/);
    assert.match(appSource, /requestHairAnalysis/);
    assert.match(appSource, /hairAnalysisToDiagnosis/);
    assert.match(appSource, /hairAnalysisToExploreSettings/);
    assert.match(appSource, /hairAnalysisToColorProfile/);
    assert.match(appSource, /capture="user"/);
    assert.match(appSource, /카메라로 바로 촬영/);
    assert.match(appSource, /갤러리에서 선택/);
    assert.match(appSource, /id="freePrompt"/);
    assert.match(appSource, /AI HAIR ANALYSIS/);
    assert.match(appSource, /state\.sourceProcessing = true/);
    assert.match(appSource, /let sourceLoadVersion = 0/);
    assert.match(appSource, /aria-busy="\$\{processing \? 'true' : 'false'\}"/);
    assert.match(appSource, /const preparationPromise = prepareOriginalJpeg\(file\)/);
    assert.match(appSource, /state\.analysisStatus = 'analyzing'/);
    assert.match(appSource, /runHairAnalysis\(\{ force: true \}\)/);
    assert.match(appSource, /function handleNextAction/);
    assert.match(appSource, /app\.addEventListener\('click', handleNextAction, true\)/);
    assert.doesNotMatch(appSource, /function goToProfile/);
    assert.doesNotMatch(appSource, /id="toProfile"/);
    assert.doesNotMatch(appSource, /id="toColor"/);
    assert.match(appSource, /PREPARING…/);
    assert.match(appSource, /requestAnimationFrame/);
    assert.match(appSource, /data-ready=/);
    assert.match(appSource, /aria-describedby=/);
    assert.match(appSource, /vivid: Object\.freeze/);
    assert.match(appSource, /axes\.colorIntensity \|\| state\.hairColorProfile\.intensity/);
    assert.match(appSource, /RESEMBLANCE STRENGTH/);
    assert.match(appSource, /USER REQUEST:/);
    assert.match(appSource, /AUTOMATIC HAIR ANALYSIS:/);
    assert.doesNotMatch(appSource, /data-mask-tool/);
    assert.doesNotMatch(appSource, /HAIR MASK CONFIRMATION REQUIRED/);
    assert.match(appSource, /MASKLESS CONTRACT: no edit mask is supplied/);
    assert.match(appSource, /providerInputsForItem/);
    assert.match(appSource, /flipBlobHorizontally/);
    assert.match(appSource, /restoreGeneratedOrientation/);
    assert.match(appSource, /sourceTransformVersion/);
    assert.match(appSource, /mirrored: item\.generationAxes/);
    assert.match(appSource, /colorToneId: item\.generationAxes/);
    assert.doesNotMatch(appSource, /form\.append\('mask'/);
    assert.match(appSource, /every non-hair pixel must remain unchanged/);
    assert.doesNotMatch(appSource, /compositeHairOnlyResult/);
    assert.doesNotMatch(appSource, /destination-out/);
    assert.match(appSource, /samplingRegions/);
    assert.match(appSource, /excludedRegions/);
    assert.match(appSource, /HAIRLINE LOCK/);
    assert.match(appSource, /never recolor face, eyebrows, facial hair, ears, neck, body, clothing, background/);
    assert.match(appSource, /No global color grading/);
    assert.doesNotMatch(appSource, /const protectedFace =/);
    assert.match(appSource, /preserveScroll/);
    assert.match(appSource, /function mosaicTileClass/);
    assert.match(appSource, /mosaic-3x3/);
    assert.match(appSource, /RANDOM FILL/);
    assert.match(appSource, /function currentStageStatus\(\) \{ return ''; \}/);
    assert.match(appSource, /function openImageLightbox/);
    assert.doesNotMatch(appSource, /function openStructureLightbox/);
    assert.doesNotMatch(appSource, /minimalVariationsForSelectedGroup/);
    assert.doesNotMatch(appSource, /lightboxGenerate/);
    assert.match(appSource, /data-preview-image/);
    assert.match(appSource, /data-short=/);
    assert.match(appSource, /SELECT \$\{state\.shortlist\.size\}\/6/);
    assert.match(appSource, /id="toAgreement"/);
    assert.doesNotMatch(appSource, /function startCompare/);
    assert.doesNotMatch(appSource, /function renderCompare/);
    assert.doesNotMatch(appSource, /id="toVariations"/);
    assert.doesNotMatch(appSource, /id="toCompare"/);
    assert.doesNotMatch(appSource, /function generationAxisLabel/);
    assert.match(appSource, /function fitMosaicTileToImage/);
    assert.match(appSource, /aspectRatio > 0 && aspectRatio < 0\.9/);
    assert.doesNotMatch(appSource, /DONE \$\{done\}/);
    assert.doesNotMatch(appSource, /STRUCTURE_TILE_RATIOS/);
    assert.doesNotMatch(appSource, /--tile-ratio/);
    assert.match(appSource, /textureControlPrompt/);
    assert.match(appSource, /no micro-crimping/);
    assert.match(appSource, /SURFACE FINISH LOCK/);
    assert.match(appSource, /low-sheen satin-to-matte/);
    assert.match(appSource, /glassy or plastic shine/);
    assert.match(appSource, /synthetic wig sheen/);
    assert.match(appSource, /genderLineTreatmentPrompt\(record\.genderId\)/);
    assert.match(appSource, /태슬 단발/);
    assert.doesNotMatch(appSource, /trendBadgeForCandidate\(group\)/);
    assert.doesNotMatch(appSource, /TREND_BASE_SET/);
    assert.doesNotMatch(appSource, /id="currentLength"/);
    assert.doesNotMatch(appSource, /data-setting=/);
    assert.doesNotMatch(appSource, /function updateDiagnosisRange/);
    assert.doesNotMatch(appSource, /id="currentCm"/);
    assert.doesNotMatch(appSource, /advanceSourceView\(role\)/);
    assert.doesNotMatch(appSource, /source-board source-board-intake/);
    assert.doesNotMatch(appSource, /'SOURCE', 'PROFILE', 'BOARD'/);
    const consultationCss = await (await fetch(`http://127.0.0.1:${port}/consultation/styles.css`)).text();
    assert.match(consultationCss, /\.structure-board\{/);
    assert.match(consultationCss, /filter:blur\(18px\)/);
    assert.match(consultationCss, /\.single-view-upload\{/);
    assert.match(consultationCss, /\.single-view-upload:focus-visible/);
    assert.match(consultationCss, /\.source-view-dots\{/);
    assert.match(consultationCss, /deterministic random-fill mosaics/);
    assert.match(consultationCss, /grid-auto-flow:dense/);
    assert.match(consultationCss, /\.structure-tile\.mosaic-3x3/);
    assert.match(consultationCss, /mobile AI intake/);
    assert.match(consultationCss, /\.source-intake-actions/);
    assert.match(consultationCss, /#freePrompt/);
    assert.match(consultationCss, /\.analysis-card/);
    assert.match(consultationCss, /safe-area-inset-bottom/);
    assert.doesNotMatch(consultationCss, /\.mask-canvas-stage/);
    assert.match(consultationCss, /\.source-next\{/);
    assert.match(consultationCss, /aspect-safe image enlargement and direct shortlist/);
    assert.match(consultationCss, /registered-preview \.image img\{object-fit:contain/);
    assert.match(consultationCss, /\.image-lightbox\{/);
    assert.doesNotMatch(consultationCss, /\.lightbox-variation-options\{/);
    assert.match(consultationCss, /\.structure-tile>input\{/);

    for (const path of ['/consultation.html', '/consultation/prototype.html', '/consultation/deleted-prototype.html', '/docs/ux-segments/stylist-consultation/prototype.html', '/consultation/../package.json', '/consultation/notes.md', '/src/modules.mjs']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 404, path);
    }
  } finally {
    await close(server);
  }
});

test('rejects malformed raw request targets and untrusted hosts without breaking the server', async () => {
  const server = createHairloomServer();
  const port = await listen(server);
  try {
    const malformedTarget = await rawHttpRequest(port, 'GET http://[::1 HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.equal(statusCode(malformedTarget), 400);

    const untrustedHost = await rawHttpRequest(port, 'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1@evil.test\r\nConnection: close\r\n\r\n');
    assert.equal(statusCode(untrustedHost), 400);

    const normalResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(normalResponse.status, 200);
    assert.deepEqual(await normalResponse.json(), { ok: true, service: 'hairloom', localOnly: true });
  } finally {
    await close(server);
  }
});
