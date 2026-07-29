export const schemaVersion = 1;
export const catalogVersion = 'HLM-MASTER-2026-07-EXPLORE-2';
export const promptVersion = 'HLM-EXPLORE-PROMPT-2026-07-4';
export const MAX_EXPLORE_ACTIVE = 32;
export const EXPLORE_SELECTION_LIMIT = 100;

const MASCULINE_LINE_TREATMENT_PROMPT = 'MASCULINE LINE TREATMENT: the named haircut remains authoritative. Use stronger directional planes, broader hair sections, controlled weight, compact side volume, deliberate temple and ear transitions, and a clean decisive nape. Avoid a diffuse rounded halo, fine decorative face-framing wisps, ornamental feathering, or uniformly soft curl edges unless the named design explicitly requires them. Apply this language to hair only; never alter the face, body, or identity.';
const FEMININE_LINE_TREATMENT_PROMPT = 'FEMININE LINE TREATMENT: the named haircut remains authoritative. Use softer connected arcs, blended weight transitions, nuanced face-framing, gentle temple and ear transitions, fluid side-to-back movement, and tapered or feathered ends where the design allows. Avoid clipper-like boxiness, hard squared corners, rigid top planes, abrupt disconnected side panels, or a severe barbershop nape unless the named design explicitly requires them. Apply this language to hair only; never alter the face, body, or identity.';
const GENDER_NEUTRAL_LINE_TREATMENT_PROMPT = 'GENDER-NEUTRAL LINE TREATMENT: follow the named design’s established contour and weight without imposing masculine or feminine facial cues. Apply the design language to hair only; never alter the face, body, or identity.';

export function genderLineTreatmentPrompt(value) {
  const gender = String(value ?? '').trim().toUpperCase();
  if (gender === 'M' || gender === 'MALE' || gender === '남성') return MASCULINE_LINE_TREATMENT_PROMPT;
  if (gender === 'F' || gender === 'FEMALE' || gender === '여성') return FEMININE_LINE_TREATMENT_PROMPT;
  return GENDER_NEUTRAL_LINE_TREATMENT_PROMPT;
}

const DEFAULT_SETTINGS = Object.freeze({
  currentLength: 2,
  hairThickness: 'normal',
  damageCondition: 'medium',
  permAllowed: true,
  extensionAllowed: false,
  similarity: 2
});
const THICKNESS = new Set(['fine', 'normal', 'thick']);
const DAMAGE = new Set(['low', 'medium', 'high']);
const BANNED_FACE_KEYS = new Set([
  'faceratio', 'faceshape', 'jawratio', 'foreheadratio', 'cheekboneratio',
  'facelandmarks', 'facepixels', 'facelandmark', 'jawshape', 'foreheadshape'
]);
const LENGTH_RADIUS = [4, 3, 2, 1, 0];

export function defaultExploreSettings() {
  return { ...DEFAULT_SETTINGS };
}

function normalizedKey(key) {
  return String(key).normalize('NFKC').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function assertNoBannedFaceKeys(value, path = 'input') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_FACE_KEYS.has(normalizedKey(key))) throw new TypeError(`Banned face/photo proxy key at ${path}.${key}`);
    assertNoBannedFaceKeys(child, `${path}.${key}`);
  }
}

export function normalizeSettings(raw = {}) {
  assertNoBannedFaceKeys(raw);
  const source = { ...raw };
  if ('damage' in source) {
    if ('damageCondition' in source && source.damageCondition !== source.damage) throw new TypeError('damage and damageCondition disagree');
    source.damageCondition = source.damage;
    delete source.damage;
  }
  const settings = { ...DEFAULT_SETTINGS, ...source };
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const key of Object.keys(settings)) if (!allowed.has(key)) throw new TypeError(`Unknown Explore setting: ${key}`);
  if (!Number.isInteger(settings.currentLength) || settings.currentLength < 0 || settings.currentLength > 4) throw new TypeError('currentLength must be 0..4');
  if (!THICKNESS.has(settings.hairThickness)) throw new TypeError('hairThickness is invalid');
  if (!DAMAGE.has(settings.damageCondition)) throw new TypeError('damageCondition is invalid');
  if (typeof settings.permAllowed !== 'boolean') throw new TypeError('permAllowed must be boolean');
  if (typeof settings.extensionAllowed !== 'boolean') throw new TypeError('extensionAllowed must be boolean');
  if (!Number.isInteger(settings.similarity) || settings.similarity < 0 || settings.similarity > 4) throw new TypeError('similarity must be 0..4');
  return settings;
}

export function stableSettingsString(raw) {
  const s = normalizeSettings(raw);
  return `cl=${s.currentLength}&ht=${s.hairThickness}&dc=${s.damageCondition}&pa=${s.permAllowed ? 1 : 0}&ea=${s.extensionAllowed ? 1 : 0}&sim=${s.similarity}`;
}

export function stableHash32(input) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(input))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function requireFeasibility(record) {
  if (!record || typeof record.id !== 'string' || !record.id.startsWith('HLM-')) throw new TypeError('Invalid catalog record id');
  if (!record.feasibility || !record.vector) throw new TypeError(`Invalid catalog record ${record.id}`);
  assertNoBannedFaceKeys(record, record.id);
}

export function validateCatalogIndex(index, expected = {}) {
  const records = Array.isArray(index) ? index : index?.records;
  if (!Array.isArray(records)) throw new TypeError('Catalog index records must be an array');
  if (expected.schemaVersion !== undefined && index.schemaVersion !== expected.schemaVersion) throw new TypeError('Catalog schemaVersion mismatch');
  if (expected.catalogVersion !== undefined && index.catalogVersion !== expected.catalogVersion) throw new TypeError('Catalog version mismatch');
  if (expected.promptVersion !== undefined && index.promptVersion !== expected.promptVersion) throw new TypeError('Prompt version mismatch');
  if (expected.total !== undefined && records.length !== expected.total) throw new TypeError(`Catalog must contain ${expected.total} records`);
  const seen = new Set();
  for (const record of records) {
    requireFeasibility(record);
    if (seen.has(record.id)) throw new TypeError(`Duplicate catalog id ${record.id}`);
    seen.add(record.id);
  }
  return records;
}

const LENGTH_INDEX = { US: 0, S: 1, MD: 2, L: 3, XL: 4 };
const DAMAGE_NAMES = ['low', 'medium', 'high'];
const thicknessFromMask = (mask) => ['fine', 'normal', 'thick'].filter((_, index) => mask & (1 << index));
function hydrateFeasibility(tuple, start) {
  return {
    lengthOrderMin: tuple[start],
    lengthOrderMax: tuple[start + 1],
    targetLengthOrder: tuple[start + 2],
    maxLengthJumpFromCurrent: tuple[start + 3],
    suitableThickness: thicknessFromMask(tuple[start + 4]),
    damageCeiling: DAMAGE_NAMES[tuple[start + 5]],
    requiresPerm: Boolean(tuple[start + 6]),
    permIntensity: tuple[start + 7],
    requiresExtensionOrPiece: Boolean(tuple[start + 8]),
    specialFamilyRisk: tuple[start + 9],
    hardDenyWhenExtensionsDenied: Boolean(tuple[start + 10])
  };
}
function hydrateVector(tuple, start) {
  return {
    length: tuple[start], kind: tuple[start + 1], gender: tuple[start + 2],
    baseBucket: tuple[start + 3], frontBucket: tuple[start + 4], finishBucket: tuple[start + 5],
    textureBucket: tuple[start + 6], permBucket: tuple[start + 7], specialFamilyBucket: tuple[start + 8],
    editorialRisk: tuple[start + 9]
  };
}
function promptSafety(feasibility) {
  if (feasibility.requiresExtensionOrPiece) return '붙임 또는 피스는 실제 가능 길이와 두피 부담을 확인하고 원본 인물과 배경을 유지';
  if (feasibility.requiresPerm) return '현재 모발 상태를 확인하고 가능한 경우에만 펌을 적용하며 원본 인물과 배경을 유지';
  return '커트 구조와 자연 결 중심으로 원본 인물과 배경을 유지';
}
export function hydrateCatalogPayload(payload) {
  if (!payload || payload.encoding !== 'HLM-DICT-TUPLE-1' || payload.schemaVersion !== schemaVersion) throw new TypeError('Unsupported catalog encoding');
  if (payload.catalogVersion !== catalogVersion || payload.promptVersion !== promptVersion) throw new TypeError('Catalog version mismatch');
  const d = payload.dictionaries;
  const records = payload.records.map((tuple) => {
    if (tuple[1] === 0) {
      const genderId = tuple[2], lengthId = tuple[3], baseKo = d.bases[tuple[4]], frontKo = d.fronts[tuple[5]], finishKo = d.finishes[tuple[6]];
      const feasibility = hydrateFeasibility(tuple, 11), vector = hydrateVector(tuple, 22);
      const genderKo = genderId === 'F' ? '여성' : '남성', lengthKo = d.lengths[LENGTH_INDEX[lengthId]];
      const nameKo = `${genderKo} ${lengthKo} ${baseKo} · ${frontKo} · ${finishKo}`;
      return { id: tuple[0], kind: 'core', nameKo, featureKo: `${baseKo}; ${frontKo}; ${finishKo}`, signature: tuple[10], promptAtoms: { titleKo: nameKo, structureKo: baseKo, frontKo, finishKo, safetyKo: promptSafety(feasibility) }, feasibility, vector, genderId, lengthId, lengthKo, landmarkKo: d.landmarks[LENGTH_INDEX[lengthId]], baseKo, frontKo, finishKo, finishTypeKo: d.finishTypes[tuple[7]], diameterMm: tuple[8] < 0 ? null : tuple[8], hairTypeKo: d.hairTypes[tuple[9]] };
    }
    const familyId = tuple[2], familyIndex = ['BR', 'UP', 'TR', 'BA', 'ED'].indexOf(familyId), familyKo = d.families[familyIndex], archetypeKo = d.archetypes[tuple[4]], variantKo = d.variants[tuple[5]];
    const feasibility = hydrateFeasibility(tuple, 7), vector = hydrateVector(tuple, 18);
    const nameKo = `${familyKo} · ${archetypeKo} · ${variantKo}`;
    return { id: tuple[0], kind: 'special', nameKo, featureKo: `${familyKo}; ${archetypeKo}; ${variantKo}`, signature: tuple[6], promptAtoms: { titleKo: nameKo, structureKo: `${familyKo}. ${archetypeKo}`, finishKo: variantKo, safetyKo: promptSafety(feasibility) }, feasibility, vector, familyId, familyKo, file: d.files[tuple[3]], archetypeKo, variantKo };
  });
  if (payload.counts?.total !== records.length) throw new TypeError('Catalog count mismatch');
  return { schemaVersion, catalogVersion, promptVersion, counts: payload.counts, records };
}
export function hydrateCatalogIndexPayload(payload) {
  if (!payload || payload.encoding !== 'HLM-INDEX-TUPLE-1' || payload.schemaVersion !== schemaVersion) throw new TypeError('Unsupported catalog index encoding');
  if (payload.catalogVersion !== catalogVersion || payload.promptVersion !== promptVersion) throw new TypeError('Catalog index version mismatch');
  const records = payload.records.map((tuple) => ({ id: tuple[0], kind: tuple[1] === 0 ? 'core' : 'special', stableSortKey: tuple[2], signature: tuple[2], feasibility: hydrateFeasibility(tuple, 3), vector: hydrateVector(tuple, 14) }));
  return { schemaVersion, catalogVersion, promptVersion, facets: payload.facets, records };
}

export function passesDamageCondition(record, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  requireFeasibility(record);
  const f = record.feasibility;
  if (settings.damageCondition === 'low') return true;
  if (settings.damageCondition === 'medium') {
    return f.damageCeiling !== 'high'
      && !(f.requiresPerm && f.permIntensity >= 2)
      && f.specialFamilyRisk <= 2
      && record.vector.editorialRisk <= 1;
  }
  return f.damageCeiling === 'low'
    && !f.requiresPerm
    && f.permIntensity === 0
    && !f.requiresExtensionOrPiece
    && !f.hardDenyWhenExtensionsDenied
    && f.specialFamilyRisk <= 1
    && record.vector.editorialRisk === 0;
}

export function passesHardFeasibility(record, rawSettings) {
  const settings = normalizeSettings(rawSettings);
  requireFeasibility(record);
  const f = record.feasibility;
  if (settings.currentLength < f.lengthOrderMin || settings.currentLength > f.lengthOrderMax) return false;
  if (!settings.extensionAllowed && (f.requiresExtensionOrPiece || f.hardDenyWhenExtensionsDenied)) return false;
  if (!settings.permAllowed && f.requiresPerm) return false;
  return passesDamageCondition(record, settings);
}

function passesSoft(record, settings, relaxation) {
  const f = record.feasibility;
  const radius = Math.min(4, LENGTH_RADIUS[settings.similarity] + relaxation.length);
  if (Math.abs(f.targetLengthOrder - settings.currentLength) > radius) return false;
  if (relaxation.thickness === 0 && !f.suitableThickness.includes(settings.hairThickness)) return false;
  if (relaxation.thickness === 1 && !f.suitableThickness.includes(settings.hairThickness) && !f.suitableThickness.includes('normal')) return false;
  const damageCap = settings.damageCondition === 'high' ? 1 : settings.damageCondition === 'medium' ? 2 : 3;
  const riskCap = Math.min(damageCap, [3, 3, 2, 1, 0][settings.similarity] + relaxation.risk);
  return f.specialFamilyRisk <= riskCap;
}

export function filterFeasible(indexRecords, rawSettings, mode = 'initial') {
  const settings = normalizeSettings(rawSettings);
  const records = validateCatalogIndex(indexRecords);
  const hardPassed = records.filter((record) => passesHardFeasibility(record, settings));
  const relaxationTrace = [];
  const steps = [
    { code: 'R0', length: 0, thickness: 0, risk: 0 },
    { code: 'R1', length: 1, thickness: 0, risk: 0 },
    { code: 'R2', length: 1, thickness: 1, risk: 0 },
    { code: 'R3', length: 1, thickness: 1, risk: 1 },
    { code: 'R4', length: 1, thickness: 2, risk: 1 }
  ];
  let softPassed = [];
  for (const step of steps) {
    softPassed = hardPassed.filter((record) => passesSoft(record, settings, step));
    relaxationTrace.push({ mode, step: step.code, count: softPassed.length, damageCondition: settings.damageCondition });
    if (softPassed.length >= EXPLORE_SELECTION_LIMIT) break;
  }
  return { hardPassed, softPassed, relaxationTrace, underflow: softPassed.length < EXPLORE_SELECTION_LIMIT };
}

function selectionSeed(settings, seedInput, clicked = 'initial') {
  return `${catalogVersion}|${promptVersion}|${stableSettingsString(settings)}|${String(seedInput ?? '').slice(0, 16)}|${clicked}`;
}

function bucketCount(selected, key, value) {
  let count = 0;
  for (const record of selected) if ((key === 'kind' ? record.kind : record.vector[key]) === value) count += 1;
  return count;
}

function diversityScore(record, selected, seed) {
  const v = record.vector;
  const coverage = 20 / (1 + bucketCount(selected, 'length', v.length))
    + 12 / (1 + bucketCount(selected, 'kind', record.kind))
    + 10 / (1 + bucketCount(selected, 'baseBucket', v.baseBucket))
    + 8 / (1 + bucketCount(selected, 'frontBucket', v.frontBucket))
    + 8 / (1 + bucketCount(selected, 'finishBucket', v.finishBucket))
    + 6 / (1 + bucketCount(selected, 'textureBucket', v.textureBucket));
  const jitter = stableHash32(`${seed}|${record.id}`) / 0xffffffff;
  return coverage + jitter;
}

export function selectDiverse100(indexRecords, rawSettings, seedInput = '') {
  const settings = normalizeSettings(rawSettings);
  const feasible = filterFeasible(indexRecords, settings, 'diverse');
  const seed = selectionSeed(settings, seedInput);
  const pool = [...feasible.softPassed].sort((a, b) => a.id.localeCompare(b.id));
  const selected = [];
  while (selected.length < EXPLORE_SELECTION_LIMIT && pool.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const score = diversityScore(pool[index], selected, seed);
      if (score > bestScore || (score === bestScore && pool[index].id < pool[bestIndex].id)) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return { designIds: selected.map((record) => record.id), records: selected, underflow: selected.length < EXPLORE_SELECTION_LIMIT, relaxationTrace: feasible.relaxationTrace };
}

function vectorDistance(a, b) {
  return Math.abs(a.vector.length - b.vector.length) * 8
    + Math.abs(a.vector.textureBucket - b.vector.textureBucket) * 3
    + Math.abs(a.vector.permBucket - b.vector.permBucket) * 4
    + Math.abs(a.vector.specialFamilyBucket - b.vector.specialFamilyBucket) * 2
    + Math.abs(a.vector.editorialRisk - b.vector.editorialRisk) * 3
    + (a.kind === b.kind ? 0 : 5);
}

export function selectNeighbor100(indexRecords, rawSettings, clickedDesignId, seedInput = '') {
  const settings = normalizeSettings(rawSettings);
  const records = validateCatalogIndex(indexRecords);
  const clicked = records.find((record) => record.id === clickedDesignId);
  const feasible = filterFeasible(records, settings, 'neighbor');
  const seed = selectionSeed(settings, seedInput, clickedDesignId);
  const chosen = [];
  let clickedExcluded = true;
  if (clicked && passesHardFeasibility(clicked, settings)) {
    chosen.push(clicked);
    clickedExcluded = false;
  }
  const center = clicked ?? feasible.softPassed[0];
  const rest = feasible.softPassed.filter((record) => record.id !== chosen[0]?.id).sort((a, b) => {
    const distance = (center ? vectorDistance(a, center) - vectorDistance(b, center) : 0);
    return distance || stableHash32(`${seed}|${a.id}`) - stableHash32(`${seed}|${b.id}`) || a.id.localeCompare(b.id);
  });
  chosen.push(...rest.slice(0, EXPLORE_SELECTION_LIMIT - chosen.length));
  return { designIds: chosen.map((record) => record.id), records: chosen, clickedExcluded, underflow: chosen.length < EXPLORE_SELECTION_LIMIT, relaxationTrace: feasible.relaxationTrace };

}

export function buildExploreCacheKey({ sourcePhotoKey, settings, batchKind = 'initial', centerDesignId = 'initial' }) {
  const settingsHash = stableHash32(stableSettingsString(settings)).toString(16).padStart(8, '0');
  return `hlm:explore:v2:${catalogVersion}:${promptVersion}:${sourcePhotoKey}:${settingsHash}:${batchKind}:${centerDesignId}`;
}

export async function sourcePhotoKey(bytes, mimeType = 'image/jpeg') {
  const source = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is required');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex}:${mimeType}:${source.byteLength}`;
}

export function createExploreBatch({ batchId, designIds, sourcePhotoKey, settings, priorityDesignId = null }) {
  const ids = [...new Set(designIds)].slice(0, EXPLORE_SELECTION_LIMIT);
  const ordered = priorityDesignId && ids.includes(priorityDesignId) ? [priorityDesignId, ...ids.filter((id) => id !== priorityDesignId)] : ids;
  return {
    batchId,
    sourcePhotoKey,
    catalogVersion,
    promptVersion,
    settings: normalizeSettings(settings),
    slots: ordered.map((designId, slotIndex) => ({ batchId, designId, slotIndex, status: 'queued', imageUrl: null })),
    queue: ordered.map((designId, slotIndex) => ({ batchId, designId, slotIndex, sourcePhotoKey, promptVersion, priority: slotIndex === 0 && priorityDesignId === designId ? 1 : 0, status: 'queued' })),
    activeCount: 0,
    completedCount: 0,
    failedCount: 0,
    staleIgnored: 0
  };
}

export function startQueuedItems(batch, maxActive = MAX_EXPLORE_ACTIVE) {
  const next = structuredClone(batch);
  const capacity = Math.max(0, Math.min(MAX_EXPLORE_ACTIVE, maxActive) - next.activeCount);
  const queued = next.queue.filter((item) => item.status === 'queued').sort((a, b) => b.priority - a.priority || a.slotIndex - b.slotIndex).slice(0, capacity);
  for (const item of queued) {
    item.status = 'active';
    next.slots[item.slotIndex].status = 'active';
    next.activeCount += 1;
  }
  return next;
}

export function supersedeBatch(batch, newBatchId) {
  const next = structuredClone(batch);
  next.supersededBy = newBatchId;
  for (const item of next.queue) if (item.status === 'queued' || item.status === 'active') item.status = 'aborted';
  next.activeCount = 0;
  return next;
}

export function exploreCompletionAcceptance(batch, result) {
  const slot = batch?.slots?.[result?.slotIndex];
  const item = batch?.queue?.find((entry) => entry.slotIndex === result?.slotIndex && entry.designId === result?.designId);
  const rejected = !batch
    || batch.supersededBy
    || !slot
    || !item
    || batch.batchId !== result.batchId
    || slot.batchId !== result.batchId
    || slot.designId !== result.designId
    || batch.sourcePhotoKey !== result.sourcePhotoKey
    || batch.promptVersion !== result.promptVersion
    || result.promptVersion !== item.promptVersion
    || item.sourcePhotoKey !== result.sourcePhotoKey;
  if (rejected) return { accepted: false, cacheable: false, terminal: false, duplicate: false, supersededBy: batch?.supersededBy ?? null };
  const terminal = item.status === 'done' || item.status === 'failed' || slot.status === 'ready' || slot.status === 'failed';
  const duplicate = item.status !== 'active' && item.status !== 'queued';
  return { accepted: !terminal && !duplicate, cacheable: !terminal && !duplicate && result.ok === true, terminal, duplicate, supersededBy: null };
}

export function applyQueueCompletion(batch, result) {
  const next = structuredClone(batch);
  const acceptance = exploreCompletionAcceptance(next, result);
  const slot = next.slots[result.slotIndex];
  const item = next.queue.find((entry) => entry.slotIndex === result.slotIndex && entry.designId === result.designId);
  next.lastCompletionAcceptance = acceptance;
  if (!acceptance.accepted) {
    next.staleIgnored = (next.staleIgnored ?? 0) + 1;
    return next;
  }
  if (item.status === 'active') next.activeCount = Math.max(0, next.activeCount - 1);
  if (result.ok) {
    slot.status = 'ready';
    slot.imageUrl = result.url;
    item.status = 'done';
    next.completedCount += 1;
  } else {
    slot.status = 'failed';
    slot.errorCode = result.errorCode;
    item.status = 'failed';
    next.failedCount += 1;
  }
  return next;
}

export function detectImageMime(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png';
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return 'image/webp';
  return null;
}

function decodeBase64(base64) {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof globalThis.Buffer !== 'undefined') return Uint8Array.from(globalThis.Buffer.from(base64, 'base64'));
  throw new Error('No base64 decoder available');
}

export function normalizeProviderResult(input, context) {
  const base = { designId: context.designId, batchId: context.batchId, slotIndex: context.slotIndex };
  if (!input || input.ok === false) return { ok: false, errorCode: input?.errorCode ?? 'provider-shape', providerStatus: input?.providerStatus, ...base };
  if (input.url) return { ok: true, url: input.url, mimeType: input.mimeType ?? 'image/jpeg', bytes: input.bytes ?? 0, providerKind: 'url', providerStatus: input.providerStatus ?? 200, ...base };
  if (input.b64_json) {
    try {
      const bytes = decodeBase64(input.b64_json);
      const mimeType = input.mimeType ?? detectImageMime(bytes);
      if (!mimeType) return { ok: false, errorCode: 'decode', providerStatus: input.providerStatus, ...base };
      return { ok: true, url: `data:${mimeType};base64,${input.b64_json}`, mimeType, bytes: bytes.byteLength, providerKind: 'b64_json', providerStatus: input.providerStatus ?? 200, ...base };
    } catch {
      return { ok: false, errorCode: 'decode', providerStatus: input.providerStatus, ...base };
    }
  }
  return { ok: false, errorCode: 'provider-shape', providerStatus: input.providerStatus, ...base };
}

export function validateShortlist(selectedDesignIds, catalogRecordsById, settings) {
  if (!Array.isArray(selectedDesignIds) || selectedDesignIds.length < 1 || selectedDesignIds.length > 6) throw new TypeError('Shortlist must contain 1–6 ids');
  const seen = new Set();
  return selectedDesignIds.map((id) => {
    if (typeof id !== 'string' || !id.startsWith('HLM-')) throw new TypeError('Shortlist ids must be HLM-*');
    if (seen.has(id)) throw new TypeError(`Duplicate shortlist id ${id}`);
    seen.add(id);
    const record = catalogRecordsById instanceof Map ? catalogRecordsById.get(id) : catalogRecordsById[id];
    if (!record) throw new TypeError(`Unknown shortlist id ${id}`);
    if (!passesHardFeasibility(record, settings)) throw new TypeError(`Shortlist id is no longer feasible: ${id}`);
    return record;
  });
}

export function validateExploreHandoffPayload(payload) {
  assertNoBannedFaceKeys(payload);
  if (!payload?.frontOriginalDataUrl || !String(payload.frontOriginalDataUrl).startsWith('data:image/')) throw new TypeError('Original front photo is required');
  const forbidden = ['imageUrl', 'objectUrl', 'generatedImageUrl', 'generatedBlob', 'exploreResultUrl'];
  for (const key of forbidden) if (key in payload) throw new TypeError('Generated Explore artifacts cannot be handoff inputs');
  if (payload.catalogVersion !== catalogVersion) throw new TypeError(`Explore handoff catalogVersion must be ${catalogVersion}`);
  if (payload.promptVersion !== promptVersion) throw new TypeError(`Explore handoff promptVersion must be ${promptVersion}`);
  const records = validateShortlist(payload.selectedDesignIds, payload.catalogRecordsById, payload.exploreSettings);
  return { frontOriginalDataUrl: payload.frontOriginalDataUrl, selectedRecords: records, exploreSettings: normalizeSettings(payload.exploreSettings), catalogVersion, promptVersion };
}

export function catalogRecordToDesignLockCut(record) {
  requireFeasibility(record);
  const len = ['short', 'short', 'medium', 'long', 'long'][record.feasibility.targetLengthOrder];
  const tex = record.vector.permBucket > 0 ? 'wave' : record.vector.textureBucket >= 3 ? 'curl' : 'straight';
  return { hs: record.id, ko: record.nameKo, len, tex, catalogRecord: record, promptBlueprint: catalogRecordToThreeAngleBlueprint(record) };
}

export function catalogRecordToThreeAngleBlueprint(record) {
  requireFeasibility(record);
  return {
    designId: record.id,
    titleKo: record.promptAtoms?.titleKo ?? record.nameKo,
    structureKo: record.promptAtoms?.structureKo ?? record.featureKo,
    frontKo: record.promptAtoms?.frontKo ?? record.frontKo ?? '',
    finishKo: record.promptAtoms?.finishKo ?? record.finishKo ?? '',
    safetyKo: record.promptAtoms?.safetyKo ?? '원본 인물 정체성과 배경을 유지하고 무리한 화학 시술 표현을 피한다.',
    angleLocks: ['front', 'side', 'back'],
    sourceLineage: 'original-photos-only'
  };
}
