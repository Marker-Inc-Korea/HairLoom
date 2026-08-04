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
    assert.match(rootHtml, /id="exploreColorGrid"/);
    assert.match(rootHtml, /TARGET HAIR COLOR/);
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
    assert.match(rootResponse.headers.get('cache-control') || '', /no-store/);

    for (const path of ['/imagen.web.example.js', '/docs/assets/test-mannequin/front.png', '/docs/assets/test-mannequin-female/front.png', '/docs/assets/samples/hair-female-soft-bob-only.jpg']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0, path);
    }

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, service: 'hairloom', localOnly: true });
    assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status, 404);
    for (const path of ['/src/exploreCore.mjs', '/src/hairColorPalette.mjs', '/docs/hair-design-master/catalog.json', '/docs/hair-design-master/catalog-index.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      assert.match(response.headers.get('content-type') || '', path.endsWith('.json') ? /^application\/json/ : /^text\/javascript/);
      if (path.endsWith('.json')) {
        const payload = await response.json();
        assert.equal(payload.schemaVersion, 1);
        assert.equal(payload.records.length, 6500);
      }
    }
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
      assert.match(html, /styles\.css\?v=20260804-lightbox-color-v18/);
      assert.match(html, /app\.mjs\?v=20260804-lightbox-color-v18/);
      assert.match(html, /id="imageLightbox"/);
      assert.match(html, /class="image-lightbox-shell"/);
      assert.match(html, /class="lightbox-variation-options"/);
      assert.match(html, /이 스타일로 더 생성해보기/);
    }
    for (const [path, mime] of [['/consultation/styles.css', /^text\/css/], ['/consultation/app.mjs', /^text\/javascript/], ['/src/consultationCore.mjs', /^text\/javascript/], ['/src/hairColorPalette.mjs', /^text\/javascript/], ['/src/trendRegistry.mjs', /^text\/javascript/], ['/src/hairTrendData.mjs', /^text\/javascript/], ['/src/modelPreviewRegistry.mjs', /^text\/javascript/]]) {
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
    assert.match(appSource, /\{ label: 'COMPARE', stateIndex: 4 \}/);
    assert.doesNotMatch(appSource, /\{ label: 'VARIATION', stateIndex:/);
    assert.match(appSource, /\/ 05/);
    assert.match(appSource, /FRONT REQUIRED/);
    assert.match(appSource, /purpose: 'structure'/);
    assert.match(appSource, /id="backToList"/);
    assert.match(appSource, /state\.stage = state\.structureSlots\.length \? 2 : 0/);
    assert.match(appSource, /<button class=\"single-view-upload/);
    assert.match(appSource, /data-upload-view=/);
    assert.match(appSource, /#view-\$\{button\.dataset\.uploadView\}/);
    assert.doesNotMatch(appSource, /<label class=\"single-view-upload/);
    assert.match(appSource, /class="source-view-dots"/);
    assert.match(appSource, /required} \/ 1 REQUIRED/);
    assert.match(appSource, /state\.sourceViewIndex === 0 \? 'REQUIRED' : 'OPTIONAL'/);
    assert.match(appSource, /assignConsultationSourceViews/);
    assert.match(appSource, /assignConsultationGenerationAxes/);
    assert.match(appSource, /sourceViewBlobs/);
    assert.doesNotMatch(appSource, /sourceViewMasks/);
    assert.match(appSource, /profileStep/);
    assert.match(appSource, /PROFILE 1\/2/);
    assert.match(appSource, /COLOR 2\/2/);
    assert.match(appSource, /HAIR_COLOR_TONES/);
    assert.match(appSource, /deriveAllowedHairColorTones/);
    assert.match(appSource, /data-current-tone/);
    assert.match(appSource, /detectCurrentHairTone/);
    assert.match(appSource, /AUTO \$\{Math\.round\(detection\.confidence \* 100\)\}%/);
    assert.match(appSource, /직접 수정 가능/);
    assert.match(appSource, /state\.sourceProcessing = true/);
    assert.match(appSource, /let sourceLoadVersion = 0/);
    assert.match(appSource, /성별과 다른 뷰는 계속 조작할 수 있습니다/);
    assert.match(appSource, /aria-busy="\$\{processing \? 'true' : 'false'\}"/);
    assert.match(appSource, /const preparationPromise = prepareOriginalJpeg\(file\)/);
    assert.match(appSource, /state\.sourceProcessing = false;\n\s*state\.hairColorDetection = \{ status: 'detecting'/);
    assert.match(appSource, /detectCurrentHairTone\('front'\)\.catch/);
    assert.doesNotMatch(appSource, /state\.sourceProcessing \? 'disabled aria-busy="true"'/);
    assert.match(appSource, /function goToProfile/);
    assert.match(appSource, /function handleNextAction/);
    assert.match(appSource, /app\.addEventListener\('click', handleNextAction, true\)/);
    assert.doesNotMatch(appSource, /querySelector\('#toProfile'\)\?\.addEventListener/);
    assert.match(appSource, /PREPARING…/);
    assert.match(appSource, /requestAnimationFrame/);
    assert.match(appSource, /data-ready=/);
    assert.match(appSource, /aria-describedby=/);
    assert.match(appSource, /data-target-tone/);
    assert.match(appSource, /--tone-color:/);
    assert.match(appSource, /팔레트에서 직접 수정 가능/);
    assert.match(appSource, /evaluateHairColorFeasibility/);
    assert.match(appSource, /선택 색상 유사도/);
    assert.match(appSource, /vivid: Object\.freeze/);
    assert.match(appSource, /axes\.colorIntensity \|\| state\.hairColorProfile\.intensity/);
    assert.match(appSource, /RESEMBLANCE STRENGTH/);
    assert.doesNotMatch(appSource, /data-mask-tool/);
    assert.doesNotMatch(appSource, /HAIR MASK CONFIRMATION REQUIRED/);
    assert.match(appSource, /MASKLESS · 헤어 마스크 없이 원본 전체를 기준으로 생성합니다/);
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
    assert.match(appSource, /function openStructureLightbox/);
    assert.match(appSource, /minimalVariationsForSelectedGroup/);
    assert.match(appSource, /lightboxGenerate\.onclick/);
    assert.match(appSource, /data-preview-image/);
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
    assert.match(appSource, /id="currentLength"/);
    assert.match(appSource, /짧은 머리/);
    assert.match(appSource, /중간/);
    assert.match(appSource, /장발/);
    assert.doesNotMatch(appSource, /매우 짧음/);
    assert.doesNotMatch(appSource, /긴 머리/);
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
    assert.match(consultationCss, /expanded visible hair palette/);
    assert.match(consultationCss, /background:var\(--tone-color/);
    assert.match(consultationCss, /maskless color profile/);
    assert.match(consultationCss, /\.tone-grid\{/);
    assert.match(consultationCss, /\.maskless-notice\{/);
    assert.doesNotMatch(consultationCss, /\.mask-canvas-stage/);
    assert.match(consultationCss, /explicit button response and preparation states/);
    assert.match(consultationCss, /\.color-continue-note\.busy/);
    assert.match(consultationCss, /\.source-next\{/);
    assert.match(consultationCss, /aspect-safe image review and in-place variation/);
    assert.match(consultationCss, /registered-preview \.image img\{object-fit:contain/);
    assert.match(consultationCss, /\.image-lightbox\{/);
    assert.match(consultationCss, /\.lightbox-variation-options\{/);

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
