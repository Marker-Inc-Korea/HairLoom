import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_EXPLORE_ACTIVE,
  applyQueueCompletion,
  catalogVersion,
  buildExploreCacheKey,
  catalogRecordToDesignLockCut,
  createExploreBatch,
  defaultExploreSettings,
  detectImageMime,
  filterFeasible,
  genderLineTreatmentPrompt,
  normalizeProviderResult,
  normalizeSettings,
  passesDamageCondition,
  selectDiverse100,
  selectNeighbor100,
  exploreCompletionAcceptance,
  sourcePhotoKey,
  promptVersion,
  stableHash32,
  stableSettingsString,
  startQueuedItems,
  supersedeBatch,
  validateCatalogIndex,
  validateExploreHandoffPayload,
  validateShortlist
} from './src/exploreCore.mjs';

function rec(id, overrides = {}) {
  const n = Number(String(id).match(/(\d+)/)?.[1] ?? 0);
  return {
    id: `HLM-C-${String(id).padStart(3, '0')}`,
    kind: 'core',
    nameKo: `스타일 ${id}`,
    featureKo: '명시적 테스트 스타일',
    landmarkKo: '턱 아래~쇄골',
    signature: String(id).padStart(3, '0'),
    promptAtoms: { titleKo: '타이틀', structureKo: '구조', safetyKo: '안전' },
    feasibility: {
      lengthOrderMin: 0,
      lengthOrderMax: 4,
      targetLengthOrder: n % 5,
      maxLengthJumpFromCurrent: 4,
      suitableThickness: ['fine', 'normal', 'thick'],
      damageCeiling: 'low',
      requiresPerm: false,
      permIntensity: 0,
      requiresExtensionOrPiece: false,
      specialFamilyRisk: 0,
      hardDenyWhenExtensionsDenied: false,
      ...overrides.feasibility
    },
    vector: {
      length: n % 5,
      kind: 0,
      gender: n % 3,
      baseBucket: n % 11,
      frontBucket: n % 7,
      finishBucket: n % 13,
      textureBucket: n % 5,
      permBucket: 0,
      specialFamilyBucket: 0,
      editorialRisk: 0,
      ...overrides.vector
    },
    ...overrides.record
  };
}

function catalog(count = 140) {
  return Array.from({ length: count }, (_, index) => rec(index + 1));
}

const settings = defaultExploreSettings();

test('settings normalize exact six defaults, damage alias, and reject seventh setting', () => {
  assert.deepEqual(defaultExploreSettings(), {
    currentLength: 2,
    hairThickness: 'normal',
    damageCondition: 'medium',
    permAllowed: true,
    extensionAllowed: false,
    similarity: 2
  });
  assert.deepEqual(normalizeSettings({ damage: 'high' }), { ...defaultExploreSettings(), damageCondition: 'high' });
  assert.equal(Object.keys(normalizeSettings({})).length, 6);
  assert.throws(() => normalizeSettings({ tolerance: 'wide' }), /Unknown Explore setting/);
});

test('gender line treatment keeps distinct masculine and feminine hair geometry', () => {
  const masculine = genderLineTreatmentPrompt('M');
  const feminine = genderLineTreatmentPrompt('female');
  assert.match(masculine, /MASCULINE LINE TREATMENT/);
  assert.match(masculine, /stronger directional planes/);
  assert.match(masculine, /clean decisive nape/);
  assert.match(feminine, /FEMININE LINE TREATMENT/);
  assert.match(feminine, /softer connected arcs/);
  assert.match(feminine, /nuanced face-framing/);
  assert.notEqual(masculine, feminine);
  assert.match(masculine, /hair only; never alter the face, body, or identity/);
  assert.match(feminine, /hair only; never alter the face, body, or identity/);
  assert.match(genderLineTreatmentPrompt('U'), /GENDER-NEUTRAL LINE TREATMENT/);
});

test('banned face keys are rejected without rejecting hair landmarks', () => {
  assert.throws(() => normalizeSettings({ faceRatio: 0.3 }), /Banned face/);
  assert.throws(() => validateCatalogIndex([rec(1, { record: { faceShape: 'oval' } })]), /Banned face/);
  assert.equal(validateCatalogIndex([rec(1, { record: { landmarkKo: '턱 아래~쇄골' } })]).length, 1);
});

test('stable FNV-1a hash uses known vector', () => {
  assert.equal(stableHash32('hello'), 0x4f9f2cab);
  assert.equal(stableHash32(''), 0x811c9dc5);
});

test('damage feasibility is monotonic and medium excludes high-risk records', () => {
  const records = [
    rec(1),
    rec(2, { feasibility: { damageCeiling: 'high' } }),
    rec(3, { feasibility: { requiresPerm: true, permIntensity: 2, damageCeiling: 'medium' }, vector: { permBucket: 2 } }),
    rec(4, { feasibility: { specialFamilyRisk: 3, damageCeiling: 'medium' } }),
    rec(5, { vector: { editorialRisk: 2 } }),
    rec(6, { feasibility: { requiresExtensionOrPiece: true, damageCeiling: 'low' } })
  ];
  const low = new Set(records.filter((record) => passesDamageCondition(record, { ...settings, damageCondition: 'low' })).map((record) => record.id));
  const medium = new Set(records.filter((record) => passesDamageCondition(record, { ...settings, damageCondition: 'medium' })).map((record) => record.id));
  const high = new Set(records.filter((record) => passesDamageCondition(record, { ...settings, damageCondition: 'high' })).map((record) => record.id));
  for (const id of medium) assert.ok(low.has(id));
  for (const id of high) assert.ok(medium.has(id));
  for (const id of ['HLM-C-002', 'HLM-C-003', 'HLM-C-004', 'HLM-C-005']) assert.equal(medium.has(id), false);
});

test('high damage excludes perm and extension records regardless toggles', () => {
  const perm = rec(10, { feasibility: { requiresPerm: true, permIntensity: 1, damageCeiling: 'low' }, vector: { permBucket: 1 } });
  const extension = rec(11, { feasibility: { requiresExtensionOrPiece: true, damageCeiling: 'low' } });
  const hard = rec(12, { feasibility: { hardDenyWhenExtensionsDenied: true, damageCeiling: 'low' } });
  const highAllowed = { ...settings, damageCondition: 'high', permAllowed: true, extensionAllowed: true };
  assert.equal(passesDamageCondition(perm, highAllowed), false);
  assert.equal(passesDamageCondition(extension, highAllowed), false);
  assert.equal(passesDamageCondition(hard, highAllowed), false);
});

test('selection is deterministic, diverse, unique, capped at 100, and reports underflow', () => {
  const records = catalog(130);
  const first = selectDiverse100(records, settings, 'source-photo-key');
  const second = selectDiverse100(records, settings, 'source-photo-key');
  assert.deepEqual(first.designIds, second.designIds);
  assert.equal(first.designIds.length, 100);
  assert.equal(new Set(first.designIds).size, 100);
  assert.ok(new Set(first.records.map((record) => record.vector.length)).size >= 3);
  const short = selectDiverse100(catalog(12), settings, 'source-photo-key');
  assert.equal(short.underflow, true);
  assert.equal(short.designIds.length, 12);
});

test('neighbor selection puts clicked feasible id in slot 0 and excludes invalid clicked id', () => {
  const records = catalog(130);
  const clicked = records[75].id;
  const result = selectNeighbor100(records, settings, clicked, 'source');
  assert.equal(result.designIds[0], clicked);
  assert.equal(result.clickedExcluded, false);
  assert.equal(new Set(result.designIds).size, result.designIds.length);
  const invalid = rec(999, { feasibility: { damageCeiling: 'high' } });
  const excluded = selectNeighbor100([...records, invalid], settings, invalid.id, 'source');
  assert.notEqual(excluded.designIds[0], invalid.id);
  assert.equal(excluded.clickedExcluded, true);
});

test('neighbor selection keeps hard-valid clicked design in slot 0 even when soft-excluded', () => {
  const records = catalog(130);
  const clicked = rec(900, { feasibility: { targetLengthOrder: 0, suitableThickness: ['thick'], specialFamilyRisk: 1 } });
  const result = selectNeighbor100([...records, clicked], settings, clicked.id, 'source');
  assert.equal(result.designIds[0], clicked.id);
  assert.equal(result.clickedExcluded, false);
  assert.equal(new Set(result.designIds).size, result.designIds.length);
  assert.ok(result.records.every((record) => record.id === clicked.id || record.feasibility.damageCeiling !== 'high'));
});

test('cache key and stable settings string use dc=', () => {
  const serialized = stableSettingsString({ damage: 'high' });
  assert.match(serialized, /dc=high/);
  assert.doesNotMatch(serialized, /damage=/);
  const key = buildExploreCacheKey({ sourcePhotoKey: 'abc123', settings: { damage: 'high' } });
  assert.match(key, /^hlm:explore:v2:HLM-MASTER-2026-07-EXPLORE-2:HLM-EXPLORE-PROMPT-2026-07-4:abc123:/);
});

test('queue starts deterministic random positions, caps at 32, and preserves stable slots', () => {
  const input = { batchId: 'b1', designIds: catalog(40).map((record) => record.id), sourcePhotoKey: 'src', settings };
  const active = startQueuedItems(createExploreBatch(input), 99);
  const repeated = startQueuedItems(createExploreBatch(input), 99);
  const activeIndices = active.queue.filter((item) => item.status === 'active').map((item) => item.slotIndex).sort((a, b) => a - b);
  assert.equal(active.activeCount, MAX_EXPLORE_ACTIVE);
  assert.equal(activeIndices.length, 32);
  assert.deepEqual(activeIndices, repeated.queue.filter((item) => item.status === 'active').map((item) => item.slotIndex).sort((a, b) => a - b));
  assert.notDeepEqual(activeIndices, Array.from({ length: 32 }, (_, index) => index));
  const activeSlotIndex = activeIndices[5];
  const completed = applyQueueCompletion(active, { ok: true, batchId: 'b1', designId: active.slots[activeSlotIndex].designId, slotIndex: activeSlotIndex, sourcePhotoKey: 'src', promptVersion: active.promptVersion, url: 'blob:ready' });
  assert.equal(completed.slots[activeSlotIndex].status, 'ready');
  assert.equal(completed.slots[activeSlotIndex].imageUrl, 'blob:ready');
  const stale = applyQueueCompletion(completed, { ok: true, batchId: 'old', designId: completed.slots[6].designId, slotIndex: 6, sourcePhotoKey: 'src', promptVersion: completed.promptVersion, url: 'blob:old' });
  assert.equal(stale.staleIgnored, 1);
  assert.notEqual(stale.slots[6].imageUrl, 'blob:old');
  const superseded = supersedeBatch(active, 'b2');
  assert.equal(superseded.queue.every((item) => item.status === 'aborted'), true);
});

test('superseded completion is rejected and reports non-cacheable protection metadata', () => {
  const active = startQueuedItems(createExploreBatch({ batchId: 'b1', designIds: catalog(40).map((record) => record.id), sourcePhotoKey: 'src', settings }), 32);
  const superseded = supersedeBatch(active, 'route-exit-1');
  const completion = { ok: true, batchId: 'b1', designId: superseded.slots[0].designId, slotIndex: 0, sourcePhotoKey: 'src', promptVersion: superseded.promptVersion, url: 'blob:late' };
  const acceptance = exploreCompletionAcceptance(superseded, completion);
  assert.deepEqual(acceptance, { accepted: false, cacheable: false, terminal: false, duplicate: false, supersededBy: 'route-exit-1' });
  const rejected = applyQueueCompletion(superseded, completion);
  assert.equal(rejected.completedCount, 0);
  assert.equal(rejected.slots[0].imageUrl, null);
  assert.equal(rejected.staleIgnored, 1);
});

test('duplicate terminal completion is idempotent and does not re-increment counters', () => {
  const active = startQueuedItems(createExploreBatch({ batchId: 'b1', designIds: catalog(40).map((record) => record.id), sourcePhotoKey: 'src', settings }), 32);
  const completion = { ok: true, batchId: 'b1', designId: active.slots[5].designId, slotIndex: 5, sourcePhotoKey: 'src', promptVersion: active.promptVersion, url: 'blob:first' };
  const completed = applyQueueCompletion(active, completion);
  const duplicate = { ...completion, url: 'blob:duplicate' };
  const acceptance = exploreCompletionAcceptance(completed, duplicate);
  assert.equal(acceptance.accepted, false);
  assert.equal(acceptance.cacheable, false);
  assert.equal(acceptance.terminal, true);
  const repeated = applyQueueCompletion(completed, duplicate);
  assert.equal(repeated.completedCount, 1);
  assert.equal(repeated.failedCount, 0);
  assert.equal(repeated.activeCount, completed.activeCount);
  assert.equal(repeated.slots[5].imageUrl, 'blob:first');
  assert.equal(repeated.staleIgnored, 1);
});

test('MIME magic-byte detection and provider normalization handle JPEG PNG WebP', () => {
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff])), 'image/jpeg');
  assert.equal(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp');
  const jpeg = normalizeProviderResult({ b64_json: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), providerStatus: 201 }, { designId: 'HLM-C-001', batchId: 'b', slotIndex: 0 });
  assert.equal(jpeg.mimeType, 'image/jpeg');
  assert.equal(jpeg.providerKind, 'b64_json');
  const url = normalizeProviderResult({ url: 'https://cdn/result.webp', mimeType: 'image/webp', bytes: 10 }, { designId: 'HLM-C-001', batchId: 'b', slotIndex: 0 });
  assert.equal(url.providerKind, 'url');
});

test('shortlist validates 1–6 ids and rejects generated artifact handoff', () => {
  const records = catalog(8);
  const byId = new Map(records.map((record) => [record.id, record]));
  assert.equal(validateShortlist(records.slice(0, 6).map((record) => record.id), byId, settings).length, 6);
  assert.throws(() => validateShortlist([], byId, settings), /1–6/);
  assert.throws(() => validateShortlist(records.slice(0, 7).map((record) => record.id), byId, settings), /1–6/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', generatedImageUrl: 'blob:bad', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion, promptVersion }), /Generated Explore artifacts/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', modelPreviewUrl: 'blob:display-only', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion, promptVersion }), /Generated Explore artifacts/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings }), /catalogVersion must be/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion }), /promptVersion must be/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion: 'stale-catalog', promptVersion }), /catalogVersion must be/);
  assert.throws(() => validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion, promptVersion: 'stale-prompt' }), /promptVersion must be/);
  const payload = validateExploreHandoffPayload({ frontOriginalDataUrl: 'data:image/jpeg;base64,aaa', selectedDesignIds: [records[0].id], catalogRecordsById: byId, exploreSettings: settings, catalogVersion, promptVersion });
  assert.equal(payload.selectedRecords[0].id, records[0].id);
});

test('catalog record maps to Design Lock prompt blueprint helper inputs', () => {
  const cut = catalogRecordToDesignLockCut(rec(33));
  assert.equal(cut.hs, 'HLM-C-033');
  assert.equal(cut.catalogRecord.id, 'HLM-C-033');
  assert.equal(cut.promptBlueprint.sourceLineage, 'original-photos-only');
  assert.deepEqual(cut.promptBlueprint.angleLocks, ['front', 'side', 'back']);
});

test('source photo key returns sha-256 metadata key', async () => {
  const key = await sourcePhotoKey(Uint8Array.from([1, 2, 3]), 'image/jpeg');
  assert.match(key, /^[0-9a-f]{64}:image\/jpeg:3$/);
});

test('catalog index validation can enforce exact 6500 ids', () => {
  assert.throws(() => validateCatalogIndex(catalog(2), { total: 6500 }), /6500/);
  assert.throws(() => validateCatalogIndex([rec(1), rec(1)]), /Duplicate/);
});

test('hard feasibility damage subsets never widen during relaxation', () => {
  const records = [
    ...catalog(30),
    rec(1001, { feasibility: { damageCeiling: 'high' } }),
    rec(1002, { feasibility: { requiresPerm: true, permIntensity: 3, damageCeiling: 'medium' }, vector: { permBucket: 3 } }),
    rec(1003, { feasibility: { requiresExtensionOrPiece: true, damageCeiling: 'low' } })
  ];
  const low = new Set(filterFeasible(records, { ...settings, damageCondition: 'low', extensionAllowed: true }).hardPassed.map((record) => record.id));
  const medium = new Set(filterFeasible(records, { ...settings, damageCondition: 'medium', extensionAllowed: true }).hardPassed.map((record) => record.id));
  const high = new Set(filterFeasible(records, { ...settings, damageCondition: 'high', extensionAllowed: true, permAllowed: true }).hardPassed.map((record) => record.id));
  for (const id of medium) assert.ok(low.has(id));
  for (const id of high) assert.ok(medium.has(id));
  assert.equal(high.has('HLM-C-1002'), false);
  assert.equal(high.has('HLM-C-1003'), false);
});
