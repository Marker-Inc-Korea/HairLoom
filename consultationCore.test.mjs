import assert from 'node:assert/strict';
import test from 'node:test';
import catalogPayload from './docs/hair-design-master/catalog.json' with { type: 'json' };
import catalogIndexPayload from './docs/hair-design-master/catalog-index.json' with { type: 'json' };
import { hydrateCatalogPayload, hydrateCatalogIndexPayload, catalogVersion, promptVersion } from './src/exploreCore.mjs';
import {
  CONSULTATION_HANDOFF_STORAGE_KEY,
  CONSULTATION_INITIAL_ACTIVE,
  CONSULTATION_HARD_MAX_ACTIVE,
  buildConsultationHandoff,
  createConsultationBatch,
  assignConsultationSourceViews,
  evaluateVariation,
  expandStructureGroup,
  groupCoreCatalog,
  normalizeDiagnosis,
  rankVariationsByMood,
  selectConsultationDesignIds,
  selectConsultationStructureDesignIds,
  startConsultationQueuedItems,
  applyConsultationCompletion,
  supersedeConsultationBatch,
  validateConsultationHandoffPayload,
  summarizeStructureFeasibility
} from './src/consultationCore.mjs';

const catalog = hydrateCatalogPayload(catalogPayload);
const index = hydrateCatalogIndexPayload(catalogIndexPayload);
const groups = groupCoreCatalog(catalog.records);
const femaleLong = groups.find((group) => group.genderId === 'F' && group.lengthId === 'L');
const femaleXL = groups.find((group) => group.genderId === 'F' && group.lengthId === 'XL');
const maleShort = groups.find((group) => group.genderId === 'M' && group.lengthId === 'S');

function variation(group, finishKo, intensity = '균형 있게') {
  return expandStructureGroup(group).find((item) => item.finishKo === finishKo && item.intensity === intensity);
}

function diagnosis(overrides = {}) {
  return normalizeDiagnosis({ profileGender: 'F', actualLengthCm: 80, naturalTexture: '직모', density: 'normal', damage: 'low', bleachCount: 0, monthsSincePerm: 12, extensionAllowed: false, ...overrides });
}

test('core catalog groups into exactly 500 structures with 12 finish records each', () => {
  assert.equal(groups.length, 500);
  assert.equal(new Set(groups.map((group) => group.key)).size, 500);
  assert.equal(groups.every((group) => group.finishRecords.length === 12), true);
});

test('one structure expands to exactly 288 deterministic preserved mood variations', () => {
  const expanded = expandStructureGroup(femaleLong);
  assert.equal(expanded.length, 288);
  assert.equal(new Set(expanded.map((item) => item.id)).size, 288);
  assert.deepEqual(expanded.slice(0, 3).map((item) => item.mood), ['자연스러운', '자연스러운', '자연스러운']);
  assert.deepEqual(expanded.slice(0, 3).map((item) => item.intensity), ['은은하게', '균형 있게', '확실하게']);
});

test('length and shrinkage math reports required pre-treatment length and shortage', () => {
  const result = evaluateVariation(variation(femaleLong, '히피 펌'), diagnosis({ actualLengthCm: 60 }));
  assert.equal(result.requiredPreTreatmentLengthCm, 68.29);
  assert.equal(result.shortageCm, 8.29);
  assert.equal(result.shrinkageRate, 0.18);
  assert.equal(result.status, 'impossible');
});

test('extension boundaries are conditional up to limits and impossible beyond or when denied', () => {
  const piece = evaluateVariation(variation(femaleLong, '내추럴 스트레이트'), diagnosis({ actualLengthCm: 40, extensionAllowed: true }));
  assert.equal(piece.status, 'conditional');
  assert.equal(piece.extensionNeed, 'piece');
  const extension = evaluateVariation(variation(femaleXL, '내추럴 스트레이트'), diagnosis({ actualLengthCm: 40, extensionAllowed: true }));
  assert.equal(extension.status, 'conditional');
  assert.equal(extension.extensionNeed, 'extension');
  const denied = evaluateVariation(variation(femaleXL, '내추럴 스트레이트'), diagnosis({ actualLengthCm: 40, extensionAllowed: false }));
  assert.equal(denied.status, 'impossible');
  const tooLong = evaluateVariation(variation(femaleXL, '히피 펌'), diagnosis({ actualLengthCm: 40, extensionAllowed: true }));
  assert.equal(tooLong.status, 'impossible');
});

test('chemical and damage boundaries prevent false possible perm decisions', () => {
  const perm = variation(femaleLong, '루즈 S컬 펌');
  assert.equal(evaluateVariation(perm, diagnosis({ damage: 'high' })).status, 'impossible');
  assert.equal(evaluateVariation(perm, diagnosis({ bleachCount: 2 })).status, 'impossible');
  assert.equal(evaluateVariation(perm, diagnosis({ monthsSincePerm: 2 })).status, 'impossible');
  assert.equal(evaluateVariation(perm, diagnosis({ damage: 'medium' })).status, 'conditional');
  assert.equal(evaluateVariation(perm, diagnosis({ bleachCount: 1 })).status, 'conditional');
  assert.equal(evaluateVariation(perm, diagnosis({ monthsSincePerm: 5 })).status, 'conditional');
  assert.notEqual(evaluateVariation(perm, diagnosis({ naturalTexture: '코일' })).status, 'possible');
});

test('natural texture compatibility and low-density limits are conservative', () => {
  assert.equal(evaluateVariation(variation(femaleLong, '내추럴 코일'), diagnosis({ naturalTexture: '직모' })).status, 'impossible');
  assert.equal(evaluateVariation(variation(femaleLong, '내추럴 스트레이트'), diagnosis({ naturalTexture: '반곱슬' })).status, 'conditional');
  const bluntGroup = groups.find((group) => group.genderId === 'F' && group.baseKo.includes('블런트'));
  assert.equal(evaluateVariation(variation(bluntGroup, '내추럴 스트레이트'), diagnosis({ density: 'low' })).status, 'conditional');
});

test('status summaries count all 288 variations and match brute-force evaluation', () => {
  const current = diagnosis({ actualLengthCm: 30, extensionAllowed: true, damage: 'medium' });
  const summary = summarizeStructureFeasibility(femaleLong, current);
  const brute = expandStructureGroup(femaleLong).reduce((counts, item) => {
    counts[evaluateVariation(item, current).status] += 1;
    counts.total += 1;
    return counts;
  }, { possible: 0, conditional: 0, impossible: 0, total: 0 });
  assert.deepEqual(summary, brute);
  assert.equal(summary.total, 288);
  assert.ok(summary.impossible > 0);
});

test('mood ranking reorders existing variations without inventing designs', () => {
  const expanded = expandStructureGroup(femaleLong);
  const ranked = rankVariationsByMood(expanded, '부드럽지만 단정하고 너무 꾸민 느낌은 싫어요');
  assert.equal(ranked.length, expanded.length);
  assert.equal(new Set(ranked.map((item) => item.id)).size, expanded.length);
  assert.ok(['부드러운', '단정한'].includes(ranked[0].mood));
  assert.notEqual(ranked[0].intensity, '확실하게');
});

test('structure preview selection returns 100 unique feasible groups', () => {
  const femaleGroups = groups.filter((group) => group.genderId === 'F');
  const current = diagnosis({ actualLengthCm: 80, damage: 'low' });
  const first = selectConsultationStructureDesignIds(femaleGroups, current);
  const second = selectConsultationStructureDesignIds(femaleGroups, current);
  assert.equal(first.designIds.length, 100);
  assert.equal(new Set(first.designIds).size, 100);
  assert.equal(new Set(first.structureKeys).size, 100);
  assert.deepEqual(first, second);
  const byId = new Map(catalog.records.map((record) => [record.id, record]));
  assert.equal(first.designIds.every((id) => {
    const record = byId.get(id);
    return evaluateVariation({ ...record, designId: id, finishRecord: record, mood: '자연스러운', intensity: '균형 있게' }, current).status !== 'impossible';
  }), true);
});

test('consultation selection returns deterministic 100 unique IDs', () => {
  const settings = { currentLength: 2, hairThickness: 'normal', damageCondition: 'low', permAllowed: true, extensionAllowed: true, similarity: 2 };
  const first = selectConsultationDesignIds(index.records, settings, { seedInput: 'front-photo-key' });
  const second = selectConsultationDesignIds(index.records, settings, { seedInput: 'front-photo-key' });
  assert.equal(first.designIds.length, 100);
  assert.equal(new Set(first.designIds).size, 100);
  assert.deepEqual(first.designIds, second.designIds);
  assert.equal(first.originalPhotoLineage.memoryOnly, true);
});

test('consultation source views are deterministic and balanced across supplied originals', () => {
  const ids = Array.from({ length: 100 }, (_, index) => `HLM-V-${String(index).padStart(3, '0')}`);
  const base = createConsultationBatch({ batchId: 'views', designIds: ids, sourcePhotoKey: 'source', settings: {} });
  const frontOnly = assignConsultationSourceViews(base, ['front'], 'seed');
  assert.equal(frontOnly.slots.every((slot) => slot.sourceViewKey === 'front'), true);

  const first = assignConsultationSourceViews(base, ['back', 'front', 'side', 'side'], 'seed');
  const second = assignConsultationSourceViews(base, ['side', 'front', 'back'], 'seed');
  assert.deepEqual(first.slots.map((slot) => slot.sourceViewKey), second.slots.map((slot) => slot.sourceViewKey));
  const counts = Object.fromEntries(['front', 'side', 'back'].map((key) => [key, first.slots.filter((slot) => slot.sourceViewKey === key).length]));
  assert.equal(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1, true);
  assert.deepEqual(first.metadata.sourceViewKeys, ['front', 'side', 'back']);

  const allViews = assignConsultationSourceViews(base, ['front', 'side', 'back', 'crown', 'nape', 'detail'], 'all');
  assert.deepEqual(new Set(allViews.slots.map((slot) => slot.sourceViewKey)), new Set(['front', 'side', 'back', 'crown', 'nape', 'detail']));
  assert.throws(() => assignConsultationSourceViews(base, ['side', 'back']), /Front source view is required/);
});

test('consultation retry retains its original source view ownership', () => {
  const ids = Array.from({ length: 100 }, (_, index) => `HLM-R-${String(index).padStart(3, '0')}`);
  let batch = assignConsultationSourceViews(createConsultationBatch({ batchId: 'retry-view', designIds: ids, sourcePhotoKey: 'source', settings: {} }), ['front', 'side', 'back'], 'retry');
  batch = startConsultationQueuedItems(batch);
  const original = batch.slots[0];
  const pressured = applyConsultationCompletion(batch, { batchId: batch.batchId, sourcePhotoKey: batch.sourcePhotoKey, slotIndex: original.slotIndex, designId: original.designId, generation: original.generation, ok: false, statusCode: 429 });
  const retried = startConsultationQueuedItems(pressured.batch).slots[0];
  assert.equal(retried.sourceViewKey, original.sourceViewKey);
});

test('adaptive consultation batch starts at 32 and can rise only to hard max 100', () => {
  const ids = Array.from({ length: 100 }, (_, index) => `HLM-C-${String(index).padStart(3, '0')}`);
  let batch = startConsultationQueuedItems(createConsultationBatch({ batchId: 'b1', designIds: ids, sourcePhotoKey: 'front', settings: {} }));
  assert.equal(batch.activeLimit, CONSULTATION_INITIAL_ACTIVE);
  assert.equal(batch.slots.filter((slot) => slot.status === 'active').length, 32);
  for (let i = 0; i < 80; i += 1) {
    const slot = batch.slots.find((item) => item.status === 'active');
    const applied = applyConsultationCompletion(batch, { slotIndex: slot.slotIndex, designId: slot.designId, generation: slot.generation, ok: true });
    assert.equal(applied.accepted, true);
    batch = startConsultationQueuedItems(applied.batch);
  }
  assert.ok(batch.activeLimit > 32);
  assert.ok(batch.activeLimit <= CONSULTATION_HARD_MAX_ACTIVE);
});

test('429 and network pressure backs off with one bounded retry', () => {
  const ids = Array.from({ length: 100 }, (_, index) => `HLM-C-${String(index).padStart(3, '0')}`);
  let batch = createConsultationBatch({ batchId: 'b2', designIds: ids, sourcePhotoKey: 'front', settings: {} });
  batch.activeLimit = 80;
  batch = startConsultationQueuedItems(batch);
  const slot = batch.slots[0];
  const pressured = applyConsultationCompletion(batch, { batchId: 'b2', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: false, statusCode: 429 });
  assert.equal(pressured.batch.activeLimit, 60);
  assert.equal(pressured.batch.slots[0].status, 'queued');
  let drained = pressured.batch;
  for (const activeSlot of drained.slots.filter((item) => item.status === 'active')) {
    drained = applyConsultationCompletion(drained, { batchId: 'b2', sourcePhotoKey: 'front', slotIndex: activeSlot.slotIndex, designId: activeSlot.designId, generation: activeSlot.generation, ok: true }).batch;
  }
  const retry = startConsultationQueuedItems(drained);
  const retrySlot = retry.slots[0];
  assert.equal(retrySlot.status, 'active');
  const network = applyConsultationCompletion(retry, { batchId: 'b2', sourcePhotoKey: 'front', slotIndex: 0, designId: retrySlot.designId, generation: retrySlot.generation, ok: false, errorType: 'network' });
  assert.ok(network.batch.activeLimit >= CONSULTATION_INITIAL_ACTIVE);
  assert.equal(network.batch.slots[0].status, 'failed');
  assert.equal(network.batch.slots[0].attempts, 2);
});

test('stable slots reject stale, superseded, wrong-batch, wrong-source, and duplicate completions', () => {
  const ids = Array.from({ length: 100 }, (_, index) => `HLM-C-${String(index).padStart(3, '0')}`);
  const batch = startConsultationQueuedItems(createConsultationBatch({ batchId: 'b3', designIds: ids, sourcePhotoKey: 'front', settings: {} }));
  const slot = batch.slots[0];
  assert.equal(applyConsultationCompletion(batch, { batchId: 'b3', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: 0, ok: true }).accepted, false);
  assert.equal(applyConsultationCompletion(batch, { batchId: 'wrong', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: true }).accepted, false);
  assert.equal(applyConsultationCompletion(batch, { batchId: 'b3', sourcePhotoKey: 'wrong', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: true }).accepted, false);
  const superseded = supersedeConsultationBatch(batch, 'b4');
  assert.equal(applyConsultationCompletion(superseded, { batchId: 'b3', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: true }).accepted, false);
  const accepted = applyConsultationCompletion(batch, { batchId: 'b3', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: true });
  assert.equal(accepted.accepted, true);
  assert.equal(applyConsultationCompletion(accepted.batch, { batchId: 'b3', sourcePhotoKey: 'front', slotIndex: 0, designId: slot.designId, generation: slot.generation, ok: true }).accepted, false);
  assert.equal(accepted.batch.slots[0].slotIndex, 0);
  assert.equal(accepted.batch.slots[0].designId, slot.designId);
});

test('handoff validates exact versioned payload and rejects unknown or generated fields', () => {
  const handoff = buildConsultationHandoff({
    originalFrontDataUrl: 'data:image/jpeg;base64,AAAA',
    currentDesignIds: ['HLM-C-F-US-01-NH-NS'],
    sourceViews: { side: 'data:image/jpeg;base64,BBBB', back: 'data:image/jpeg;base64,CCCC' },
    settings: {},
    diagnosis: { profileGender: 'F', actualLengthCm: 30, naturalTexture: '직모' },
    decision: { selectedStructureKey: femaleLong.key },
    catalogVersion,
    promptVersion
  });
  assert.deepEqual(Object.keys(handoff), ['originalFrontDataUrl', 'currentDesignIds', 'sourceViews', 'settings', 'diagnosis', 'decision', 'catalogVersion', 'promptVersion']);
  assert.equal(handoff.sourceViews.front, handoff.originalFrontDataUrl);
  assert.match(handoff.sourceViews.side, /^data:image\//);
  assert.equal(validateConsultationHandoffPayload(handoff).catalogVersion, catalogVersion);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, catalogVersion: 'stale' }), /version mismatch/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, promptVersion: '' }), /versions are required/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, unexpected: true }), /Unexpected/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, sourceViews: { side: 'https://example.test/not-original.jpg' } }), /original image/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, sourceViews: { extra: 'data:image/jpeg;base64,DDDD' } }), /Unexpected source view/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, generatedImageUrl: 'https://example.test/image.png' }), /Unexpected|generated artifacts/);
  assert.throws(() => buildConsultationHandoff({ ...handoff, currentDesignIds: [] }), /1-6/);
  assert.equal(CONSULTATION_HANDOFF_STORAGE_KEY, 'HAIRLOOM_CONSULTATION_HANDOFF');
});

test('male structure rejects female diagnosis before it can become possible', () => {
  const result = evaluateVariation(variation(maleShort, '내추럴 스트레이트'), diagnosis({ actualLengthCm: 80 }));
  assert.equal(result.status, 'impossible');
});
