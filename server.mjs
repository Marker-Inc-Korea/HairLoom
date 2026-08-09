import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4180);
const localUrlBase = `http://${host}`;
const trustedHostnames = new Set([host, 'localhost', '[::1]']);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function resolveStaticPath(pathname, enableExplore = false) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const exploreAllowed = enableExplore && (
    decoded === '/explore/' ||
    decoded === '/explore/index.html'
  );
  const allowed =
    decoded === '/manifest.webmanifest' ||
    decoded === '/service-worker.js' ||
    /^\/icons\/hairloom-(?:icon\.svg|192\.png|512\.png)$/i.test(decoded) ||
    decoded === '/consultation/' ||
    decoded === '/consultation/index.html' ||
    decoded === '/consultation/styles.css' ||
    decoded === '/consultation/app.mjs' ||
    exploreAllowed ||
    decoded === '/imagen.web.js' ||
    decoded === '/imagen.web.example.js' ||
    decoded === '/src/exploreCore.mjs' ||
    decoded === '/src/trendRegistry.mjs' ||
    decoded === '/src/hairTrendData.mjs' ||
    decoded === '/src/consultationCore.mjs' ||
    decoded === '/src/hairColorPalette.mjs' ||
    decoded === '/src/hairAnalysis.mjs' ||

    decoded === '/docs/hair-design-master/catalog.json' ||
    decoded === '/docs/hair-design-master/catalog-index.json' ||
    /^\/docs\/assets\/(?:samples|test-mannequin|test-mannequin-female)\/[a-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(decoded) ||
    /^\/docs\/assets\/test-subjects\/[a-z0-9._-]+\/[a-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(decoded);

  if (!allowed) return null;
  if (decoded === '/consultation/') decoded = '/consultation/index.html';
  if (decoded === '/explore/') decoded = '/explore/index.html';
  const filePath = resolve(root, `.${decoded}`);
  return filePath.startsWith(root) ? filePath : null;
}

function isTrustedHostHeader(value) {
  if (!value) return true;
  if (Array.isArray(value)) return false;
  if (/[/\\@\s]/.test(value)) return false;

  let parsed;
  try {
    parsed = new URL(`http://${value}`);
  } catch {
    return false;
  }

  return parsed.host.toLowerCase() === value.toLowerCase() && trustedHostnames.has(parsed.hostname);
}

function parseRequestUrl(target) {
  let parsed;
  try {
    parsed = new URL(target || '/', localUrlBase);
  } catch {
    return null;
  }

  return parsed.origin === localUrlBase ? parsed : null;
}

function rejectBadRequest(response) {
  response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Bad request');
}

export function createHairloomServer({ enableExplore = process.env.HAIRLOOM_ENABLE_EXPLORE === '1' } = {}) {
  return createServer((request, response) => {
    if (!isTrustedHostHeader(request.headers.host)) {
      rejectBadRequest(response);
      return;
    }

    const url = parseRequestUrl(request.url);
    if (!url) {
      rejectBadRequest(response);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      response.writeHead(302, {
        location: '/consultation/',
        'cache-control': 'no-store'
      });
      response.end();
      return;
    }

    if (url.pathname === '/healthz') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(JSON.stringify({ ok: true, service: 'hairloom', localOnly: true }));
      return;
    }

    const filePath = resolveStaticPath(url.pathname, enableExplore);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    });
    createReadStream(filePath).pipe(response);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createHairloomServer().listen(port, host, () => {
    console.log(`Hairloom: http://${host}:${port}`);
  });
}
