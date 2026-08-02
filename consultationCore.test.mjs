import assert from 'node:assert/strict';
import test from 'node:test';
import catalogPayload from './docs/hair-design-master/catalog.json' with { type: 'json' };
import catalogIndexPayload from './docs/hair-design-master/catalog-index.json' with { type: 'json' };
import { hydrateCatalogPayload, hydrateCatalogIndexPayload, catalogVersion, promptVersion } from './src/exploreCore.mjs';
import {
  CONSULTATION_HANDOFF_STORAGE_KEY,
  CONSULTATION_INITIAL_ACTIVE,
  CONSULTATION_HARD_MAX_ACTIVE,
  CONSULTATION_HANDOFF_SCHEMA_VERSION,
  CONSULTATION_GENERATION_AXES_VERSION,
  CONSULTATION_LEGACY_CATALOG_VERSION,
  CONSULTATION_LEGACY_PROMPT_VERSION,
  HAIR_COLOR_TONES,
  PRESERVE_CURRENT_TONE_ID,
  TREND_STRUCTURE_BASES,
  buildConsultationHandoff,
  createConsultationBatch,
  assignConsultationSourceViews,
  assignConsultationGenerationAxes,
  allocateConsultationDiversity,
  buildConsultationCandidatePool,
  canonicalStructureKey,
  deriveAllowedHairColorTones,
  evaluateHairColorFeasibility,
  classifyHairColorSamples,
  evaluateVariation,
  expandStructureGroup,
  groupCoreCatalog,
  normalizeDiagnosis,
  normalizeHairColorProfile,
  rankVariationsByMood,
  selectConsultationDesignIds,
  selectConsultationStructureDesignIds,
  scoreConsultationSuitability,
  startConsultationQueuedItems,
  applyConsultationCompletion,
  supersedeConsultationBatch,
  validateConsultationHandoffPayload,
  validateConsultationGenerationAxes,
  validateStableTaxonomyIds,
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

test('structure previews balance restrained finish families and keep high suitability', () => {
  const profileGroups = groups.filter((group) => group.genderId === 'F');
  const current = diagnosis({ profileGender: 'F', actualLengthCm: 80, naturalTexture: '직모', damage: 'low' });
  const selected = selectConsultationStructureDesignIds(profileGroups, current);
  const finishCounts = selected.generationAxes.reduce((counts, axes) => ({ ...counts, [axes.finishFamily]: (counts[axes.finishFamily] ?? 0) + 1 }), {});
  assert.equal(selected.designIds.length, 100);
  assert.equal(selected.generationAxes.every((axes) => axes.suitabilityScore >= 60), true);
  assert.ok(finishCounts['natural-soft'] >= 45 && finishCounts['natural-soft'] <= 60);
  assert.ok(finishCounts['salon-soft'] >= 25 && finishCounts['salon-soft'] <= 40);
  assert.ok(finishCounts.expressive <= 15);
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

test('stable taxonomy keys are ID-based and migrate legacy labels', () => {
  assert.deepEqual(validateStableTaxonomyIds(catalog.records), { coreCount: 6000, structureCount: 500, tupleCount: 6000 });
  const record = femaleLong.finishRecords[0];
  assert.match(canonicalStructureKey(record), /^F\|L\|F-L-\d{2}\|[A-Z]{2}$/);
  assert.equal(femaleLong.key, canonicalStructureKey(record));
  assert.equal(femaleLong.legacyKey.includes(record.baseKo), true);
});

test('special catalog IDs receive deterministic stable generation axes', () => {
  const record = catalog.records.find((item) => item.kind === 'special');
  assert.match(canonicalStructureKey(record), /^U\|SP\|S-[A-Z]{2}-\d{2}\|NA$/);
  const candidate = { ...record, designId: record.id, structureKey: canonicalStructureKey(record), mood: '자연스러운', intensity: '은은하게' };
  const options = { diagnosis: diagnosis({ damage: 'low' }), sourceViewKeys: ['front'], hairColorProfile: { currentToneId: 'natural-black', selectedToneIds: ['natural-black'] }, seedInput: 'special' };
  const first = assignConsultationGenerationAxes([candidate], options)[0].generationAxes;
  const second = assignConsultationGenerationAxes([candidate], options)[0].generationAxes;
  assert.deepEqual(first, second);
  assert.equal(first.suitabilityScore, 60);
  assert.equal(first.sourceViewKey, 'front');
});

test('natural color profile bounds black to adjacent tones without mask gating', () => {
  const current = diagnosis({ damage: 'low' });
  const profile = normalizeHairColorProfile({ currentToneId: 'natural-black', selectedToneIds: ['natural-black', 'dark-brown'] });
  assert.deepEqual(deriveAllowedHairColorTones(profile, current).map((tone) => tone.id), ['natural-black', 'soft-black', 'dark-brown']);
  assert.equal(evaluateHairColorFeasibility('dark-brown', profile, current, 'front').status, 'possible');
  assert.equal(evaluateHairColorFeasibility('dark-brown', profile, current, 'side').status, 'possible');
  assert.equal(evaluateHairColorFeasibility('warm-brown', profile, current, 'front').status, 'impossible');
  assert.equal(Object.hasOwn(profile, 'sourceViewMasks'), false);
  const legacy = normalizeHairColorProfile({});
  assert.equal(legacy.currentToneId, 'unknown');
  assert.deepEqual(legacy.selectedToneIds, [PRESERVE_CURRENT_TONE_ID]);
  assert.equal(HAIR_COLOR_TONES.length, 7);
});

test('hair color samples classify dark and natural brown tones deterministically', () => {
  const samples = (rgb, count = 900) => Array.from({ length: count }, (_, index) => rgb.map((value, channel) => value + ((index + channel) % 5) - 2));
  const naturalBlack = classifyHairColorSamples(samples([28, 27, 26]));
  const darkBrown = classifyHairColorSamples(samples([76, 68, 62]));
  const warmBrown = classifyHairColorSamples(samples([148, 119, 92]));
  const ashBrown = classifyHairColorSamples(samples([132, 137, 145]));
  assert.equal(naturalBlack.toneId, 'natural-black');
  assert.equal(darkBrown.toneId, 'dark-brown');
  assert.equal(warmBrown.toneId, 'warm-brown');
  assert.equal(ashBrown.toneId, 'muted-ash-brown');
  assert.ok(naturalBlack.confidence >= 0.9);
  assert.deepEqual(classifyHairColorSamples(samples([76, 68, 62])), darkBrown);
  assert.equal(classifyHairColorSamples([[10, 10, 10]]).toneId, 'unknown');
});

test('suitability is auditable, hair-only, and reaches 100 for an exact preference match', () => {
  const group = groups.find((item) => item.baseKo === '에어리 레이어드' && item.genderId === 'F' && item.lengthId === 'L');
  const record = group.finishRecords.find((item) => item.finishKo === '내추럴 스트레이트');
  const candidate = { ...record, designId: record.id, structureKey: group.key, mood: '자연스러운', intensity: '균형 있게', finishRecord: record };
  const score = scoreConsultationSuitability(candidate, diagnosis({ actualLengthCm: 80 }), { mood: '자연', maintenance: 'low' });
  assert.equal(score.total, 100);
  assert.deepEqual(score.components, { lengthStructure: 30, texture: 20, damageChemical: 15, density: 10, preference: 10, maintenance: 10, trend: 5 });
  assert.equal(Object.keys(score.components).some((key) => /face|beauty|attract/i.test(key)), false);
});

test('trend registry stays bounded and never overrides impossible feasibility', () => {
  const nonTrendGroup = groups.find((item) => item.baseKo === '클래식 픽시' && item.genderId === 'F' && item.lengthId === 'US');
  const nonTrendRecord = nonTrendGroup.finishRecords.find((item) => item.finishKo === '내추럴 스트레이트');
  const nonTrendCandidate = { ...nonTrendRecord, designId: nonTrendRecord.id, structureKey: nonTrendGroup.key, mood: '자연스러운', intensity: '균형 있게', finishRecord: nonTrendRecord };
  const nonTrendScore = scoreConsultationSuitability(nonTrendCandidate, diagnosis({ actualLengthCm: 8 }), { mood: '자연', maintenance: 'low' });
  assert.equal(nonTrendScore.components.trend, 2);
  assert.ok(nonTrendScore.components.trend <= 5);

  const maleRecord = maleShort.finishRecords.find((item) => item.finishKo === '내추럴 스트레이트');
  const impossibleCandidate = { ...maleRecord, designId: maleRecord.id, structureKey: maleShort.key, mood: '자연스러운', intensity: '균형 있게', finishRecord: maleRecord };
  const impossibleScore = scoreConsultationSuitability(impossibleCandidate, diagnosis({ profileGender: 'F', actualLengthCm: 18 }), { mood: '자연', maintenance: 'low' });
  assert.equal(impossibleScore.total, 0);
  assert.equal(impossibleScore.components.trend, 0);
});

test('diversity axes balance views, mirrors, colors, and retain retry ownership', () => {
  const profileGroups = groups.filter((group) => group.genderId === 'F');
  const current = diagnosis({ actualLengthCm: 80, damage: 'low' });
  const hairColorProfile = { currentToneId: 'natural-black', selectedToneIds: ['natural-black', 'dark-brown'] };
  const pool = buildConsultationCandidatePool(profileGroups, current, { mood: '자연', maintenance: 'medium' });
  const allocation = allocateConsultationDiversity(pool, { count: 100, diagnosis: current, sourceViewKeys: ['front', 'side', 'back'], hairColorProfile, seedInput: 'axes' });
  const validation = validateConsultationGenerationAxes(allocation.generationAxes, { count: 100 });
  assert.equal(validation.signatures, 100);
  assert.equal(Math.max(...Object.values(validation.viewCounts)) - Math.min(...Object.values(validation.viewCounts)) <= 1, true);
  for (const counts of Object.values(validation.mirrorCounts)) assert.equal(Math.abs(counts.mirrored - counts.original) <= 1, true);
  const toneCounts = allocation.generationAxes.reduce((counts, axes) => ({ ...counts, [axes.colorToneId]: (counts[axes.colorToneId] ?? 0) + 1 }), {});
  assert.deepEqual(toneCounts, { 'dark-brown': 80, 'natural-black': 20 });
  assert.equal(new Set(allocation.structureKeys).size, 100);
  let batch = createConsultationBatch({ batchId: 'axes-retry', designIds: allocation.designIds, generationAxes: allocation.generationAxes, sourcePhotoKey: 'source', settings: {} });
  batch = startConsultationQueuedItems(batch);
  const originalAxes = batch.slots[0].generationAxes;
  const pressured = applyConsultationCompletion(batch, { batchId: batch.batchId, sourcePhotoKey: batch.sourcePhotoKey, slotIndex: 0, designId: batch.slots[0].designId, generation: batch.slots[0].generation, sourceViewKey: batch.slots[0].sourceViewKey, mirrored: originalAxes.mirrored, colorToneId: originalAxes.colorToneId, ok: false, statusCode: 429 });
  const activeOthers = pressured.batch.slots.filter((slot) => slot.status === 'active');
  let drained = pressured.batch;
  for (const slot of activeOthers) drained = applyConsultationCompletion(drained, { batchId: drained.batchId, sourcePhotoKey: drained.sourcePhotoKey, slotIndex: slot.slotIndex, designId: slot.designId, generation: slot.generation, ok: true }).batch;
  const retried = startConsultationQueuedItems(drained).slots[0];
  assert.deepEqual(retried.generationAxes, originalAxes);
  assert.equal(retried.sourceViewKey, originalAxes.sourceViewKey);
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
  assert.deepEqual(Object.keys(handoff), ['schemaVersion', 'generationAxesVersion', 'sourceTransformVersion', 'originalFrontDataUrl', 'currentDesignIds', 'sourceViews', 'settings', 'diagnosis', 'hairColorProfile', 'decision', 'catalogVersion', 'promptVersion']);
  assert.equal(handoff.schemaVersion, CONSULTATION_HANDOFF_SCHEMA_VERSION);
  assert.equal(handoff.generationAxesVersion, CONSULTATION_GENERATION_AXES_VERSION);
  assert.equal(handoff.hairColorProfile.currentToneId, 'unknown');
  assert.equal(handoff.sourceViews.front, handoff.originalFrontDataUrl);
  assert.match(handoff.sourceViews.side, /^data:image\//);
  assert.equal(validateConsultationHandoffPayload(handoff).catalogVersion, catalogVersion);
  const legacy = { ...Object.fromEntries(Object.entries(handoff).filter(([key]) => !['schemaVersion', 'generationAxesVersion', 'sourceTransformVersion', 'hairColorProfile'].includes(key))), catalogVersion: CONSULTATION_LEGACY_CATALOG_VERSION, promptVersion: CONSULTATION_LEGACY_PROMPT_VERSION };
  const migrated = validateConsultationHandoffPayload(legacy);
  assert.equal(migrated.schemaVersion, CONSULTATION_HANDOFF_SCHEMA_VERSION);
  assert.equal(migrated.hairColorProfile.currentToneId, 'unknown');
  assert.deepEqual(migrated.hairColorProfile.selectedToneIds, [PRESERVE_CURRENT_TONE_ID]);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, catalogVersion: 'stale' }), /version mismatch/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, promptVersion: '' }), /versions are required/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, unexpected: true }), /Unexpected/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, sourceViews: { side: 'https://example.test/not-original.jpg' } }), /original image/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, sourceViews: { extra: 'data:image/jpeg;base64,DDDD' } }), /Unexpected source view/);
  assert.throws(() => validateConsultationHandoffPayload({ ...handoff, generatedImageUrl: 'https://example.test/image.png' }), /Unexpected|generated artifacts/);
  assert.throws(() => buildConsultationHandoff({ ...handoff, registeredModelPreview: { id: 'HLM-MP-1234ABCD' } }), /generated artifacts/);
  assert.throws(() => buildConsultationHandoff({ ...handoff, currentDesignIds: [] }), /1-6/);
  assert.equal(CONSULTATION_HANDOFF_STORAGE_KEY, 'HAIRLOOM_CONSULTATION_HANDOFF');
});

test('male structure rejects female diagnosis before it can become possible', () => {
  const result = evaluateVariation(variation(maleShort, '내추럴 스트레이트'), diagnosis({ actualLengthCm: 80 }));
  assert.equal(result.status, 'impossible');
});
