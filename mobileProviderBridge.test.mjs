import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bridge = await import('./src/mobileProviderBridge.mjs');
const hash = 'a'.repeat(64);

function validSlots() {
  return Array.from({ length: 100 }, (_, slotIndex) => ({
    slotIndex,
    designId: `HLM-F-SHORT-BOB-FRONT-${String(slotIndex).padStart(3, '0')}`,
    generation: 1,
    sourceId: 'source_abcd1234',
    sourceHash: hash,
    sourceViewKey: 'front',
    mirrored: slotIndex % 2 === 1,
    prompt: `Edit hair only for slot ${slotIndex}`
  }));
}

test.afterEach(() => {
  delete globalThis.Capacitor;
});

test('web fallback reports unavailable and never configures a browser secret', async () => {
  assert.equal(bridge.nativeProviderAvailable(), false);
  assert.deepEqual(await bridge.providerStatus(), {
    available: false,
    configured: false,
    provider: 'native-required',
    model: ''
  });
  await assert.rejects(bridge.configureProvider(), { code: 'native-provider-unavailable' });
});

test('source payload is allowlisted and forwarded without provider configuration', async () => {
  let received;
  globalThis.Capacitor = { Plugins: { HairloomProvider: { createSource: async (payload) => { received = payload; return { sourceId: 'source_efgh5678' }; } } } };
  const result = await bridge.createPreparedSource({
    viewKey: 'front',
    sourceHash: hash,
    mimeType: 'image/jpeg',
    base64: 'a'.repeat(64)
  });
  assert.equal(result.sourceId, 'source_efgh5678');
  assert.equal(received.sourceHash, hash);
  assert.equal(Object.hasOwn(received, 'apiKey'), false);
  await assert.rejects(bridge.createPreparedSource({ viewKey: 'front', sourceHash: hash, mimeType: 'image/jpeg', base64: 'a'.repeat(64), apiKey: 'secret' }), /Unexpected source field/);
});

test('prepared sources can be restored only through opaque native handles', async () => {
  let received;
  globalThis.Capacitor = { Plugins: { HairloomProvider: { readSource: async (payload) => { received = payload; return { sourceId: payload.sourceId, dataUrl: 'data:image/jpeg;base64,aaaa' }; } } } };
  const result = await bridge.readPreparedSource('source_abcd1234');
  assert.equal(result.sourceId, 'source_abcd1234');
  assert.deepEqual(received, { sourceId: 'source_abcd1234' });
  await assert.rejects(bridge.readPreparedSource('../secret'), /opaque id/);
});

test('native analysis accepts only an owned source handle and bounded intent', async () => {
  let received;
  globalThis.Capacitor = { Plugins: { HairloomProvider: { runAnalysis: async (payload) => { received = payload; return { catalogLine: 'U', confidence: 0.5 }; } } } };
  const result = await bridge.runNativeAnalysis({ sourceId: 'source_abcd1234', sourceHash: hash, freePrompt: '단발' });
  assert.equal(result.catalogLine, 'U');
  assert.deepEqual(received, { sourceId: 'source_abcd1234', sourceHash: hash, freePrompt: '단발' });
  await assert.rejects(bridge.runNativeAnalysis({ sourceId: 'output_abcd1234', sourceHash: hash, freePrompt: '', url: 'https://example.com' }), /Unexpected analysis field/);
  await assert.rejects(bridge.runNativeAnalysis({ sourceId: 'output_abcd1234', sourceHash: hash, freePrompt: '' }), /source opaque id/);
  await assert.rejects(bridge.runNativeAnalysis({ sourceId: '../secret', sourceHash: hash, freePrompt: '' }), /opaque id/);
  await assert.rejects(bridge.runNativeAnalysis({ sourceId: 'source_abcd1234', sourceHash: hash, freePrompt: 'x'.repeat(501) }), /too long/);
});

test('native batches require exactly 100 immutable slot identities', async () => {
  let received;
  globalThis.Capacitor = { Plugins: { HairloomProvider: { createBatch: async (payload) => { received = payload; return { batchId: payload.batchId }; } } } };
  await assert.rejects(bridge.createNativeBatch({ batchId: 'batch_abcd1234', sourcePhotoKey: 'sourcehash1234', slots: validSlots().slice(0, 99) }), /exactly 100/);
  const duplicate = validSlots();
  duplicate[99].slotIndex = 98;
  await assert.rejects(bridge.createNativeBatch({ batchId: 'batch_abcd1234', sourcePhotoKey: 'sourcehash1234', slots: duplicate }), /unique/);
  const result = await bridge.createNativeBatch({ batchId: 'batch_abcd1234', sourcePhotoKey: 'sourcehash1234', context: { freePrompt: '단발', generationAxes: Array.from({ length: 100 }, (_, slotIndex) => ({ slotIndex, mirrored: false })) }, slots: validSlots() });
  assert.equal(result.batchId, 'batch_abcd1234');
  assert.equal(received.slots.length, 100);
  assert.deepEqual(received.slots.map((slot) => slot.slotIndex), Array.from({ length: 100 }, (_, index) => index));
  assert.equal(received.context.freePrompt, '단발');
  await assert.rejects(bridge.createNativeBatch({ batchId: 'batch_abcd1234', sourcePhotoKey: 'sourcehash1234', context: { apiKey: 'secret' }, slots: validSlots() }), /Unexpected context field/);
});

test('bridge surface contains no browser Provider fetch or credential storage', async () => {
  const source = await readFile(new URL('./src/mobileProviderBridge.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /\/images\/edits/);
  assert.doesNotMatch(source, /Bearer\s/);
});

test('batch listeners degrade to a removable no-op outside native runtime', async () => {
  const handle = await bridge.onNativeBatchEvent(() => {});
  assert.equal(typeof handle.remove, 'function');
  await handle.remove();
});
