import { HAIR_COLOR_TONES, PRESERVE_CURRENT_TONE_ID, normalizeHairColorToneId } from './hairColorPalette.mjs';

export const HAIR_ANALYSIS_SCHEMA_VERSION = 1;
export const DEFAULT_HAIR_ANALYSIS_MODEL = 'gpt-4.1-mini';

const LENGTH_CM = Object.freeze([8, 18, 36, 56, 78]);
const TEXTURES = new Map([
  ['straight', '내추럴 스트레이트'], ['wavy', '내추럴 웨이브'], ['wave', '내추럴 웨이브'],
  ['curly', '내추럴 컬'], ['curl', '내추럴 컬'], ['coily', '내추럴 코일'], ['coil', '내추럴 코일'],
  ['직모', '내추럴 스트레이트'], ['반곱슬', '내추럴 웨이브'], ['웨이브', '내추럴 웨이브'],
  ['곱슬', '내추럴 컬'], ['컬', '내추럴 컬'], ['코일', '내추럴 코일']
]);
const TEXTURE_LABELS = Object.freeze({
  '내추럴 스트레이트': '직모',
  '내추럴 웨이브': '웨이브',
  '내추럴 컬': '컬',
  '내추럴 코일': '코일'
});
const LENGTH_LABELS = Object.freeze(['귀 위', '턱선', '쇄골', '가슴', '허리']);
const DENSITIES = new Set(['low', 'normal', 'high']);
const DAMAGES = new Set(['low', 'medium', 'high']);
const COLOR_INTENSITIES = new Set(['subtle', 'balanced', 'vivid']);
const TONE_BY_ID = new Map(HAIR_COLOR_TONES.map((tone) => [tone.id, tone]));
const TONE_TERMS = Object.freeze([
  ['muted-ash-brown', ['뮤트 애쉬 브라운', '뮤트애쉬브라운', '토프 브라운', '토프브라운']],
  ['chocolate-brown', ['초콜릿 브라운', '초코 브라운', '초코브라운', '초콜릿']],
  ['burgundy-brown', ['버건디 브라운', '버건디', '와인 브라운', '와인색', '레드 브라운', '체리 브라운']],
  ['copper-brown', ['코퍼 브라운', '코퍼브라운', '오렌지 브라운', '오렌지브라운', '구리색']],
  ['caramel-brown', ['카라멜 브라운', '카라멜브라운', '골드 브라운', '골든 브라운']],
  ['rose-brown', ['로즈 브라운', '로즈브라운', '핑크 브라운', '핑크브라운', '로즈 핑크', '핑크']],
  ['lavender-ash', ['라벤더 애쉬', '라벤더애쉬', '퍼플 애쉬', '보라색', '퍼플']],
  ['blue-black', ['블루 블랙', '블루블랙', '네이비 블랙', '남색 블랙']],
  ['ash-blonde', ['애쉬 블론드', '애쉬블론드', '플래티넘 블론드', '백금발']],
  ['beige-blonde', ['베이지 블론드', '베이지블론드', '밀크티 베이지', '밀크티', '샌드 베이지']],
  ['honey-blonde', ['허니 블론드', '허니블론드', '골드 블론드', '금발']],
  ['ash-gray', ['애쉬 그레이', '애쉬그레이', '실버 그레이', '실버', '은발', '회색']],
  ['ash-brown', ['애쉬 브라운', '애쉬브라운', '쿨 브라운', '회갈색']],
  ['mocha-brown', ['모카 브라운', '모카브라운', '올리브 브라운', '카키 브라운']],
  ['cacao-brown', ['카카오 브라운', '카카오브라운']],
  ['warm-brown', ['웜 브라운', '웜브라운', '내추럴 브라운']],
  ['dark-brown', ['다크 브라운', '다크브라운', '짙은 갈색', '흑갈색']],
  ['soft-black', ['소프트 블랙', '부드러운 블랙']],
  ['natural-black', ['자연 흑색', '자연흑색', '내추럴 블랙', '검정', '검은색', '블랙', '흑발']]
]);

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function integer(value, min, max, fallback) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

function normalizedText(value, maxLength = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function promptToneIds(prompt) {
  const text = normalizedText(prompt).toLowerCase();
  if (!text) return [];
  if (/(현재|원래|지금).{0,8}(색|컬러|톤).{0,8}(유지|그대로)|염색.{0,4}(안|없이)/.test(text)) return [PRESERVE_CURRENT_TONE_ID];
  const ids = [];
  let remaining = text;
  for (const [id, terms] of TONE_TERMS) {
    const matched = [...terms].sort((a, b) => b.length - a.length).find((term) => remaining.includes(term.toLowerCase()));
    if (!matched) continue;
    ids.push(id);
    remaining = remaining.replaceAll(matched.toLowerCase(), ' ');
  }
  for (const tone of HAIR_COLOR_TONES) {
    if (text.includes(tone.id) && !ids.includes(tone.id)) ids.push(tone.id);
  }
  if (/(브라운|갈색)/.test(remaining)) ids.push('dark-brown');
  if (/(블론드|금발)/.test(remaining)) ids.push('beige-blonde');
  if (/(그레이|회색|실버|은발)/.test(remaining)) ids.push('ash-gray');
  if (/(레드|빨강|붉은)/.test(remaining)) ids.push('burgundy-brown');
  if (/(오렌지|주황)/.test(remaining)) ids.push('copper-brown');
  return [...new Set(ids)];
}

function promptCatalogLine(prompt) {
  const text = normalizedText(prompt).toLowerCase();
  if (/(젠더.?뉴트럴|중성적|유니섹스|성별.?무관)/.test(text)) return 'U';
  if (/(남성적|바버|페이드|포마드|크롭컷|리젠트)/.test(text)) return 'M';
  if (/(여성적|페이스.?프레임|레이어드|여신|러블리)/.test(text)) return 'F';
  return null;
}

function promptColorIntensity(prompt) {
  const text = normalizedText(prompt).toLowerCase();
  const percentage = /(\d{1,3})\s*%/.exec(text);
  if (percentage) {
    const value = Math.min(100, Number(percentage[1]));
    if (value <= 60) return 'subtle';
    if (value >= 85) return 'vivid';
    return 'balanced';
  }
  if (/(은은|살짝|미묘|자연스럽게|거의 그대로|약하게)/.test(text)) return 'subtle';
  if (/(선명|확실|강하게|선택색에 가깝|최대한 비슷|쨍하게|진하게)/.test(text)) return 'vivid';
  if (/(적당|균형|비슷하게|중간 정도)/.test(text)) return 'balanced';
  return null;
}

function promptTreatmentHistory(prompt) {
  const text = normalizedText(prompt).toLowerCase();
  const bleach = /탈색\s*(\d+)\s*(번|회)/.exec(text);
  const perm = /(펌|파마).{0,8}(\d+)\s*(개월|달)/.exec(text);
  const extensionAllowed = /(붙임머리|피스|익스텐션).{0,8}(가능|허용|사용|해도)/.test(text);
  return {
    bleachCount: bleach ? integer(bleach[1], 0, 9, 0) : null,
    monthsSincePerm: perm ? integer(perm[2], 0, 999, 999) : null,
    extensionAllowed: extensionAllowed || null
  };
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => normalizedText(value, 160)).filter(Boolean))];
}

function safeJsonParse(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

function summaryFor(analysis) {
  const tone = TONE_BY_ID.get(analysis.currentToneId)?.labelKo ?? '현재 색상 추정 중';
  const target = analysis.targetToneIds[0] === PRESERVE_CURRENT_TONE_ID
    ? '현재 색상 유지'
    : TONE_BY_ID.get(analysis.targetToneIds[0])?.labelKo ?? '프롬프트 반영';
  return `${LENGTH_LABELS[analysis.currentLength]} · ${TEXTURE_LABELS[analysis.naturalTexture]} · ${tone} / 요청 ${target}`;
}

export function normalizeHairAnalysis(raw = {}, options = {}) {
  const freePrompt = normalizedText(options.freePrompt ?? raw.promptIntent ?? '');
  const treatment = promptTreatmentHistory(freePrompt);
  const requestedLength = raw.currentLength ?? raw.lengthIndex;
  const currentLength = integer(requestedLength, 0, 4, 2);
  const rawTexture = String(raw.naturalTexture ?? raw.texture ?? '').trim();
  const naturalTexture = TEXTURES.get(rawTexture) ?? TEXTURES.get(rawTexture.toLowerCase())
    ?? (TEXTURE_LABELS[rawTexture] ? rawTexture : '내추럴 스트레이트');
  const density = DENSITIES.has(String(raw.density ?? '').toLowerCase()) ? String(raw.density).toLowerCase() : 'normal';
  const damage = DAMAGES.has(String(raw.damage ?? raw.damageCondition ?? '').toLowerCase())
    ? String(raw.damage ?? raw.damageCondition).toLowerCase()
    : 'medium';
  const catalogLine = promptCatalogLine(freePrompt) ?? (['F', 'M', 'U'].includes(String(raw.catalogLine).toUpperCase()) ? String(raw.catalogLine).toUpperCase() : 'U');
  const promptTargets = promptToneIds(freePrompt);
  const currentToneId = TONE_BY_ID.has(String(raw.currentToneId ?? raw.currentTone ?? '')) ? String(raw.currentToneId ?? raw.currentTone) : 'unknown';
  const rawTargets = Array.isArray(raw.targetToneIds) ? raw.targetToneIds : [raw.targetToneId ?? raw.targetTone].filter(Boolean);
  const validTargets = rawTargets.map((value) => normalizeHairColorToneId(value, { preserve: true })).filter(Boolean);
  const requestedTargets = [...promptTargets, ...validTargets].filter(Boolean);
  const targetToneIds = Object.freeze([...new Set(requestedTargets.length ? requestedTargets : [PRESERVE_CURRENT_TONE_ID])]);
  const colorIntensity = promptColorIntensity(freePrompt)
    ?? (COLOR_INTENSITIES.has(String(raw.colorIntensity ?? raw.intensity)) ? String(raw.colorIntensity ?? raw.intensity) : 'balanced');
  const uncertainties = uniqueStrings([
    ...(Array.isArray(raw.uncertainties) ? raw.uncertainties : []),
    treatment.bleachCount == null ? '탈색 횟수는 사진만으로 확인할 수 없어 0회로 보수 처리' : '',
    treatment.monthsSincePerm == null ? '최근 펌 시점은 사진만으로 확인할 수 없어 미상으로 처리' : '',
    treatment.extensionAllowed == null ? '붙임·피스 허용 여부는 요청에 없어 사용하지 않음' : '',
    currentToneId === 'unknown' ? '현재 색상은 로컬 보조 분석 또는 Provider 분석이 필요' : ''
  ]);
  const analysis = {
    schemaVersion: HAIR_ANALYSIS_SCHEMA_VERSION,
    source: options.source === 'provider' || raw.source === 'provider' ? 'provider' : 'fallback',
    catalogLine,
    currentLength,
    actualLengthCm: clampNumber(raw.actualLengthCm, 0, 160, LENGTH_CM[currentLength]),
    naturalTexture,
    density,
    damage,
    bleachCount: treatment.bleachCount ?? 0,
    monthsSincePerm: treatment.monthsSincePerm ?? 999,
    extensionAllowed: treatment.extensionAllowed ?? false,
    currentToneId,
    targetToneIds,
    colorIntensity,
    similarity: integer(raw.similarity, 0, 4, 2),
    promptIntent: freePrompt,
    confidence: Number(clampNumber(raw.confidence, 0, 1, options.source === 'provider' ? 0.5 : 0.2).toFixed(2)),
    uncertainties: Object.freeze(uncertainties),
    summaryKo: ''
  };
  analysis.summaryKo = normalizedText(raw.summaryKo, 180) || summaryFor(analysis);
  return Object.freeze(analysis);
}

export function defaultHairAnalysis(overrides = {}) {
  return normalizeHairAnalysis(overrides, { freePrompt: overrides.promptIntent ?? '', source: 'fallback' });
}

export function buildHairAnalysisPrompt(freePrompt = '') {
  const request = normalizedText(freePrompt, 500) || '현재 헤어를 유지하면서 어울리는 스타일을 폭넓게 추천';
  return [
    'Analyze only the visible hair in the single original customer photo.',
    'Never infer or describe identity, age, ethnicity, face shape, body, health, or gender identity.',
    'catalogLine means haircut geometry only: F for softer connected curves, M for directional barber-like planes, U when neutral or uncertain.',
    'Do not claim chemical history, bleach count, perm timing, extensions, or hidden scalp condition from pixels. Use null and add an uncertainty when not stated in the user request.',
    'Return JSON only with: catalogLine, currentLength (0..4), actualLengthCm, naturalTexture (straight|wavy|curly|coily), density (low|normal|high), damage (low|medium|high visible appearance only), currentToneId, targetToneIds, colorIntensity (subtle|balanced|vivid), similarity (0..4), confidence (0..1), uncertainties, summaryKo.',
    `USER REQUEST: ${request}`
  ].join('\n');
}

export function extractHairAnalysisJson(payload) {
  if (!payload) return null;
  if (payload.output_text) return safeJsonParse(payload.output_text);
  const responseText = payload.output?.flatMap((item) => item?.content ?? []).find((item) => typeof item?.text === 'string')?.text;
  if (responseText) return safeJsonParse(responseText);
  const chatContent = payload.choices?.[0]?.message?.content;
  if (Array.isArray(chatContent)) {
    const text = chatContent.find((item) => typeof item?.text === 'string')?.text;
    if (text) return safeJsonParse(text);
  }
  if (payload.catalogLine != null || payload.currentLength != null || payload.currentToneId != null) return payload;
  return safeJsonParse(chatContent);
}

function analysisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      catalogLine: { type: ['string', 'null'] },
      currentLength: { type: ['integer', 'null'] },
      actualLengthCm: { type: ['number', 'null'] },
      naturalTexture: { type: ['string', 'null'] },
      density: { type: ['string', 'null'] },
      damage: { type: ['string', 'null'] },
      currentToneId: { type: ['string', 'null'] },
      targetToneIds: { type: 'array', items: { type: 'string' } },
      colorIntensity: { type: ['string', 'null'] },
      similarity: { type: ['integer', 'null'] },
      confidence: { type: ['number', 'null'] },
      uncertainties: { type: 'array', items: { type: 'string' } },
      summaryKo: { type: ['string', 'null'] }
    },
    required: ['catalogLine', 'currentLength', 'actualLengthCm', 'naturalTexture', 'density', 'damage', 'currentToneId', 'targetToneIds', 'colorIntensity', 'similarity', 'confidence', 'uncertainties', 'summaryKo']
  };
}

async function providerRequest(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  if (!response?.ok) throw new Error(`Hair analysis provider returned ${response?.status ?? 0}`);
  return response.json();
}

export async function requestHairAnalysis({ baseURL, apiKey, model = DEFAULT_HAIR_ANALYSIS_MODEL, imageDataUrl, freePrompt = '', fetchImpl = fetch, signal } = {}) {
  const endpoint = String(baseURL ?? '').replace(/\/+$/, '');
  if (!endpoint || !apiKey) throw new TypeError('Hair analysis provider configuration is required');
  if (!String(imageDataUrl ?? '').startsWith('data:image/')) throw new TypeError('Hair analysis requires one original image data URL');
  const prompt = buildHairAnalysisPrompt(freePrompt);
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const attempts = [
    {
      url: `${endpoint}/responses`,
      body: {
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: imageDataUrl }] }],
        text: { format: { type: 'json_schema', name: 'hair_analysis', strict: true, schema: analysisSchema() } }
      }
    },
    {
      url: `${endpoint}/chat/completions`,
      body: {
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
        response_format: { type: 'json_object' },
        temperature: 0
      }
    }
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      const payload = await providerRequest(fetchImpl, attempt.url, { method: 'POST', headers, body: JSON.stringify(attempt.body), signal });
      const parsed = extractHairAnalysisJson(payload);
      if (!parsed) throw new Error('Hair analysis provider returned invalid JSON');
      return normalizeHairAnalysis(parsed, { freePrompt, source: 'provider' });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      errors.push(error);
    }
  }
  throw new AggregateError(errors, 'Hair analysis provider unavailable');
}

export function hairAnalysisToExploreSettings(value) {
  const analysis = normalizeHairAnalysis(value, { freePrompt: value?.promptIntent, source: value?.source });
  return Object.freeze({
    currentLength: analysis.currentLength,
    hairThickness: analysis.density === 'low' ? 'fine' : analysis.density === 'high' ? 'thick' : 'normal',
    damageCondition: analysis.damage,
    permAllowed: analysis.monthsSincePerm >= 3 && analysis.damage !== 'high',
    extensionAllowed: analysis.extensionAllowed && analysis.damage !== 'high',
    similarity: analysis.similarity
  });
}

export function hairAnalysisToDiagnosis(value) {
  const analysis = normalizeHairAnalysis(value, { freePrompt: value?.promptIntent, source: value?.source });
  return Object.freeze({
    profileGender: analysis.catalogLine,
    actualLengthCm: analysis.actualLengthCm,
    naturalTexture: analysis.naturalTexture,
    density: analysis.density,
    damage: analysis.damage,
    bleachCount: analysis.bleachCount,
    monthsSincePerm: analysis.monthsSincePerm,
    extensionAllowed: analysis.extensionAllowed && analysis.damage !== 'high'
  });
}

export function hairAnalysisToColorProfile(value) {
  const analysis = normalizeHairAnalysis(value, { freePrompt: value?.promptIntent, source: value?.source });
  return Object.freeze({
    currentToneId: analysis.currentToneId,
    selectedToneIds: analysis.targetToneIds,
    intensity: analysis.colorIntensity
  });
}
