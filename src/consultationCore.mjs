import {
  EXPLORE_SELECTION_LIMIT,
  MAX_EXPLORE_ACTIVE,
  catalogVersion,
  promptVersion,
  normalizeSettings,
  selectDiverse100,
  selectNeighbor100,
  stableHash32,
} from './exploreCore.mjs';

export const CONSULTATION_HANDOFF_STORAGE_KEY = 'HAIRLOOM_CONSULTATION_HANDOFF';
export const CONSULTATION_HANDOFF_QUERY_TRIGGER = '/?consultationHandoff=1';
export const CONSULTATION_SLOT_COUNT = 100;
export const CONSULTATION_INITIAL_ACTIVE = MAX_EXPLORE_ACTIVE;
export const CONSULTATION_HARD_MAX_ACTIVE = 100;

export const TARGET_LENGTH_CM = Object.freeze({ US: 8, S: 18, MD: 36, L: 56, XL: 78 });
export const FINISH_SHRINKAGE = Object.freeze({
  '내추럴 스트레이트': 0,
  '내추럴 웨이브': 0.04,
  '내추럴 컬': 0.12,
  '내추럴 코일': 0.22,
  '루즈 C컬 펌': 0.03,
  '타이트 C컬 펌': 0.07,
  '루즈 S컬 펌': 0.05,
  '타이트 S컬 펌': 0.10,
  '바디 웨이브 펌': 0.04,
  '워터 웨이브 펌': 0.08,
  '스파이럴 펌': 0.14,
  '히피 펌': 0.18
});
export const CONSULTATION_MOODS = Object.freeze(['자연스러운', '부드러운', '단정한', '우아한', '시크한', '로맨틱한', '경쾌한', '과감한']);
export const TREND_STRUCTURE_BASES = Object.freeze([
  '에어리 레이어드', '버터플라이 레이어', '롱 허쉬', '허쉬 미디', '페이스프레임 미디', '레이어드 미디', '버터플라이 로브', '블런트 로브', '샤기 보브', '미니 보브', '프렌치 보브', '울프 미디', '턱선 블런트 보브', '그래듀에이티드 보브', '이탈리안 보브', '원랭스 미디', '옥토퍼스 미디', 'U라인 롱', '롱 샤그', '블런트 롱',
  '텍스처드 크롭', '프렌치 크롭', '리프컷', '소프트 투블럭', '쉼표머리', '미디엄 커튼', '브로 플로우', '미디엄 테이퍼', '소프트 멀릿', '울프컷', '텍스처드 퀴프', '아이비리그', '템플 페이드 크롭', '버스트 크롭', '댄디컷', '숏 모드컷', '미디엄 슬릭백', '미디엄 샤그', '레이어드 장발', '서퍼 롱'
]);
const TREND_STRUCTURE_RANK = new Map(TREND_STRUCTURE_BASES.map((name, index) => [name, index]));
const STRUCTURE_FINISH_PRIORITY = new Map([
  ['내추럴 스트레이트', 0], ['내추럴 웨이브', 1], ['루트 볼륨 펌', 2], ['루즈 C컬 펌', 3], ['루즈 S컬 펌', 4], ['바디 웨이브 펌', 5], ['내추럴 컬', 6], ['타이트 C컬 펌', 7], ['워터 웨이브 펌', 8], ['타이트 S컬 펌', 9], ['스파이럴 펌', 10], ['내추럴 코일', 11], ['히피 펌', 12]
]);
export const CONSULTATION_INTENSITIES = Object.freeze(['은은하게', '균형 있게', '확실하게']);

const GENDERS = new Set(['F', 'M']);
const TEXTURES = new Map([
  ['straight', '내추럴 스트레이트'], ['wave', '내추럴 웨이브'], ['wavy', '내추럴 웨이브'],
  ['curl', '내추럴 컬'], ['curly', '내추럴 컬'], ['coil', '내추럴 코일'], ['coily', '내추럴 코일'],
  ['직모', '내추럴 스트레이트'], ['반곱슬', '내추럴 웨이브'], ['곱슬', '내추럴 컬'], ['코일', '내추럴 코일']
]);
const DENSITIES = new Set(['low', 'normal', 'high']);
const DAMAGES = new Set(['low', 'medium', 'high']);
const NATURAL_FINISHES = new Set(['내추럴 스트레이트', '내추럴 웨이브', '내추럴 컬', '내추럴 코일']);
const PERM_CHECKS = ['탄력·인장 테스트', '테스트 컬', '중복 시술 구간', '약제 강도 하향', '컬 지름 확대', '손상 구간 커트'];
const LOW_DENSITY_WORDS = ['블런트', '원랭스', '라운드 컬', '큰 라운드', '높은 끝선'];

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeDiagnosis(raw = {}) {
  const gender = String(raw.profileGender ?? raw.gender ?? 'F').toUpperCase().startsWith('M') ? 'M' : 'F';
  if (!GENDERS.has(gender)) throw new TypeError('Invalid profile gender');
  const actualLengthCm = Math.max(0, finiteNumber(raw.actualLengthCm ?? raw.lengthCm ?? raw.currentLengthCm, 0));
  const textureKey = String(raw.naturalTexture ?? raw.texture ?? 'straight').trim();
  const naturalTexture = TEXTURES.get(textureKey) ?? TEXTURES.get(textureKey.toLowerCase())
    ?? (NATURAL_FINISHES.has(textureKey) ? textureKey : null);
  if (!naturalTexture) throw new TypeError('Invalid natural texture');
  const density = String(raw.density ?? raw.hairDensity ?? 'normal').toLowerCase();
  if (!DENSITIES.has(density)) throw new TypeError('Invalid density');
  const damage = String(raw.damage ?? raw.damageCondition ?? 'medium').toLowerCase();
  if (!DAMAGES.has(damage)) throw new TypeError('Invalid damage');
  const bleachCount = Math.max(0, Math.trunc(finiteNumber(raw.bleachCount ?? raw.bleachHistory, 0)));
  const monthsSincePerm = Math.max(0, finiteNumber(raw.monthsSincePerm ?? raw.permMonthsAgo, 999));
  return {
    profileGender: gender,
    actualLengthCm,
    naturalTexture,
    density,
    damage,
    bleachCount,
    monthsSincePerm,
    extensionAllowed: gender === 'F' && Boolean(raw.extensionAllowed ?? raw.extensionOrPieceAllowed ?? raw.allowExtensionOrPiece)
  };
}

function groupKey(record) {
  return [record.genderId, record.lengthId, record.baseKo, record.frontKo].join('|');
}

export function groupCoreCatalog(records) {
  const groups = new Map();
  for (const record of records) {
    if (record.kind !== 'core') continue;
    const key = groupKey(record);
    if (!groups.has(key)) groups.set(key, { id: key, key, genderId: record.genderId, lengthId: record.lengthId, lengthKo: record.lengthKo, baseKo: record.baseKo, frontKo: record.frontKo, finishRecords: [] });
    groups.get(key).finishRecords.push(record);
  }
  const result = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const group of result) {
    group.finishRecords.sort((a, b) => a.id.localeCompare(b.id));
    if (group.finishRecords.length !== 12) throw new TypeError(`Consultation group ${group.key} must have 12 finish records`);
  }
  if (result.length !== 500) throw new TypeError(`Consultation core catalog must produce 500 groups, got ${result.length}`);
  return result;
}
export const buildConsultationGroups = groupCoreCatalog;

export function expandStructureGroup(group) {
  const variations = [];
  for (const finishRecord of group.finishRecords) {
    for (const mood of CONSULTATION_MOODS) {
      for (const intensity of CONSULTATION_INTENSITIES) {
        variations.push({
          id: `${finishRecord.id}::${mood}::${intensity}`,
          designId: finishRecord.id,
          structureKey: group.key,
          genderId: group.genderId,
          lengthId: group.lengthId,
          lengthKo: group.lengthKo,
          baseKo: group.baseKo,
          frontKo: group.frontKo,
          finishKo: finishRecord.finishKo,
          mood,
          intensity,
          finishRecord
        });
      }
    }
  }
  return variations;
}
export const expandConsultationGroup = expandStructureGroup;

function statusRank(status) { return status === 'impossible' ? 3 : status === 'conditional' ? 2 : 1; }
function worse(a, b) { return statusRank(a) >= statusRank(b) ? a : b; }
function addReason(target, text) { if (!target.includes(text)) target.push(text); }

export function evaluateVariation(variation, rawDiagnosis) {
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const targetVisibleLengthCm = TARGET_LENGTH_CM[variation.lengthId];
  if (!targetVisibleLengthCm) throw new TypeError('Unknown target length');
  const shrinkageRate = FINISH_SHRINKAGE[variation.finishKo];
  if (shrinkageRate === undefined) throw new TypeError('Unknown finish shrinkage');
  const requiredPreTreatmentLengthCm = Number((targetVisibleLengthCm / (1 - shrinkageRate)).toFixed(2));
  const shortageCm = Number(Math.max(0, requiredPreTreatmentLengthCm - diagnosis.actualLengthCm).toFixed(2));
  const reasons = [];
  const stylistChecks = [];
  let status = 'possible';
  let extensionNeed = 'none';

  if (variation.genderId !== diagnosis.profileGender) {
    status = 'impossible';
    addReason(reasons, '프로필 성별과 맞지 않음');
  }

  if (shortageCm > 0) {
    if (!diagnosis.extensionAllowed) {
      status = 'impossible';
      addReason(reasons, '현재 길이가 부족하고 붙임·피스가 허용되지 않음');
    } else if (shortageCm <= 18) {
      status = worse(status, 'conditional');
      extensionNeed = 'piece';
      addReason(reasons, '부분 피스 확인 필요');
      addReason(stylistChecks, '피스 고정 위치');
    } else if (shortageCm <= 50) {
      status = worse(status, 'conditional');
      extensionNeed = 'extension';
      addReason(reasons, '붙임머리 확인 필요');
      addReason(stylistChecks, '두피 부담');
    } else {
      status = 'impossible';
      extensionNeed = 'too-long';
      addReason(reasons, '부족 길이가 50cm 초과');
    }
  }
  if ((extensionNeed === 'extension' || extensionNeed === 'piece') && (diagnosis.damage === 'high' || diagnosis.density === 'low') && shortageCm > 18) {
    status = 'impossible';
    addReason(reasons, '손상·모량 조건에서 큰 연장 불가');
  }

  const isNatural = NATURAL_FINISHES.has(variation.finishKo);
  if (isNatural) {
    if (variation.finishKo === diagnosis.naturalTexture) {
      // possible unless other constraints downgraded it.
    } else if (diagnosis.naturalTexture === '내추럴 웨이브' && variation.finishKo === '내추럴 스트레이트') {
      status = worse(status, 'conditional');
      addReason(reasons, '드라이·아이론 재현 확인');
      addReason(stylistChecks, '일시 세팅 유지력');
    } else {
      status = 'impossible';
      addReason(reasons, '자연 모질만으로 재현 어려움');
    }
  } else {
    if (diagnosis.damage === 'high' || diagnosis.bleachCount >= 2 || diagnosis.monthsSincePerm < 3) {
      status = 'impossible';
      addReason(reasons, '펌 금기 조건');
    } else if (diagnosis.damage === 'medium' || diagnosis.bleachCount === 1 || diagnosis.monthsSincePerm < 6 || ['내추럴 컬', '내추럴 코일'].includes(diagnosis.naturalTexture) || variation.intensity === '확실하게') {
      status = worse(status, 'conditional');
      addReason(reasons, '펌 전 테스트 필요');
      for (const check of PERM_CHECKS) addReason(stylistChecks, check);
    }
  }

  if (diagnosis.density === 'low' && LOW_DENSITY_WORDS.some((word) => variation.baseKo.includes(word))) {
    status = worse(status, 'conditional');
    addReason(reasons, '낮은 모량 구조 보정 필요');
    addReason(stylistChecks, '끝선 보강');
  }

  if (reasons.length === 0) addReason(reasons, '현재 조건 적합');
  return { status, reasons, requiredPreTreatmentLengthCm, shortageCm, shrinkageRate, extensionNeed, stylistChecks };
}

export function summarizeStructureFeasibility(group, diagnosis) {
  const counts = { possible: 0, conditional: 0, impossible: 0, total: 0 };
  for (const finishRecord of group.finishRecords) {
    for (const intensity of CONSULTATION_INTENSITIES) {
      const variation = {
        id: `${finishRecord.id}::summary::${intensity}`,
        designId: finishRecord.id,
        structureKey: group.key,
        genderId: group.genderId,
        lengthId: group.lengthId,
        baseKo: group.baseKo,
        frontKo: group.frontKo,
        finishKo: finishRecord.finishKo,
        mood: CONSULTATION_MOODS[0],
        intensity,
        finishRecord
      };
      counts[evaluateVariation(variation, diagnosis).status] += CONSULTATION_MOODS.length;
      counts.total += CONSULTATION_MOODS.length;
    }
  }
  return counts;
}
export const summarizeGroupFeasibility = summarizeStructureFeasibility;

export function selectConsultationStructureDesignIds(groups, rawDiagnosis, limit = 100) {
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const target = Math.max(1, Math.min(CONSULTATION_SLOT_COUNT, Math.trunc(Number(limit) || CONSULTATION_SLOT_COUNT)));
  const order = { possible: 0, conditional: 1, impossible: 2 };
  const finishRank = (record) => record.finishKo === diagnosis.naturalTexture ? -1 : (STRUCTURE_FINISH_PRIORITY.get(record.finishKo) ?? Number.MAX_SAFE_INTEGER);
  const candidates = [];
  for (const group of groups) {
    const rankedRecords = [...(group.finishRecords ?? [])]
      .map((record) => ({
        record,
        status: evaluateVariation({ ...record, designId: record.id, finishRecord: record, mood: CONSULTATION_MOODS[0], intensity: CONSULTATION_INTENSITIES[1] }, diagnosis).status
      }))
      .sort((a, b) => order[a.status] - order[b.status] || finishRank(a.record) - finishRank(b.record) || a.record.id.localeCompare(b.record.id));
    const representative = rankedRecords.find((candidate) => candidate.status !== 'impossible');
    if (!representative) continue;
    candidates.push({
      designId: representative.record.id,
      structureKey: group.key,
      status: representative.status,
      trendRank: TREND_STRUCTURE_RANK.get(group.baseKo) ?? Number.MAX_SAFE_INTEGER
    });
  }
  candidates.sort((a, b) => order[a.status] - order[b.status] || a.trendRank - b.trendRank || a.structureKey.localeCompare(b.structureKey));
  const selected = candidates.slice(0, target);
  if (selected.length !== target) throw new TypeError(`Consultation structure preview requires ${target} feasible groups, got ${selected.length}`);
  return { designIds: selected.map((item) => item.designId), structureKeys: selected.map((item) => item.structureKey) };
}

const MOOD_ALIASES = Object.freeze({
  '자연스러운': ['자연', '내추럴'],
  '부드러운': ['부드럽', '소프트'],
  '단정한': ['단정', '정돈'],
  '우아한': ['우아', '엘레강'],
  '시크한': ['시크'],
  '로맨틱한': ['로맨틱', '사랑스'],
  '경쾌한': ['경쾌', '가벼'],
  '과감한': ['과감', '강렬']
});

export function rankVariationsByMood(variations, moodText = '') {
  const text = String(moodText).normalize('NFKC').toLowerCase();
  const negativePlain = /너무|싫|과하지|부담|꾸민/.test(text);
  return [...variations].sort((a, b) => {
    const score = (variation) => {
      const terms = [variation.mood, ...(MOOD_ALIASES[variation.mood] ?? [])];
      const moodScore = terms.some((term) => text.includes(term.toLowerCase())) ? 20 : 0;
      const intensityScore = text.includes(variation.intensity) ? 5 : 0;
      return moodScore + intensityScore - (negativePlain && variation.intensity === '확실하게' ? 6 : 0);
    };
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
}
export const rankConsultationVariations = rankVariationsByMood;

export function selectConsultationDesignIds(indexRecords, rawSettings, options = {}) {
  const records = options.diagnosis && indexRecords.some((record) => record.finishKo)
    ? indexRecords.filter((record) => {
      if (!record.finishKo || !record.lengthId || !record.genderId) return false;
      const variation = {
        id: record.id,
        designId: record.id,
        genderId: record.genderId,
        lengthId: record.lengthId,
        baseKo: record.baseKo,
        frontKo: record.frontKo,
        finishKo: record.finishKo,
        mood: options.mood || '자연스러운',
        intensity: options.intensity || '균형 있게',
        finishRecord: record
      };
      return evaluateVariation(variation, options.diagnosis).status !== 'impossible';
    })
    : indexRecords;
  const result = options.centerDesignId
    ? selectNeighbor100(records, rawSettings, options.centerDesignId, options.seedInput ?? '')
    : selectDiverse100(records, rawSettings, options.seedInput ?? '');
  const unique = [...new Set(result.designIds)].slice(0, EXPLORE_SELECTION_LIMIT);
  return { ...result, designIds: unique, originalPhotoLineage: { source: 'prepared-original-front-photo', memoryOnly: true }, hardFeasibilityPreserved: true };
}

function makeSlots(designIds) {
  const ids = [...new Set(designIds)].slice(0, CONSULTATION_SLOT_COUNT);
  if (ids.length !== CONSULTATION_SLOT_COUNT) throw new TypeError('Consultation batch requires exactly 100 unique design IDs');
  return ids.map((designId, index) => ({ slotIndex: index, designId, status: 'queued', generation: 0, attempts: 0, result: null, errorCode: null }));
}

export function createConsultationBatch({ batchId, designIds, sourcePhotoKey, settings, metadata = {} }) {
  if (!batchId || !sourcePhotoKey) throw new TypeError('batchId and sourcePhotoKey are required');
  return { batchId, sourcePhotoKey, settings: normalizeSettings(settings), metadata: { ...metadata, originalPhotoLineage: 'prepared-original-front-photo' }, slots: makeSlots(designIds), activeLimit: CONSULTATION_INITIAL_ACTIVE, successWindow: 0, pressureWindow: 0 };
}

export function assignConsultationSourceViews(batch, rawViewKeys, seedInput = '') {
  if (!batch?.slots || !Array.isArray(batch.slots)) throw new TypeError('Consultation batch slots are required');
  const canonicalViews = ['front', 'side', 'back', 'crown', 'nape', 'detail'];
  const provided = new Set(rawViewKeys ?? []);
  const viewKeys = canonicalViews.filter((key) => provided.has(key));
  if (!viewKeys.includes('front')) throw new TypeError('Front source view is required');
  const slotOrder = [...batch.slots].sort((a, b) => {
    const seed = `${batch.sourcePhotoKey}:${seedInput}`;
    const left = stableHash32(`${seed}:${a.slotIndex}:${a.designId}`);
    const right = stableHash32(`${seed}:${b.slotIndex}:${b.designId}`);
    return left - right || a.slotIndex - b.slotIndex;
  });
  const viewBySlot = new Map(slotOrder.map((slot, index) => [slot.slotIndex, viewKeys[index % viewKeys.length]]));
  return {
    ...batch,
    metadata: { ...batch.metadata, originalPhotoLineage: 'prepared-original-source-views', sourceViewKeys: viewKeys },
    slots: batch.slots.map((slot) => ({ ...slot, sourceViewKey: viewBySlot.get(slot.slotIndex) }))
  };
}

export function startConsultationQueuedItems(batch) {
  const next = { ...batch, slots: batch.slots.map((slot) => ({ ...slot })) };
  if (next.supersededBy) return next;
  const active = next.slots.filter((slot) => slot.status === 'active').length;
  let capacity = Math.max(0, Math.min(next.activeLimit, CONSULTATION_HARD_MAX_ACTIVE) - active);
  for (const slot of next.slots) {
    if (capacity <= 0) break;
    if (slot.status === 'queued') {
      slot.status = 'active';
      slot.generation += 1;
      slot.attempts += 1;
      capacity -= 1;
    }
  }
  return next;
}

export function supersedeConsultationBatch(batch, supersededBy) {
  return {
    ...batch,
    supersededBy,
    slots: batch.slots.map((slot) => slot.status === 'queued' || slot.status === 'active' ? { ...slot, status: 'aborted' } : { ...slot })
  };
}

function adaptLimit(batch, outcome) {
  if (outcome === 'success') {
    const successWindow = batch.successWindow + 1;
    const raise = successWindow >= 8;
    return { activeLimit: raise ? Math.min(CONSULTATION_HARD_MAX_ACTIVE, batch.activeLimit + 8) : batch.activeLimit, successWindow: raise ? 0 : successWindow, pressureWindow: 0 };
  }
  const pressure = outcome === 'pressure';
  return { activeLimit: pressure ? Math.max(CONSULTATION_INITIAL_ACTIVE, Math.floor(batch.activeLimit * 0.75)) : batch.activeLimit, successWindow: 0, pressureWindow: pressure ? batch.pressureWindow + 1 : batch.pressureWindow };
}

export function applyConsultationCompletion(batch, result) {
  const index = Number(result?.slotIndex);
  const slot = batch.slots[index];
  const stale = batch.supersededBy
    || (result.batchId && result.batchId !== batch.batchId)
    || (result.sourcePhotoKey && result.sourcePhotoKey !== batch.sourcePhotoKey)
    || !slot
    || slot.designId !== result.designId
    || slot.status !== 'active'
    || slot.generation !== result.generation;
  if (stale) return { batch, accepted: false, reason: 'stale' };
  const next = { ...batch, slots: batch.slots.map((item) => ({ ...item })) };
  const nextSlot = next.slots[index];
  if (result.ok) {
    nextSlot.status = 'done';
    nextSlot.result = { ok: true };
    nextSlot.errorCode = null;
    Object.assign(next, adaptLimit(next, 'success'));
  } else {
    const pressure = [429, 500, 502, 503, 504].includes(Number(result.statusCode)) || result.errorType === 'network';
    const retryable = pressure && nextSlot.attempts < 2;
    nextSlot.status = retryable ? 'queued' : 'failed';
    nextSlot.result = null;
    nextSlot.errorCode = result.errorType || (result.statusCode ? `http-${result.statusCode}` : 'provider');
    Object.assign(next, adaptLimit(next, pressure ? 'pressure' : 'failure'));
  }
  return { batch: next, accepted: true, reason: 'accepted' };
}

function rejectGenerated(value, path = 'handoff') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/generated|result|output|imageUrl|artifact/i.test(key)) throw new TypeError(`${path} must not include generated artifacts`);
    rejectGenerated(child, `${path}.${key}`);
  }
}

function normalizeSourceViews(raw = {}, originalFrontDataUrl = '') {
  const allowed = ['front', 'side', 'back', 'crown', 'nape', 'detail'];
  const views = { front: originalFrontDataUrl, side: '', back: '', crown: '', nape: '', detail: '' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return views;
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) throw new TypeError(`Unexpected source view: ${key}`);
    if (value && !String(value).startsWith('data:image/')) throw new TypeError(`Source view ${key} must be an original image data URL`);
    views[key] = String(value || '');
  }
  views.front ||= originalFrontDataUrl;
  return views;
}

export function buildConsultationHandoff(payload = {}) {
  rejectGenerated(payload);
  const originalFrontDataUrl = String(payload.originalFrontDataUrl ?? '');
  if (!originalFrontDataUrl.startsWith('data:image/')) throw new TypeError('originalFrontDataUrl is required');
  const currentDesignIds = [...new Set(payload.currentDesignIds ?? payload.currentHlmIds ?? [])];
  if (currentDesignIds.length < 1 || currentDesignIds.length > 6 || currentDesignIds.some((id) => !/^HLM-/.test(String(id)))) throw new TypeError('1-6 current HLM design IDs are required');
  return {
    originalFrontDataUrl,
    currentDesignIds,
    sourceViews: normalizeSourceViews(payload.sourceViews, originalFrontDataUrl),
    settings: normalizeSettings(payload.settings ?? payload.exploreSettings ?? {}),
    diagnosis: normalizeDiagnosis(payload.diagnosis ?? {}),
    decision: { ...(payload.decision ?? payload.decisionMetadata ?? {}) },
    catalogVersion: String(payload.catalogVersion ?? catalogVersion),
    promptVersion: String(payload.promptVersion ?? promptVersion)
  };
}

export function validateConsultationHandoff(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Consultation handoff payload is required');
  const allowed = new Set(['originalFrontDataUrl', 'currentDesignIds', 'sourceViews', 'settings', 'diagnosis', 'decision', 'catalogVersion', 'promptVersion']);
  for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new TypeError(`Unexpected consultation handoff field: ${key}`);
  if (!payload.catalogVersion || !payload.promptVersion) throw new TypeError('Consultation handoff versions are required');
  const validated = buildConsultationHandoff(payload);
  if (validated.catalogVersion !== catalogVersion || validated.promptVersion !== promptVersion) throw new TypeError('Consultation handoff version mismatch');
  return validated;
}
export const validateConsultationHandoffPayload = validateConsultationHandoff;
