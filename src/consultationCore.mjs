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
export const CONSULTATION_HANDOFF_SCHEMA_VERSION = 2;
export const CONSULTATION_GENERATION_AXES_VERSION = 2;
export const CONSULTATION_SOURCE_TRANSFORM_VERSION = 1;
export const CONSULTATION_LEGACY_CATALOG_VERSION = 'HLM-MASTER-2026-07-EXPLORE-1';
export const CONSULTATION_LEGACY_PROMPT_VERSION = 'HLM-EXPLORE-PROMPT-2026-07-1';

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

export const HAIR_COLOR_TONES = Object.freeze([
  Object.freeze({ id: 'natural-black', labelKo: '자연 흑색', level: 1, undertone: 'neutral' }),
  Object.freeze({ id: 'soft-black', labelKo: '소프트 블랙', level: 2, undertone: 'neutral' }),
  Object.freeze({ id: 'dark-brown', labelKo: '다크 브라운', level: 3, undertone: 'neutral' }),
  Object.freeze({ id: 'chocolate-brown', labelKo: '초콜릿 브라운', level: 4, undertone: 'warm' }),
  Object.freeze({ id: 'mocha-brown', labelKo: '모카 브라운', level: 4, undertone: 'neutral' }),
  Object.freeze({ id: 'muted-ash-brown', labelKo: '뮤트 애쉬 브라운', level: 5, undertone: 'cool' }),
  Object.freeze({ id: 'warm-brown', labelKo: '웜 브라운', level: 5, undertone: 'warm' })
]);
export const PRESERVE_CURRENT_TONE_ID = 'preserve-current';
const HAIR_COLOR_TONE_BY_ID = new Map(HAIR_COLOR_TONES.map((tone) => [tone.id, tone]));
const SOURCE_VIEW_KEYS = Object.freeze(['front', 'side', 'back', 'crown', 'nape', 'detail']);
const CORE_ID_PATTERN = /^HLM-C-([FM])-(US|S|MD|L|XL)-(\d{2})-([A-Z]{2})-([A-Z]{2})$/;
const SUITABILITY_FLOOR = 60;

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

function coreTaxonomy(record = {}) {
  if (record.baseId && record.frontId && record.finishId) {
    return { genderId: record.genderId, lengthId: record.lengthId, baseId: record.baseId, frontId: record.frontId, finishId: record.finishId };
  }
  const match = CORE_ID_PATTERN.exec(String(record.id ?? ''));
  if (!match) throw new TypeError(`Invalid core design ID: ${record.id ?? ''}`);
  const [, genderId, lengthId, baseIndex, frontId, finishId] = match;
  return { genderId, lengthId, baseId: `${genderId}-${lengthId}-${baseIndex}`, frontId, finishId };
}

export function canonicalStructureKey(record) {
  const { genderId, lengthId, baseId, frontId } = coreTaxonomy(record);
  return [genderId, lengthId, baseId, frontId].join('|');
}

export function legacyStructureKey(record) {
  return [record.genderId, record.lengthId, record.baseKo, record.frontKo].join('|');
}

export function migrateConsultationStructureKeyV1(value, recordsOrGroups = []) {
  const key = String(value ?? '');
  const canonical = new Set();
  const legacyToCanonical = new Map();
  for (const item of recordsOrGroups ?? []) {
    const record = item?.finishRecords?.[0] ?? item;
    if (!record?.id || record.kind === 'special') continue;
    const current = canonicalStructureKey(record);
    canonical.add(current);
    const legacy = legacyStructureKey(record);
    const prior = legacyToCanonical.get(legacy);
    if (prior && prior !== current) throw new TypeError(`Ambiguous legacy consultation structure key: ${legacy}`);
    legacyToCanonical.set(legacy, current);
  }
  if (canonical.has(key)) return key;
  const migrated = legacyToCanonical.get(key);
  if (!migrated) throw new TypeError(`Unknown consultation structure key: ${key}`);
  return migrated;
}

export function validateStableTaxonomyIds(records) {
  const structureKeys = new Set();
  const tuples = new Set();
  let coreCount = 0;
  for (const record of records ?? []) {
    if (record.kind !== 'core') continue;
    coreCount += 1;
    const taxonomy = coreTaxonomy(record);
    const tuple = [taxonomy.baseId, taxonomy.frontId, taxonomy.finishId].join('|');
    if (tuples.has(tuple)) throw new TypeError(`Duplicate stable taxonomy tuple: ${tuple}`);
    tuples.add(tuple);
    structureKeys.add(canonicalStructureKey(record));
  }
  if (coreCount && structureKeys.size * 12 !== coreCount) throw new TypeError('Stable taxonomy structure cardinality mismatch');
  return { coreCount, structureCount: structureKeys.size, tupleCount: tuples.size };
}

function normalizeSourceViewMaskProfiles(raw = {}) {
  const profiles = {};
  for (const viewKey of SOURCE_VIEW_KEYS) {
    const value = raw?.[viewKey] ?? {};
    profiles[viewKey] = Object.freeze({ revision: Math.max(0, Math.trunc(finiteNumber(value.revision, 0))), confirmed: Boolean(value.confirmed) });
  }
  return Object.freeze(profiles);
}

export function normalizeHairColorProfile(raw = {}) {
  const requestedCurrent = String(raw.currentToneId ?? 'unknown');
  const currentToneId = requestedCurrent === 'unknown' || HAIR_COLOR_TONE_BY_ID.has(requestedCurrent) ? requestedCurrent : 'unknown';
  const requested = Array.isArray(raw.selectedToneIds) ? raw.selectedToneIds.map(String) : [];
  const validSelected = requested.filter((toneId) => toneId === PRESERVE_CURRENT_TONE_ID || HAIR_COLOR_TONE_BY_ID.has(toneId));
  const defaultTone = currentToneId === 'unknown' ? PRESERVE_CURRENT_TONE_ID : currentToneId;
  const selectedToneIds = [...new Set(validSelected.length ? validSelected : [defaultTone])];
  const intensity = raw.intensity === 'balanced' ? 'balanced' : 'subtle';
  return Object.freeze({
    currentToneId,
    selectedToneIds: Object.freeze(selectedToneIds),
    intensity,
    sourceViewMasks: normalizeSourceViewMaskProfiles(raw.sourceViewMasks ?? raw.maskProfiles)
  });
}

export function deriveAllowedHairColorTones(rawProfile = {}, rawDiagnosis = {}) {
  const profile = normalizeHairColorProfile(rawProfile);
  if (profile.currentToneId === 'unknown') return Object.freeze([{ id: PRESERVE_CURRENT_TONE_ID, labelKo: '현재 색상 유지', level: null, undertone: 'source' }]);
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const current = HAIR_COLOR_TONE_BY_ID.get(profile.currentToneId);
  if (profile.currentToneId === 'natural-black') {
    return Object.freeze(['natural-black', 'soft-black', 'dark-brown'].map((id) => HAIR_COLOR_TONE_BY_ID.get(id)));
  }
  const maxDelta = diagnosis.damage === 'high' ? 1 : 2;
  return Object.freeze(HAIR_COLOR_TONES.filter((tone) => Math.abs(tone.level - current.level) <= maxDelta));
}

export function evaluateHairColorFeasibility(targetToneId, rawProfile = {}, rawDiagnosis = {}, sourceViewKey = 'front') {
  const profile = normalizeHairColorProfile(rawProfile);
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const targetId = String(targetToneId ?? PRESERVE_CURRENT_TONE_ID);
  const reasons = [];
  if (!SOURCE_VIEW_KEYS.includes(sourceViewKey)) return { status: 'impossible', reasons: ['알 수 없는 원본 뷰'], levelDelta: null };
  if (targetId === PRESERVE_CURRENT_TONE_ID || targetId === profile.currentToneId) return { status: 'possible', reasons: ['현재 색상 유지'], levelDelta: 0 };
  if (profile.currentToneId === 'unknown') return { status: 'impossible', reasons: ['현재 머리색 선택 필요'], levelDelta: null };
  const allowed = new Set(deriveAllowedHairColorTones(profile, diagnosis).map((tone) => tone.id));
  if (!allowed.has(targetId)) return { status: 'impossible', reasons: ['현재 모발 상태에서 허용되지 않는 색상'], levelDelta: null };
  if (!profile.sourceViewMasks[sourceViewKey]?.confirmed) return { status: 'impossible', reasons: [`${sourceViewKey.toUpperCase()} 헤어 마스크 확인 필요`], levelDelta: null };
  const current = HAIR_COLOR_TONE_BY_ID.get(profile.currentToneId);
  const target = HAIR_COLOR_TONE_BY_ID.get(targetId);
  const levelDelta = Math.abs(target.level - current.level);
  let status = 'possible';
  if (diagnosis.damage === 'high' || (diagnosis.damage === 'medium' && levelDelta >= 2) || diagnosis.bleachCount >= 2) {
    status = 'conditional';
    reasons.push('저자극 색상 시술 확인 필요');
  }
  if (!reasons.length) reasons.push('자연 색상 범위 적합');
  return { status, reasons, levelDelta, currentTone: current, targetTone: target };
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
  return canonicalStructureKey(record);
}

export function groupCoreCatalog(records) {
  const groups = new Map();
  for (const record of records) {
    if (record.kind !== 'core') continue;
    const key = groupKey(record);
    const taxonomy = coreTaxonomy(record);
    if (!groups.has(key)) groups.set(key, { id: key, key, legacyKey: legacyStructureKey(record), genderId: record.genderId, lengthId: record.lengthId, lengthKo: record.lengthKo, baseId: taxonomy.baseId, frontId: taxonomy.frontId, baseKo: record.baseKo, frontKo: record.frontKo, finishRecords: [] });
    groups.get(key).finishRecords.push({ ...record, ...taxonomy });
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
          baseId: group.baseId,
          frontId: group.frontId,
          baseKo: group.baseKo,
          frontKo: group.frontKo,
          finishKo: finishRecord.finishKo,
          finishId: coreTaxonomy(finishRecord).finishId,
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

function finishFamily(record) {
  const finish = String(record.finishKo ?? '');
  if (NATURAL_FINISHES.has(finish)) return 'natural-soft';
  if (/타이트|스파이럴|히피|워터|코일/.test(finish)) return 'expressive';
  return 'salon-soft';
}

function baseFamily(record) {
  const base = String(record.baseKo ?? '');
  if (/크롭|버즈|크루|아이비|시저|페이드|테이퍼/.test(base)) return 'crop-short';
  if (/단발|보브|로브|원랭스|블런트/.test(base)) return 'compact-line';
  if (/허쉬|샤그|울프|멀릿|옥토퍼스/.test(base)) return 'shag-layer';
  if (/레이어|페이스프레임|버터플라이/.test(base)) return 'soft-layer';
  if (/리프|커튼|플로우|슬릭|사이드 파트|쉼표/.test(base)) return 'flow-part';
  if (/롱|장발|라푼젤|웨이스트|히메/.test(base)) return 'long-line';
  return `other-${record.lengthId ?? 'unknown'}`;
}

function frontFamily(record) {
  const front = String(record.frontKo ?? '');
  if (/노 프린지|오픈|클린|업 |리프트/.test(front)) return 'open';
  if (/커튼|센터/.test(front)) return 'center';
  if (/사이드|스웹트|파트/.test(front)) return 'side';
  if (/블런트|풀뱅|마이크로|프린지|뱅/.test(front)) return 'fringe';
  return 'other';
}

function maintenanceScore(record, preference = 'medium') {
  const family = finishFamily(record);
  if (preference === 'low') return family === 'natural-soft' ? 10 : family === 'salon-soft' ? 6 : 2;
  if (preference === 'high') return family === 'expressive' ? 10 : family === 'salon-soft' ? 9 : 7;
  return family === 'expressive' ? 6 : family === 'salon-soft' ? 9 : 10;
}

export function scoreConsultationSuitability(candidate, rawDiagnosis, preferences = {}) {
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const evaluation = evaluateVariation(candidate, diagnosis);
  if (evaluation.status === 'impossible') {
    return { total: 0, suitable: false, components: { lengthStructure: 0, texture: 0, damageChemical: 0, density: 0, preference: 0, maintenance: 0, trend: 0 }, reasons: [...evaluation.reasons] };
  }
  const currentTexture = candidate.finishKo === diagnosis.naturalTexture;
  const texture = currentTexture ? 20 : NATURAL_FINISHES.has(candidate.finishKo) ? 12 : finishFamily(candidate) === 'expressive' ? 10 : 15;
  const lengthStructure = evaluation.status === 'possible' ? 30 : evaluation.shortageCm <= 18 ? 24 : 20;
  const damageChemical = evaluation.status === 'possible' ? 15 : 8;
  const density = diagnosis.density === 'low' && LOW_DENSITY_WORDS.some((word) => String(candidate.baseKo).includes(word)) ? 5 : 10;
  const moodText = String(preferences.mood ?? preferences.preferenceText ?? '').normalize('NFKC').toLowerCase();
  const moodTerms = [candidate.mood, ...(MOOD_ALIASES[candidate.mood] ?? []), candidate.baseKo, candidate.frontKo].filter(Boolean).map((value) => String(value).toLowerCase());
  const preference = moodText && moodTerms.some((term) => moodText.includes(term)) ? 10 : moodText ? 6 : 8;
  const maintenance = maintenanceScore(candidate, preferences.maintenance ?? 'medium');
  const trend = TREND_STRUCTURE_RANK.has(candidate.baseKo) ? 5 : 2;
  const components = { lengthStructure, texture, damageChemical, density, preference, maintenance, trend };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { total, suitable: total >= SUITABILITY_FLOOR, components, reasons: [...evaluation.reasons, `적합도 ${total}/100`] };
}

export function buildConsultationCandidatePool(groups, rawDiagnosis, preferences = {}) {
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const candidates = [];
  for (const group of groups ?? []) {
    for (const record of group.finishRecords ?? []) {
      const taxonomy = coreTaxonomy(record);
      const intensity = finishFamily(record) === 'expressive' ? '은은하게' : '균형 있게';
      const candidate = {
        ...record,
        ...taxonomy,
        id: record.id,
        designId: record.id,
        structureKey: group.key,
        baseFamily: baseFamily(record),
        frontFamily: frontFamily(record),
        finishFamily: finishFamily(record),
        mood: preferences.mood || CONSULTATION_MOODS[0],
        intensity,
        finishRecord: record
      };
      const suitability = scoreConsultationSuitability(candidate, diagnosis, preferences);
      if (suitability.suitable) candidates.push({ ...candidate, suitability });
    }
  }
  return candidates.sort((a, b) => b.suitability.total - a.suitability.total || a.id.localeCompare(b.id));
}

function categoricalDistance(candidate, selected) {
  if (!selected.length) return 6;
  let minimum = 6;
  for (const other of selected) {
    const distance = Number(candidate.baseFamily !== other.baseFamily)
      + Number(candidate.frontFamily !== other.frontFamily)
      + Number(candidate.finishFamily !== other.finishFamily)
      + Number(candidate.finishId !== other.finishId)
      + Number(candidate.lengthId !== other.lengthId)
      + Number(candidate.baseId !== other.baseId);
    minimum = Math.min(minimum, distance);
  }
  return minimum;
}

function balancedAssignments(values, count) {
  if (!values.length) throw new TypeError('At least one assignment value is required');
  return Array.from({ length: count }, (_, index) => values[index % values.length]);
}

function colorAssignments(profile, count) {
  const current = profile.currentToneId === 'unknown' ? PRESERVE_CURRENT_TONE_ID : profile.currentToneId;
  const selected = [...new Set(profile.selectedToneIds.map((toneId) => toneId === PRESERVE_CURRENT_TONE_ID ? current : toneId))];
  const other = selected.filter((toneId) => toneId !== current);
  if (!other.length) return Array(count).fill(current);
  if (!selected.includes(current)) return balancedAssignments(selected, count);
  const reserve = Math.min(count, Math.round(count * 0.2));
  return [...Array(reserve).fill(current), ...balancedAssignments(other, count - reserve)];
}

export function assignConsultationGenerationAxes(candidates, options = {}) {
  const count = candidates.length;
  const viewKeys = SOURCE_VIEW_KEYS.filter((key) => new Set(options.sourceViewKeys ?? ['front']).has(key));
  if (!viewKeys.includes('front')) throw new TypeError('Front source view is required');
  const profile = normalizeHairColorProfile(options.hairColorProfile);
  const diagnosis = normalizeDiagnosis(options.diagnosis ?? {});
  const seed = String(options.seedInput ?? 'consultation-axes');
  const ordered = candidates.map((candidate, index) => ({ candidate, index, hash: stableHash32(`${seed}:${candidate.designId}:${index}`) }))
    .sort((a, b) => a.hash - b.hash || a.index - b.index);
  const views = balancedAssignments(viewKeys, count);
  const tones = colorAssignments(profile, count);
  const assigned = new Array(count);
  const viewOccurrence = new Map();
  ordered.forEach((entry, orderIndex) => {
    const sourceViewKey = views[orderIndex];
    const occurrence = viewOccurrence.get(sourceViewKey) ?? 0;
    viewOccurrence.set(sourceViewKey, occurrence + 1);
    const colorToneId = tones[orderIndex];
    const color = evaluateHairColorFeasibility(colorToneId, profile, diagnosis, sourceViewKey);
    if (color.status === 'impossible') throw new TypeError(color.reasons.join(' · '));
    const candidate = entry.candidate;
    const taxonomy = coreTaxonomy(candidate);
    assigned[entry.index] = {
      ...candidate,
      generationAxes: Object.freeze({
        version: CONSULTATION_GENERATION_AXES_VERSION,
        sourceViewKey,
        mirrored: occurrence % 2 === 1,
        sourceTransformVersion: CONSULTATION_SOURCE_TRANSFORM_VERSION,
        structureKey: candidate.structureKey ?? canonicalStructureKey(candidate),
        baseId: taxonomy.baseId,
        frontId: taxonomy.frontId,
        finishId: taxonomy.finishId,
        baseFamily: candidate.baseFamily ?? baseFamily(candidate),
        frontFamily: candidate.frontFamily ?? frontFamily(candidate),
        finishFamily: candidate.finishFamily ?? finishFamily(candidate),
        intensity: candidate.intensity === '은은하게' ? 'subtle' : 'balanced',
        colorToneId,
        suitabilityScore: candidate.suitability?.total ?? scoreConsultationSuitability(candidate, diagnosis, options.preferences).total
      })
    };
  });
  return assigned;
}

export function validateConsultationGenerationAxes(items, options = {}) {
  const signatures = new Set();
  const viewCounts = new Map();
  const mirrorCounts = new Map();
  for (const item of items ?? []) {
    const axes = item.generationAxes ?? item;
    if (axes.version !== CONSULTATION_GENERATION_AXES_VERSION) throw new TypeError('Generation axes version mismatch');
    if (!SOURCE_VIEW_KEYS.includes(axes.sourceViewKey)) throw new TypeError('Invalid generation source view');
    if (axes.suitabilityScore < SUITABILITY_FLOOR) throw new TypeError('Generation axes suitability below floor');
    const signature = [axes.structureKey, axes.finishId, axes.intensity, axes.colorToneId, axes.sourceViewKey, axes.mirrored].join('|');
    if (signatures.has(signature)) throw new TypeError(`Duplicate generation axes signature: ${signature}`);
    signatures.add(signature);
    viewCounts.set(axes.sourceViewKey, (viewCounts.get(axes.sourceViewKey) ?? 0) + 1);
    const mirror = mirrorCounts.get(axes.sourceViewKey) ?? { mirrored: 0, original: 0 };
    mirror[axes.mirrored ? 'mirrored' : 'original'] += 1;
    mirrorCounts.set(axes.sourceViewKey, mirror);
  }
  const counts = [...viewCounts.values()];
  if (counts.length > 1 && Math.max(...counts) - Math.min(...counts) > 1) throw new TypeError('Generation source views are unbalanced');
  for (const value of mirrorCounts.values()) if (Math.abs(value.mirrored - value.original) > 1) throw new TypeError('Generation mirror states are unbalanced');
  if (options.count != null && items.length !== options.count) throw new TypeError(`Generation axes require ${options.count} items`);
  return { count: items.length, signatures: signatures.size, viewCounts: Object.fromEntries(viewCounts), mirrorCounts: Object.fromEntries(mirrorCounts) };
}

export function allocateConsultationDiversity(candidates, options = {}) {
  const count = Math.max(1, Math.min(CONSULTATION_SLOT_COUNT, Math.trunc(finiteNumber(options.count, CONSULTATION_SLOT_COUNT))));
  const eligible = candidates.filter((candidate) => candidate.suitability?.total >= SUITABILITY_FLOOR);
  const uniqueStructures = new Set(eligible.map((candidate) => candidate.structureKey));
  if (uniqueStructures.size < count) throw new TypeError(`Consultation diversity underflow: ${uniqueStructures.size}/${count} suitable structures`);
  const selected = [];
  const usedStructures = new Set();
  const usedDesigns = new Set();
  const baseCounts = new Map();
  const frontCounts = new Map();
  const relaxations = [];
  const familyTargets = ['natural-soft', 'salon-soft', 'expressive'];
  const familyLimits = { 'natural-soft': Math.round(count * 0.5), 'salon-soft': Math.round(count * 0.35), expressive: count - Math.round(count * 0.5) - Math.round(count * 0.35) };
  const desiredFamilies = familyTargets.flatMap((family) => Array(familyLimits[family]).fill(family));
  for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
    const desiredFamily = desiredFamilies[slotIndex];
    const available = eligible.filter((candidate) => !usedStructures.has(candidate.structureKey) && !usedDesigns.has(candidate.designId));
    const withinCaps = available.filter((candidate) => (baseCounts.get(candidate.baseFamily) ?? 0) < Math.ceil(count * 0.2) && (frontCounts.get(candidate.frontFamily) ?? 0) < Math.ceil(count * 0.25));
    const familyPool = withinCaps.filter((candidate) => candidate.finishFamily === desiredFamily);
    const pool = familyPool.length ? familyPool : withinCaps.length ? withinCaps : available;
    if (!familyPool.length) relaxations.push({ slotIndex, dimension: 'finish-family', requested: desiredFamily });
    if (!withinCaps.length) relaxations.push({ slotIndex, dimension: 'family-caps' });
    const chosen = pool.sort((a, b) => b.suitability.total - a.suitability.total || categoricalDistance(b, selected) - categoricalDistance(a, selected) || a.id.localeCompare(b.id))[0];
    if (!chosen) throw new TypeError(`Consultation diversity underflow at slot ${slotIndex}`);
    selected.push(chosen);
    usedStructures.add(chosen.structureKey);
    usedDesigns.add(chosen.designId);
    baseCounts.set(chosen.baseFamily, (baseCounts.get(chosen.baseFamily) ?? 0) + 1);
    frontCounts.set(chosen.frontFamily, (frontCounts.get(chosen.frontFamily) ?? 0) + 1);
  }
  const assigned = assignConsultationGenerationAxes(selected, options);
  validateConsultationGenerationAxes(assigned, { count });
  return { candidates: assigned, designIds: assigned.map((candidate) => candidate.designId), structureKeys: assigned.map((candidate) => candidate.structureKey), generationAxes: assigned.map((candidate) => candidate.generationAxes), diversityRelaxations: relaxations };
}

export function selectConsultationStructureDesignIds(groups, rawDiagnosis, limit = 100, options = {}) {
  const normalizedOptions = typeof limit === 'object' ? limit : options;
  const target = typeof limit === 'object' ? CONSULTATION_SLOT_COUNT : Math.max(1, Math.min(CONSULTATION_SLOT_COUNT, Math.trunc(Number(limit) || CONSULTATION_SLOT_COUNT)));
  const diagnosis = normalizeDiagnosis(rawDiagnosis);
  const candidates = buildConsultationCandidatePool(groups, diagnosis, normalizedOptions.preferences ?? { mood: normalizedOptions.mood });
  return allocateConsultationDiversity(candidates, { ...normalizedOptions, count: target, diagnosis });
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

function makeSlots(designIds, generationAxes = []) {
  const ids = [...new Set(designIds)].slice(0, CONSULTATION_SLOT_COUNT);
  if (ids.length !== CONSULTATION_SLOT_COUNT) throw new TypeError('Consultation batch requires exactly 100 unique design IDs');
  if (generationAxes.length && generationAxes.length !== ids.length) throw new TypeError('Generation axes must match consultation slots');
  return ids.map((designId, index) => {
    const axes = generationAxes[index] ? Object.freeze({ ...generationAxes[index] }) : null;
    return { slotIndex: index, designId, status: 'queued', generation: 0, attempts: 0, result: null, errorCode: null, generationAxes: axes, sourceViewKey: axes?.sourceViewKey };
  });
}

export function createConsultationBatch({ batchId, designIds, sourcePhotoKey, settings, metadata = {}, generationAxes = [] }) {
  if (!batchId || !sourcePhotoKey) throw new TypeError('batchId and sourcePhotoKey are required');
  if (generationAxes.length) validateConsultationGenerationAxes(generationAxes, { count: CONSULTATION_SLOT_COUNT });
  return { batchId, sourcePhotoKey, settings: normalizeSettings(settings), metadata: { ...metadata, generationAxesVersion: generationAxes.length ? CONSULTATION_GENERATION_AXES_VERSION : null, originalPhotoLineage: 'prepared-original-front-photo' }, slots: makeSlots(designIds, generationAxes), activeLimit: CONSULTATION_INITIAL_ACTIVE, successWindow: 0, pressureWindow: 0 };
}

export function assignConsultationSourceViews(batch, rawViewKeys, seedInput = '') {
  if (!batch?.slots || !Array.isArray(batch.slots)) throw new TypeError('Consultation batch slots are required');
  const provided = new Set(rawViewKeys ?? []);
  const viewKeys = SOURCE_VIEW_KEYS.filter((key) => provided.has(key));
  if (!viewKeys.includes('front')) throw new TypeError('Front source view is required');
  const slotOrder = [...batch.slots].sort((a, b) => {
    const seed = `${batch.sourcePhotoKey}:${seedInput}`;
    const left = stableHash32(`${seed}:${a.slotIndex}:${a.designId}`);
    const right = stableHash32(`${seed}:${b.slotIndex}:${b.designId}`);
    return left - right || a.slotIndex - b.slotIndex;
  });
  const viewBySlot = new Map(slotOrder.map((slot, index) => [slot.slotIndex, slot.generationAxes?.sourceViewKey ?? viewKeys[index % viewKeys.length]]));
  return {
    ...batch,
    metadata: { ...batch.metadata, originalPhotoLineage: 'prepared-original-source-views', sourceViewKeys: viewKeys },
    slots: batch.slots.map((slot) => {
      const sourceViewKey = viewBySlot.get(slot.slotIndex);
      if (!viewKeys.includes(sourceViewKey)) throw new TypeError(`Generation axes reference missing source view: ${sourceViewKey}`);
      return { ...slot, sourceViewKey };
    })
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
    || slot.generation !== result.generation
    || (result.sourceViewKey && slot.sourceViewKey && result.sourceViewKey !== slot.sourceViewKey)
    || (result.mirrored != null && slot.generationAxes && Boolean(result.mirrored) !== slot.generationAxes.mirrored)
    || (result.colorToneId && slot.generationAxes && result.colorToneId !== slot.generationAxes.colorToneId);
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

function canonicalDecision(payload, currentDesignIds) {
  const decision = { ...(payload.decision ?? payload.decisionMetadata ?? {}) };
  if (decision.selectedStructureKey) {
    try {
      decision.selectedStructureKey = canonicalStructureKey({ id: currentDesignIds[0] });
    } catch {
      // Special-family Design Lock selections do not have a core structure key.
    }
  }
  return decision;
}

export function buildConsultationHandoff(payload = {}) {
  rejectGenerated(payload);
  const originalFrontDataUrl = String(payload.originalFrontDataUrl ?? '');
  if (!originalFrontDataUrl.startsWith('data:image/')) throw new TypeError('originalFrontDataUrl is required');
  const currentDesignIds = [...new Set(payload.currentDesignIds ?? payload.currentHlmIds ?? [])];
  if (currentDesignIds.length < 1 || currentDesignIds.length > 6 || currentDesignIds.some((id) => !/^HLM-/.test(String(id)))) throw new TypeError('1-6 current HLM design IDs are required');
  return {
    schemaVersion: CONSULTATION_HANDOFF_SCHEMA_VERSION,
    generationAxesVersion: CONSULTATION_GENERATION_AXES_VERSION,
    sourceTransformVersion: CONSULTATION_SOURCE_TRANSFORM_VERSION,
    originalFrontDataUrl,
    currentDesignIds,
    sourceViews: normalizeSourceViews(payload.sourceViews, originalFrontDataUrl),
    settings: normalizeSettings(payload.settings ?? payload.exploreSettings ?? {}),
    diagnosis: normalizeDiagnosis(payload.diagnosis ?? {}),
    hairColorProfile: normalizeHairColorProfile(payload.hairColorProfile),
    decision: canonicalDecision(payload, currentDesignIds),
    catalogVersion: String(payload.catalogVersion ?? catalogVersion),
    promptVersion: String(payload.promptVersion ?? promptVersion)
  };
}

function migrateConsultationHandoffV1(payload) {
  if (payload.catalogVersion !== CONSULTATION_LEGACY_CATALOG_VERSION || payload.promptVersion !== CONSULTATION_LEGACY_PROMPT_VERSION) throw new TypeError('Consultation handoff version mismatch');
  return buildConsultationHandoff({ ...payload, hairColorProfile: { currentToneId: 'unknown', selectedToneIds: [PRESERVE_CURRENT_TONE_ID] }, catalogVersion, promptVersion });
}

export function validateConsultationHandoff(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Consultation handoff payload is required');
  const schema = payload.schemaVersion == null ? 1 : Number(payload.schemaVersion);
  const v1Allowed = new Set(['originalFrontDataUrl', 'currentDesignIds', 'sourceViews', 'settings', 'diagnosis', 'decision', 'catalogVersion', 'promptVersion']);
  const v2Allowed = new Set(['schemaVersion', 'generationAxesVersion', 'sourceTransformVersion', 'originalFrontDataUrl', 'currentDesignIds', 'sourceViews', 'settings', 'diagnosis', 'hairColorProfile', 'decision', 'catalogVersion', 'promptVersion']);
  const allowed = schema === 1 ? v1Allowed : schema === CONSULTATION_HANDOFF_SCHEMA_VERSION ? v2Allowed : null;
  if (!allowed) throw new TypeError('Consultation handoff schema version mismatch');
  for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new TypeError(`Unexpected consultation handoff field: ${key}`);
  if (!payload.catalogVersion || !payload.promptVersion) throw new TypeError('Consultation handoff versions are required');
  if (schema === 1) return migrateConsultationHandoffV1(payload);
  if (payload.generationAxesVersion !== CONSULTATION_GENERATION_AXES_VERSION || payload.sourceTransformVersion !== CONSULTATION_SOURCE_TRANSFORM_VERSION) throw new TypeError('Consultation handoff generation version mismatch');
  const validated = buildConsultationHandoff(payload);
  if (validated.catalogVersion !== catalogVersion || validated.promptVersion !== promptVersion) throw new TypeError('Consultation handoff version mismatch');
  return validated;
}
export const validateConsultationHandoffPayload = validateConsultationHandoff;
