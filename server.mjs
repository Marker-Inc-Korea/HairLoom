import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4180);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return null;
  }

  const allowed =
    decoded === '/index.html' ||
    decoded === '/imagen.web.js' ||
    decoded === '/imagen.web.example.js' ||
    /^\/docs\/assets\/(?:samples|test-mannequin|test-mannequin-female)\/[a-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(decoded) ||
    /^\/docs\/assets\/test-subjects\/[a-z0-9._-]+\/[a-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(decoded);

  if (!allowed) return null;
  const filePath = resolve(root, `.${decoded}`);
  return filePath.startsWith(root) ? filePath : null;
}

export function createHairloomServer() {
  return createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === '/healthz') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(JSON.stringify({ ok: true, service: 'hairloom', localOnly: true }));
      return;
    }

    const filePath = resolveStaticPath(url.pathname);
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
