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
    for (const path of ['/src/exploreCore.mjs', '/docs/hair-design-master/catalog.json', '/docs/hair-design-master/catalog-index.json']) {
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
      assert.match(html, /styles\.css\?v=20260726-upload-button/);
      assert.match(html, /app\.mjs\?v=20260726-upload-button/);
    }
    for (const [path, mime] of [['/consultation/styles.css', /^text\/css/], ['/consultation/app.mjs', /^text\/javascript/], ['/src/consultationCore.mjs', /^text\/javascript/]]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') || '', mime, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }
    const appSource = await (await fetch(`http://127.0.0.1:${port}/consultation/app.mjs`)).text();
    assert.match(appSource, /\['SOURCE', 'PROFILE', 'STRUCTURE', 'VARIATION', 'COMPARE', 'LOCK'\]/);
    assert.match(appSource, /FRONT REQUIRED/);
    assert.match(appSource, /metadata: \{ purpose: 'structure' \}/);
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
    assert.match(appSource, /sourceViewBlobs/);
    assert.match(appSource, /form\.append\('mask'/);
    assert.match(appSource, /every non-hair pixel must remain unchanged/);
    assert.match(appSource, /compositeHairOnlyResult/);
    assert.match(appSource, /destination-out/);
    assert.match(appSource, /'image\/png'/);
    assert.match(appSource, /editableRegions/);
    assert.match(appSource, /protectedRegions/);
    assert.match(appSource, /HAIRLINE LOCK/);
    assert.match(appSource, /FACIAL HAIR LOCK/);
    assert.doesNotMatch(appSource, /const protectedFace =/);
    assert.match(appSource, /preserveScroll/);
    assert.match(appSource, /STRUCTURE_TILE_RATIOS/);
    assert.match(appSource, /--tile-ratio/);
    assert.match(appSource, /textureControlPrompt/);
    assert.match(appSource, /no micro-crimping/);
    assert.match(appSource, /태슬 단발/);
    assert.match(appSource, /TREND ·/);
    assert.match(appSource, /id=\"currentLength\"/);
    assert.match(appSource, /매우 짧음/);
    assert.match(appSource, /장발/);
    assert.doesNotMatch(appSource, /id=\"currentCm\"/);
    assert.doesNotMatch(appSource, /advanceSourceView\(role\)/);
    assert.doesNotMatch(appSource, /source-board source-board-intake/);
    assert.doesNotMatch(appSource, /'SOURCE', 'PROFILE', 'BOARD'/);
    const consultationCss = await (await fetch(`http://127.0.0.1:${port}/consultation/styles.css`)).text();
    assert.match(consultationCss, /\.structure-board\{/);
    assert.match(consultationCss, /filter:blur\(18px\)/);
    assert.match(consultationCss, /\.single-view-upload\{/);
    assert.match(consultationCss, /\.single-view-upload:focus-visible/);
    assert.match(consultationCss, /\.source-view-dots\{/);
    assert.match(consultationCss, /stable varied result masonry/);
    assert.match(consultationCss, /aspect-ratio:var\(--tile-ratio/);

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
