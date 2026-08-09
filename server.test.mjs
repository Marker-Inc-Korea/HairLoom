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

test('serves Hairloom publicly and isolates Explore behind opt-in', async () => {
  const server = createHairloomServer();
  const port = await listen(server);
  try {
    const redirect = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/consultation/');
    assert.match(redirect.headers.get('cache-control') || '', /no-store/);

    const publicResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(publicResponse.status, 200);
    assert.equal(new URL(publicResponse.url).pathname, '/consultation/');
    assert.match(await publicResponse.text(), /<title>HAIRLOOM<\/title>/);

    assert.equal((await fetch(`http://127.0.0.1:${port}/explore/`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/model-previews/`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/src/modelPreviewRegistry.mjs`)).status, 404);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, service: 'hairloom', localOnly: true });
    assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status, 404);

    for (const path of ['/src/exploreCore.mjs', '/src/hairColorPalette.mjs', '/src/hairAnalysis.mjs', '/manifest.webmanifest', '/service-worker.js', '/icons/hairloom-icon.svg', '/icons/hairloom-192.png', '/icons/hairloom-512.png', '/docs/hair-design-master/catalog.json', '/docs/hair-design-master/catalog-index.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }

    const manifest = await (await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`)).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.id, '/consultation/');
    assert.equal(manifest.start_url, '/consultation/');
    assert.equal(manifest.scope, '/consultation/');
    assert.equal(manifest.shortcuts, undefined);
    assert.equal(manifest.name, 'Hairloom');
    assert.equal(manifest.short_name, 'Hairloom');

    const serviceWorkerSource = await (await fetch(`http://127.0.0.1:${port}/service-worker.js`)).text();
    assert.match(serviceWorkerSource, /hairloom-shell-v3/);
    assert.match(serviceWorkerSource, /'\/explore\/'/);
    assert.match(serviceWorkerSource, /'\/model-previews\/'/);
    assert.doesNotMatch(serviceWorkerSource, /modelPreviewRegistry/);
    assert.doesNotMatch(serviceWorkerSource, /model-previews\/index\.html/);
    assert.match(serviceWorkerSource, /request\.headers\.has\('authorization'\)/);
    assert.match(serviceWorkerSource, /cache\.put\(request, response\.clone\(\)\)/);
  } finally {
    await close(server);
  }

  const internalServer = createHairloomServer({ enableExplore: true });
  const internalPort = await listen(internalServer);
  try {
    const exploreResponse = await fetch(`http://127.0.0.1:${internalPort}/explore/`);
    assert.equal(exploreResponse.status, 200);
    const exploreHtml = await exploreResponse.text();
    assert.match(exploreHtml, /HAIRLOOM · Design Book/);
    assert.match(exploreHtml, /<base href="\/">/);
    assert.match(exploreHtml, /noindex,nofollow/);
    assert.match(exploreHtml, /id="exploreCameraFile"/);
    assert.match(exploreHtml, /imageDataUrl:EX\.preparedFrontDataUrl/);
    assert.doesNotMatch(exploreHtml, /modelPreviewRegistry|model-previews|registered-model-label/);
    assert.doesNotMatch(exploreHtml, /serviceWorker\.register|rel="manifest"/);
  } finally {
    await close(internalServer);
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
      assert.match(html, /styles\.css\?v=20260809-request-card-v6/);
      assert.match(html, /app\.mjs\?v=20260809-request-card-v6/);
      assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
      assert.match(html, /serviceWorker\.register\('\/service-worker\.js'\)/);
      assert.match(html, /id="imageLightbox"/);
      assert.match(html, /class="image-lightbox-shell"/);
      assert.doesNotMatch(html, /lightbox-variation-options/);
      assert.doesNotMatch(html, /이 스타일로 더 생성해보기/);
    }
    for (const [path, mime] of [['/consultation/styles.css', /^text\/css/], ['/consultation/app.mjs', /^text\/javascript/], ['/src/consultationCore.mjs', /^text\/javascript/], ['/src/hairAnalysis.mjs', /^text\/javascript/], ['/src/hairColorPalette.mjs', /^text\/javascript/], ['/src/trendRegistry.mjs', /^text\/javascript/], ['/src/hairTrendData.mjs', /^text\/javascript/]]) {
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
    assert.equal((await fetch(`http://127.0.0.1:${port}/model-previews/`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/src/modelPreviewRegistry.mjs`)).status, 404);
    assert.match(appSource, /const visibleStages = Object\.freeze/);
    assert.match(appSource, /\{ label: 'SOURCE', stateIndex: 0 \}/);
    assert.match(appSource, /\{ label: 'RESULTS', stateIndex: 2 \}/);
    assert.doesNotMatch(appSource, /\{ label: 'COMPARE', stateIndex:/);
    assert.match(appSource, /\{ label: 'LOCK', stateIndex: 5 \}/);
    assert.doesNotMatch(appSource, /\{ label: 'PROFILE', stateIndex:/);
    assert.doesNotMatch(appSource, /\{ label: 'VARIATION', stateIndex:/);
    assert.doesNotMatch(appSource, /\/ 03|HAIRLOOM PRO|panel\('STRUCTURE'\)|label: 'STRUCTURE'/);
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
    assert.doesNotMatch(appSource, /requestHairAnalysis|\/responses|\/chat\/completions/);
    assert.match(appSource, /hairAnalysisToDiagnosis/);
    assert.match(appSource, /hairAnalysisToExploreSettings/);
    assert.match(appSource, /hairAnalysisToColorProfile/);
    assert.match(appSource, /capture="user"/);
    assert.match(appSource, /카메라로 바로 촬영/);
    assert.match(appSource, /갤러리에서 선택/);
    assert.match(appSource, /id="freePrompt"/);
    assert.match(appSource, /<b>REQUEST<\/b>/);
    assert.match(appSource, /class="request-card"/);
    assert.match(appSource, /class="request-tags"/);
    assert.match(appSource, /<span>헤어스타일<\/span><span>색상<\/span><span>시술 이력<\/span>/);
    assert.match(appSource, /placeholder="원하는 내용을 자유롭게 적어주세요"/);
    assert.doesNotMatch(appSource, /<summary>API<\/summary>|class="provider"|class="cfg"|id="baseURL"|id="apiKey"/);
    assert.match(appSource, /<button class="next-button source-photo-next" id="toStructures">NEXT<\/button>/);
    assert.match(appSource, /\$\{intakeActions\}\$\{continueButton\}<div class="source-view-nav">/);
    assert.doesNotMatch(appSource, /GENERATE 100/);
    assert.match(appSource, /\{ id: 'front', label: '이미지 1' \}/);
    assert.match(appSource, /\{ id: 'detail', label: '이미지 6' \}/);
    assert.match(appSource, /const providerReady = Boolean\(provider\.baseURL && provider\.apiKey/);
    assert.match(appSource, /function applyLocalProfile/);
    assert.doesNotMatch(appSource, /AI HAIR ANALYSIS|>ANALYZE<\/button>|analysisModel|reanalyze|analysisStatus|runHairAnalysis|원하는 헤어를 자유롭게 적어주세요|uncertainties|modelPreviewRegistry|model-previews|registered-model/);
    assert.match(appSource, /state\.sourceProcessing = true/);
    assert.match(appSource, /let sourceLoadVersion = 0/);
    assert.match(appSource, /aria-busy="\$\{processing \? 'true' : 'false'\}"/);
    assert.match(appSource, /const preparationPromise = prepareOriginalJpeg\(file\)/);
    assert.match(appSource, /applyLocalProfile\(localToneId\)/);
    assert.match(appSource, /detectCurrentHairTone\('front'\)/);
    assert.match(appSource, /function handleNextAction/);
    assert.match(appSource, /app\.addEventListener\('click', handleNextAction, true\)/);
    assert.doesNotMatch(appSource, /function goToProfile/);
    assert.doesNotMatch(appSource, /id="toProfile"/);
    assert.doesNotMatch(appSource, /id="toColor"/);
    assert.doesNotMatch(appSource, /PREPARING…/);
    assert.match(appSource, /requestAnimationFrame/);
    assert.match(appSource, /const continueButton = ready \?/);
    assert.match(appSource, /visibleStages\.filter\(\(\{ stateIndex \}\) => stageEnabled\(stateIndex\)\)/);
    assert.match(appSource, /state\.stage === 5 \? '<button class="brand"/);
    assert.match(appSource, /state\.stage === stateIndex \? `<span class="stage"/);
    assert.match(appSource, /index === state\.sourceViewIndex \? `<span class="on/);
    assert.match(appSource, /state\.shortlist\.size \? '<button class="next-button" id="toAgreement"/);
    assert.match(appSource, /ready \? `<input type="checkbox"/);
    assert.doesNotMatch(appSource, / disabled[=>]/);
    assert.doesNotMatch(appSource, /aria-describedby=/);
    assert.match(appSource, /vivid: Object\.freeze/);
    assert.match(appSource, /axes\.colorIntensity \|\| state\.hairColorProfile\.intensity/);
    assert.match(appSource, /RESEMBLANCE STRENGTH/);
    assert.match(appSource, /USER REQUEST:/);
    assert.doesNotMatch(appSource, /AUTOMATIC HAIR ANALYSIS:/);
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
    assert.match(consultationCss, /mobile photo and request intake/);
    assert.match(consultationCss, /\.source-intake-actions/);
    assert.match(consultationCss, /#freePrompt/);
    assert.match(consultationCss, /\.request-card\{/);
    assert.match(consultationCss, /\.request-card:focus-within\{/);
    assert.match(consultationCss, /\.request-tags\{/);
    assert.doesNotMatch(consultationCss, /\.source-intent \.provider|\.source-intent \.cfg/);
    assert.doesNotMatch(consultationCss, /\.analysis-card/);
    assert.match(consultationCss, /safe-area-inset-bottom/);
    assert.doesNotMatch(consultationCss, /\.mask-canvas-stage/);
    assert.match(consultationCss, /\.source-photo-next\{/);
    assert.doesNotMatch(consultationCss, /\.source-next\{/);
    assert.match(consultationCss, /\.content\{touch-action:pan-y;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch\}/);
    assert.match(consultationCss, /\.structure-board,\.structure-tile,\.tile-image-button\{touch-action:pan-y\}/);
    assert.match(consultationCss, /fullscreen image enlargement and direct shortlist/);
    assert.doesNotMatch(consultationCss, /registered-preview|model-preview-link|registered-model-label/);
    assert.match(consultationCss, /\.image-lightbox-shell\{[^}]*width:100vw;height:100dvh/);
    assert.match(consultationCss, /\.image-lightbox-frame img\{[^}]*object-fit:cover;background:transparent/);
    assert.match(consultationCss, /\.image-lightbox\{[^}]*background:transparent/);
    assert.doesNotMatch(consultationCss, /\.image-lightbox-frame\{[^}]*background:#/);
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
