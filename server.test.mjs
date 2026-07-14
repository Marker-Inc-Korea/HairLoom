import assert from 'node:assert/strict';
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

test('serves Hairloom page and bundled mannequin assets', async () => {
  const server = createHairloomServer();
  const port = await listen(server);
  try {
    for (const path of ['/', '/imagen.web.example.js', '/docs/assets/test-mannequin/front.png', '/docs/assets/test-mannequin-female/front.png', '/docs/assets/samples/hair-female-soft-bob-only.jpg']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0, path);
    }
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, service: 'hairloom', localOnly: true });
    assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status, 404);
  } finally {
    await close(server);
  }
});
