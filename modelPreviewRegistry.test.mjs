import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MODEL_PREVIEW_MAX_BYTES,
  MODEL_PREVIEW_MAX_RECORDS,
  MODEL_PREVIEW_MAX_TOTAL_BYTES,
  deleteModelPreview,
  deleteModelPreviews,
  exportModelPreviewArchive,
  importModelPreviewArchive,
  inspectModelPreviewLibrary,
  listModelPreviews,
  modelPreviewContentHash,
  modelPreviewDescriptor,
  modelPreviewAllowedForSlot,
  modelPreviewMatchScore,
  modelPreviewRightsStatus,
  normalizeModelPreviewMetadata,
  saveModelPreview,
  saveModelPreviewBatch,
  selectModelPreview,
  setModelPreviewEnabled,
  setModelPreviewsDesignRefs,
  setModelPreviewsEnabled,
  subscribeModelPreviewChanges
} from './src/modelPreviewRegistry.mjs';

const HASH_A = 'a'.repeat(64);

function preview(overrides = {}) {
  return normalizeModelPreviewMetadata({
    id: 'HLM-MP-1234ABCD',
    schemaVersion: 2,
    title: '강남점 미디엄 웨이브',
    genderId: 'F',
    lengthIds: ['MD'],
    textureBuckets: [1],
    sourceKind: 'salon',
    rightsBasis: 'model-consented',
    attribution: 'Hairloom Salon · model release 2026-08',
    sourceUrl: '',
    consentConfirmed: true,
    imageMime: 'image/jpeg',
    imageBytes: 1024,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    consentVerifiedAt: '2026-08-02',
    rightsExpiresAt: '',
    revokedAt: '',
    rightsReference: 'RELEASE-001',
    reviewedBy: '강남점 관리자',
    designRefs: [],
    focalX: 0.5,
    focalY: 0.45,
    contentHash: HASH_A,
    displayOnly: true,
    enabled: true,
    ...overrides
  });
}

const femaleMediumWave = {
  id: 'HLM-C-F-MD-01-NH-NW',
  genderId: 'F',
  lengthId: 'MD',
  vector: { gender: 1, length: 2, textureBucket: 1 }
};

function createMemoryIndexedDb() {
  const records = new Map();
  let opened = false;
  let nextWriteError = null;
  const schedule = (callback) => setTimeout(callback, 0);
  const request = (valueFactory) => {
    const result = {};
    schedule(() => {
      try {
        result.result = valueFactory();
        result.onsuccess?.();
      } catch (error) {
        result.error = error;
        result.onerror?.();
      }
    });
    return result;
  };
  const database = {
    objectStoreNames: { contains: () => opened },
    createObjectStore: () => { opened = true; },
    close() {},
    onversionchange: null,
    transaction() {
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          const complete = () => schedule(() => transaction.oncomplete?.());
          const failWrite = () => {
            if (!nextWriteError) return null;
            const error = nextWriteError;
            nextWriteError = null;
            transaction.error = error;
            schedule(() => transaction.onerror?.());
            return error;
          };
          return {
            getAll() { return request(() => [...records.values()]); },
            put(row) {
              const error = failWrite();
              if (error) return request(() => { throw error; });
              records.set(row.id, row);
              complete();
              return request(() => row.id);
            },
            delete(id) {
              const error = failWrite();
              if (error) return request(() => { throw error; });
              records.delete(id);
              complete();
              return request(() => undefined);
            }
          };
        }
      };
      return transaction;
    }
  };
  return {
    records,
    failNextWrite(error = new Error('IndexedDB quota denied')) { nextWriteError = error; },
    open() {
      const openRequest = {};
      schedule(() => {
        openRequest.result = database;
        if (!opened) openRequest.onupgradeneeded?.();
        opened = true;
        openRequest.onsuccess?.();
      });
      return openRequest;
    }
  };
}

function installMemoryIndexedDb() {
  const database = createMemoryIndexedDb();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: database });
  return database;
}

function jpegBlob(seed = 'image') {
  return new Blob([new TextEncoder().encode(seed)], { type: 'image/jpeg' });
}

function metadata(title, overrides = {}) {
  return {
    title,
    genderId: 'F',
    lengthIds: ['MD'],
    textureBuckets: [1],
    sourceKind: 'salon',
    rightsBasis: 'model-consented',
    attribution: 'Hairloom test release',
    sourceUrl: '',
    consentConfirmed: true,
    consentVerifiedAt: '2026-08-03',
    rightsExpiresAt: '',
    rightsReference: 'TEST-001',
    reviewedBy: '테스트 관리자',
    designRefs: [],
    focalX: 0.5,
    focalY: 0.5,
    enabled: true,
    ...overrides
  };
}

test('model preview metadata v2 requires rights, consent, hashes, and safe local image metadata', () => {
  const normalized = preview();
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.displayOnly, true);
  assert.equal(normalized.genderId, 'F');
  assert.deepEqual(normalized.lengthIds, ['MD']);
  assert.deepEqual(normalized.textureBuckets, [1]);
  assert.equal(normalized.focalY, 0.45);
  assert.throws(() => preview({ consentConfirmed: false }), /rights and model consent/);
  assert.throws(() => preview({ sourceKind: 'web', sourceUrl: 'http://example.test/model.jpg' }), /HTTPS URL/);
  assert.throws(() => preview({ sourceKind: 'web', sourceUrl: 'https://user:secret@example.test/model.jpg' }), /credential-free/);
  assert.throws(() => preview({ imageMime: 'image/svg+xml' }), /JPEG, PNG, or WebP/);
  assert.throws(() => preview({ imageBytes: MODEL_PREVIEW_MAX_BYTES + 1 }), /image must be/);
  assert.throws(() => preview({ focalX: 1.1 }), /from 0 to 1/);
  assert.throws(() => preview({ contentHash: 'bad' }), /SHA-256/);
  assert.throws(() => preview({ designRefs: ['INVALID'] }), /designRef/);
  assert.equal(MODEL_PREVIEW_MAX_RECORDS, 80);
  assert.equal(MODEL_PREVIEW_MAX_TOTAL_BYTES, 160 * 1024 * 1024);
  assert.throws(() => preview({ displayOnly: false }), /display-only/);
  assert.throws(() => preview({ unknownField: true }), /Unknown model preview field/);
});

test('schema v1 records migrate with conservative rights and focal defaults', () => {
  const migrated = normalizeModelPreviewMetadata({
    id: 'HLM-MP-11111111', schemaVersion: 1, title: '기존 모델', genderId: 'U', lengthIds: [], textureBuckets: [], sourceKind: 'salon', rightsBasis: 'salon-owned', attribution: '기존 살롱 기록', sourceUrl: '', consentConfirmed: true, imageMime: 'image/jpeg', imageBytes: 10, createdAt: '2026-07-01T00:00:00.000Z', displayOnly: true, enabled: true
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.consentVerifiedAt, '2026-07-01T00:00:00.000Z');
  assert.equal(migrated.updatedAt, migrated.createdAt);
  assert.equal(migrated.focalX, 0.5);
  assert.equal(migrated.focalY, 0.5);
  assert.deepEqual(migrated.designRefs, []);
});

test('rights lifecycle excludes expired, revoked, and disabled previews', () => {
  const active = preview({ rightsExpiresAt: '2026-12-31' });
  const expired = preview({ id: 'HLM-MP-00000002', consentVerifiedAt: '2026-07-01', rightsExpiresAt: '2026-08-01' });
  const revoked = preview({ id: 'HLM-MP-00000003', revokedAt: '2026-08-02T00:00:00.000Z', enabled: false });
  const disabled = preview({ id: 'HLM-MP-00000004', enabled: false });
  const now = '2026-08-03T00:00:00.000Z';
  assert.equal(modelPreviewRightsStatus(active, now), 'active');
  assert.equal(modelPreviewRightsStatus(expired, now), 'expired');
  assert.equal(modelPreviewRightsStatus(revoked, now), 'revoked');
  assert.equal(modelPreviewRightsStatus(disabled, now), 'disabled');
  assert.equal(modelPreviewMatchScore(expired, femaleMediumWave, now), Number.NEGATIVE_INFINITY);
  assert.equal(modelPreviewMatchScore(revoked, femaleMediumWave, now), Number.NEGATIVE_INFINITY);
});

test('registered previews are allowed only for queued and active slots', () => {
  assert.equal(modelPreviewAllowedForSlot('queued'), true);
  assert.equal(modelPreviewAllowedForSlot('active'), true);
  for (const status of ['ready', 'done', 'failed', 'aborted', 'superseded', 'pending', '']) {
    assert.equal(modelPreviewAllowedForSlot(status), false, status);
  }
});

test('registered model selection is deterministic and honors stable design references', () => {
  const generic = preview({ id: 'HLM-MP-00000001', genderId: 'U', lengthIds: [], textureBuckets: [], contentHash: '1'.repeat(64) });
  const exact = preview({ id: 'HLM-MP-00000002', designRefs: ['HLM-C-F-MD-01-NH'], contentHash: '2'.repeat(64) });
  const wrongRef = preview({ id: 'HLM-MP-00000003', designRefs: ['HLM-C-F-S-02'], contentHash: '3'.repeat(64) });
  assert.deepEqual(modelPreviewDescriptor(femaleMediumWave), { id: femaleMediumWave.id, genderId: 'F', lengthId: 'MD', textureBucket: 1 });
  assert.ok(modelPreviewMatchScore(exact, femaleMediumWave) > modelPreviewMatchScore(generic, femaleMediumWave));
  assert.equal(modelPreviewMatchScore(wrongRef, femaleMediumWave), Number.NEGATIVE_INFINITY);
  assert.equal(selectModelPreview([generic, wrongRef, exact], femaleMediumWave, 17)?.id, exact.id);
  assert.equal(selectModelPreview([generic, wrongRef, exact], femaleMediumWave, 17)?.id, exact.id);
});

test('IndexedDB lifecycle deduplicates images, isolates malformed rows, and propagates enable/delete state', async () => {
  const memory = installMemoryIndexedDb();
  const firstBlob = jpegBlob('first-image');
  const first = await saveModelPreview(metadata('첫 모델'), firstBlob);
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
  await assert.rejects(() => saveModelPreview(metadata('중복 모델'), firstBlob), /이미 등록/);
  memory.records.set('broken', { id: 'broken', blob: { size: 10 } });
  let inspection = await inspectModelPreviewLibrary();
  assert.equal(inspection.records.length, 1);
  assert.equal(inspection.invalidCount, 1);
  await setModelPreviewEnabled(first.id, false);
  assert.equal(modelPreviewRightsStatus((await listModelPreviews())[0]), 'revoked');
  await setModelPreviewEnabled(first.id, true);
  assert.equal(modelPreviewRightsStatus((await listModelPreviews())[0]), 'active');
  assert.equal(await deleteModelPreview(first.id), true);
  assert.equal((await listModelPreviews()).length, 0);
});

test('bulk registration is atomic when a duplicate exists', async () => {
  installMemoryIndexedDb();
  await saveModelPreview(metadata('기존 모델'), jpegBlob('existing-bulk-image'));
  await assert.rejects(() => saveModelPreviewBatch([
    { metadata: metadata('새 모델'), blob: jpegBlob('new-bulk-image') },
    { metadata: metadata('중복 모델'), blob: jpegBlob('existing-bulk-image') }
  ]), /중복/);
  const records = await listModelPreviews();
  assert.equal(records.length, 1);
  assert.equal(records[0].title, '기존 모델');
});

test('bulk management updates tags and rights atomically before confirmed deletion', async () => {
  installMemoryIndexedDb();
  const saved = await saveModelPreviewBatch([
    { metadata: metadata('일괄 모델 A'), blob: jpegBlob('bulk-manage-a') },
    { metadata: metadata('일괄 모델 B'), blob: jpegBlob('bulk-manage-b') }
  ]);
  const ids = saved.map((record) => record.id);
  await assert.rejects(() => setModelPreviewsEnabled([ids[0], 'HLM-MP-FFFFFFFF'], false), /찾을 수 없습니다/);
  assert.ok((await listModelPreviews()).every((record) => modelPreviewRightsStatus(record) === 'active'));
  await setModelPreviewsEnabled(ids, false);
  assert.ok((await listModelPreviews()).every((record) => modelPreviewRightsStatus(record) === 'revoked'));
  await setModelPreviewsDesignRefs(ids, ['HLM-C-F-MD-01-NH']);
  assert.ok((await listModelPreviews()).every((record) => record.designRefs[0] === 'HLM-C-F-MD-01-NH'));
  await setModelPreviewsEnabled(ids, true);
  assert.ok((await listModelPreviews()).every((record) => modelPreviewRightsStatus(record) === 'active'));
  assert.equal(await deleteModelPreviews(ids), 2);
  assert.equal((await listModelPreviews()).length, 0);
});

test('concurrent writes serialize duplicate detection and preserve later metadata updates', async () => {
  installMemoryIndexedDb();
  const sharedBlob = jpegBlob('concurrent-shared-image');
  const results = await Promise.allSettled([
    saveModelPreview(metadata('동시 모델 A'), sharedBlob),
    saveModelPreview(metadata('동시 모델 B'), sharedBlob)
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /이미 등록/);
  const [saved] = await listModelPreviews();
  await Promise.all([
    setModelPreviewsEnabled([saved.id], false),
    setModelPreviewsDesignRefs([saved.id], ['HLM-C-F-MD-01-NH'])
  ]);
  const [updated] = await listModelPreviews();
  assert.equal(modelPreviewRightsStatus(updated), 'revoked');
  assert.deepEqual(updated.designRefs, ['HLM-C-F-MD-01-NH']);
});

test('storage count and byte ceilings fail before persistence', async () => {
  const memory = installMemoryIndexedDb();
  for (let index = 0; index < MODEL_PREVIEW_MAX_RECORDS; index += 1) {
    memory.records.set(`HLM-MP-${index.toString(16).padStart(8, '0').toUpperCase()}`, { id: `invalid-${index}`, imageBytes: 1, blob: { size: 1 } });
  }
  await assert.rejects(() => saveModelPreview(metadata('초과 모델'), jpegBlob('over-count')), /최대 80장/);
  const byteMemory = installMemoryIndexedDb();
  byteMemory.records.set('oversized-invalid', { id: 'oversized-invalid', blob: { size: MODEL_PREVIEW_MAX_TOTAL_BYTES } });
  await assert.rejects(() => saveModelPreview(metadata('용량 초과'), jpegBlob('over-bytes')), /160MB/);
});

test('IndexedDB quota failure is visible and leaves no partial record', async () => {
  const memory = installMemoryIndexedDb();
  const quotaError = new Error('IndexedDB quota denied');
  quotaError.name = 'QuotaExceededError';
  memory.failNextWrite(quotaError);
  await assert.rejects(() => saveModelPreview(metadata('할당량 실패 모델'), jpegBlob('quota-failure')), /quota denied/);
  assert.equal(memory.records.size, 0);
});

test('encrypted archives round-trip without plaintext photos and reject wrong passwords or tampering', async () => {
  installMemoryIndexedDb();
  const sourceBlob = jpegBlob('archive-private-image');
  const sourceHash = await modelPreviewContentHash(sourceBlob);
  await saveModelPreview(metadata('보관 모델', { designRefs: ['HLM-C-F-MD-01-NH'] }), sourceBlob);
  const archive = await exportModelPreviewArchive('correct horse battery');
  const envelopeText = await archive.text();
  assert.doesNotMatch(envelopeText, /archive-private-image/);
  assert.match(envelopeText, /AES-GCM/);
  await assert.rejects(() => importModelPreviewArchive(archive, 'wrong password value'), /암호가 틀렸거나/);
  const envelope = JSON.parse(envelopeText);
  envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
  await assert.rejects(() => importModelPreviewArchive(new Blob([JSON.stringify(envelope)], { type: archive.type }), 'correct horse battery'), /암호가 틀렸거나/);
  installMemoryIndexedDb();
  const imported = await importModelPreviewArchive(archive, 'correct horse battery');
  assert.deepEqual(imported, { imported: 1, skipped: 0 });
  const restored = await listModelPreviews();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].contentHash, sourceHash);
  assert.deepEqual(restored[0].designRefs, ['HLM-C-F-MD-01-NH']);
  const duplicate = await importModelPreviewArchive(archive, 'correct horse battery');
  assert.deepEqual(duplicate, { imported: 0, skipped: 1 });
});

test('same-origin change subscription reports completed persistence events', async () => {
  installMemoryIndexedDb();
  class MemoryChannel {
    static channels = new Set();
    constructor() { MemoryChannel.channels.add(this); }
    postMessage(value) { for (const channel of MemoryChannel.channels) if (channel !== this) setTimeout(() => channel.onmessage?.({ data: value }), 0); }
    close() { MemoryChannel.channels.delete(this); }
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: MemoryChannel });
  const changes = [];
  const unsubscribe = subscribeModelPreviewChanges((change) => changes.push(change.type));
  const saved = await saveModelPreview(metadata('동기화 모델'), jpegBlob('sync-image'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await deleteModelPreview(saved.id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  unsubscribe();
  assert.deepEqual(changes, ['add', 'delete']);
});

test('unavailable change channels never reverse completed preview persistence', async () => {
  installMemoryIndexedDb();
  const previousChannel = globalThis.BroadcastChannel;
  class BrokenChannel { constructor() { throw new Error('channel unavailable'); } }
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: BrokenChannel });
  try {
    const unsubscribe = subscribeModelPreviewChanges(() => {});
    const saved = await saveModelPreview(metadata('채널 장애 모델'), jpegBlob('channel-failure'));
    unsubscribe();
    assert.equal((await listModelPreviews())[0].id, saved.id);
  } finally {
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: previousChannel });
  }
});

test('Explore and PRO keep previews optional, queued/active-only, synchronized, and original-input-only', async () => {
  const [explore, pro, manager, proStyles, managerHtml, managerStyles] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./consultation/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./model-previews/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./consultation/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('./model-previews/index.html', import.meta.url), 'utf8'),
    readFile(new URL('./model-previews/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(explore, /modelPreviewAllowedForSlot\(state\)/);
  assert.match(pro, /modelPreviewAllowedForSlot\(slot\.status\)/);
  assert.match(explore, /subscribeModelPreviewChanges/);
  assert.match(pro, /subscribeModelPreviewChanges/);
  assert.match(explore, /modelPreviewRegistryReady=.*\.catch\(\(\)=>null\)/);
  assert.match(pro, /modelPreviewRegistryReady = import[^\n]+\.catch\(\(\) => null\)/);
  assert.match(explore, /pagehide',event=>\{if\(event\.persisted\)return/);
  assert.match(pro, /if \(event\.persisted\) return/);
  assert.match(manager, /if \(event\.persisted\) return/);
  assert.match(explore, /등록 모델 · \$\{previewState\}/);
  assert.match(pro, /등록 모델 · \$\{previewState\}/);
  assert.match(explore, /form\.append\('image',EX\.preparedFrontBlob/);
  assert.match(pro, /form\.append\('image', inputs\.sourceBlob/);
  assert.doesNotMatch(explore, /form\.append\('image',[^\n]*(?:modelPreview|registeredPreview)/i);
  assert.doesNotMatch(pro, /form\.append\('image',[^\n]*(?:modelPreview|registeredPreview)/i);
  assert.match(manager, /exportModelPreviewArchive/);
  assert.match(manager, /importModelPreviewArchive/);
  assert.match(manager, /navigator\.storage/);
  assert.match(manager, /multiple/);
  assert.match(manager, /setModelPreviewsEnabled/);
  assert.doesNotMatch(managerHtml, /bulkApplyDesignRefs|디자인 ID|DISPLAY ONLY|Design Lock/);
  assert.match(manager, /deleteModelPreviews/);
  assert.match(manager, /selectVisible/);
  assert.match(managerHtml, /class="photo-picker"/);
  assert.match(managerHtml, /사진 사용 정보/);
  assert.match(manager, /const requestedTitle/);
  assert.match(manager, /fileTitle\(file\)/);
  assert.match(proStyles, /font-size:9px/);
  assert.match(manager, /AbortController/);
  assert.match(manager, /20000/);
  assert.match(managerHtml, /aria-live="polite"/);
  assert.match(managerHtml, /autocomplete="new-password"/);
  assert.match(managerStyles, /focus-visible/);
  assert.match(managerStyles, /font-size:9px/);
  assert.match(explore, /registered-model-label[^\n]+font-size:9px/);
});
