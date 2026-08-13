const CACHE_NAME = 'hairloom-shell-v5';
const SHELL_PATHS = new Set([
  '/consultation/',
  '/consultation/index.html',
  '/consultation/styles.css',
  '/consultation/app.mjs',
  '/manifest.webmanifest',
  '/icons/hairloom-icon.svg',
  '/icons/hairloom-192.png',
  '/icons/hairloom-512.png',
  '/src/exploreCore.mjs',
  '/src/consultationCore.mjs',
  '/src/hairAnalysis.mjs',
  '/src/hairColorPalette.mjs',
  '/src/trendRegistry.mjs',
  '/src/hairTrendData.mjs',
  '/src/mobileProviderBridge.mjs',
]);
const NEVER_CACHE_PREFIXES = Object.freeze([
  '/healthz',
  '/explore/',
  '/model-previews/',
  '/imagen.web.js',
  '/api/',
  '/v1/',
  '/saved-edits/',
  '/data/',
  '/docs/assets/test-subjects/'
]);

function shellPath(url) {
  return url.origin === self.location.origin && SHELL_PATHS.has(url.pathname);
}

function neverCache(request, url) {
  if (request.method !== 'GET') return true;
  if (!['http:', 'https:'].includes(url.protocol)) return true;
  if (url.origin !== self.location.origin) return true;
  if (NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  if (request.headers.has('authorization')) return true;
  return false;
}

async function cacheShellResponse(request, response) {
  if (!response?.ok || response.type === 'opaque') return response;
  const url = new URL(request.url);
  if (!shellPath(url)) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return cacheShellResponse(request, response);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return cache.match(request) ?? cache.match('/consultation/index.html') ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => cacheShellResponse(request, response)).catch(() => null);
  return cached ?? refresh ?? Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([
    '/manifest.webmanifest',
    '/icons/hairloom-icon.svg',
    '/icons/hairloom-192.png',
    '/icons/hairloom-512.png'
  ])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('hairloom-') && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (neverCache(request, url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (shellPath(url)) event.respondWith(staleWhileRevalidate(request));
});
