import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HAIR_ANALYSIS_SCHEMA_VERSION,
  buildHairAnalysisPrompt,
  defaultHairAnalysis,
  extractHairAnalysisJson,
  hairAnalysisToColorProfile,
  hairAnalysisToDiagnosis,
  hairAnalysisToExploreSettings,
  normalizeHairAnalysis,
  requestHairAnalysis
} from './src/hairAnalysis.mjs';
import { evaluateVariation, normalizeDiagnosis } from './src/consultationCore.mjs';

test('fallback analysis is conservative and records unobservable uncertainty', () => {
  const analysis = defaultHairAnalysis();
  assert.equal(analysis.schemaVersion, HAIR_ANALYSIS_SCHEMA_VERSION);
  assert.equal(analysis.source, 'fallback');
  assert.equal(analysis.catalogLine, 'U');
  assert.equal(analysis.damage, 'medium');
  assert.equal(analysis.bleachCount, 0);
  assert.equal(analysis.monthsSincePerm, 999);
  assert.equal(analysis.extensionAllowed, false);
  assert.equal(analysis.currentToneId, 'unknown');
  assert.equal(analysis.uncertainties.length >= 4, true);
  assert.equal(Object.isFrozen(analysis), true);
});

test('free prompt overrides target color, resemblance and haircut geometry without face fields', () => {
  const analysis = normalizeHairAnalysis({ currentToneId: 'natural-black', catalogLine: 'F', confidence: 0.8 }, { freePrompt: '중성적인 애쉬 브라운으로 선택색에 가깝게, 탈색 2번 했어요', source: 'provider' });
  assert.equal(analysis.catalogLine, 'U');
  assert.deepEqual(analysis.targetToneIds, ['ash-brown']);
  assert.equal(analysis.colorIntensity, 'vivid');
  assert.equal(analysis.bleachCount, 2);
  assert.equal('faceShape' in analysis, false);
  assert.equal('genderIdentity' in analysis, false);
});

test('analysis prompt forbids identity and hidden-history inference', () => {
  const prompt = buildHairAnalysisPrompt('부드러운 웨이브');
  assert.match(prompt, /Never infer or describe identity/);
  assert.match(prompt, /gender identity/);
  assert.match(prompt, /Do not claim chemical history/);
  assert.match(prompt, /USER REQUEST: 부드러운 웨이브/);
});

test('provider response JSON is extracted from Responses and chat shapes', () => {
  assert.deepEqual(extractHairAnalysisJson({ output_text: '```json\n{"catalogLine":"U"}\n```' }), { catalogLine: 'U' });
  assert.deepEqual(extractHairAnalysisJson({ choices: [{ message: { content: '{"currentLength":3}' } }] }), { currentLength: 3 });
  assert.equal(extractHairAnalysisJson({ choices: [] }), null);
});

test('provider analysis tries Responses then chat and sends only the supplied original data URL', async () => {
  const calls = [];
  const imageDataUrl = 'data:image/jpeg;base64,ORIGINAL';
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (url.endsWith('/responses')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ currentToneId: 'dark-brown', targetToneIds: ['rose-brown'], confidence: 0.9 }) } }] }) };
  };
  const analysis = await requestHairAnalysis({ baseURL: 'https://provider.example/v1/', apiKey: 'secret', imageDataUrl, freePrompt: '로즈 브라운', fetchImpl });
  assert.deepEqual(calls.map((call) => call.url), ['https://provider.example/v1/responses', 'https://provider.example/v1/chat/completions']);
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
  assert.equal(JSON.stringify(calls).includes(imageDataUrl), true);
  assert.equal(JSON.stringify(calls).includes('blob:'), false);
  assert.equal(analysis.source, 'provider');
  assert.equal(analysis.currentToneId, 'dark-brown');
  assert.deepEqual(analysis.targetToneIds, ['rose-brown']);
});

test('analysis rejects non-original image URLs', async () => {
  await assert.rejects(() => requestHairAnalysis({ baseURL: 'https://provider.example/v1', apiKey: 'secret', imageDataUrl: 'blob:generated' }), /original image data URL/);
});

test('analysis converters produce existing internal setting shapes', () => {
  const analysis = normalizeHairAnalysis({ catalogLine: 'M', currentLength: 3, actualLengthCm: 58, naturalTexture: 'wavy', density: 'high', damage: 'low', currentToneId: 'dark-brown', targetToneIds: ['rose-brown'], colorIntensity: 'subtle', similarity: 4 }, { freePrompt: '은은한 로즈 브라운', source: 'provider' });
  assert.deepEqual(hairAnalysisToExploreSettings(analysis), { currentLength: 3, hairThickness: 'thick', damageCondition: 'low', permAllowed: true, extensionAllowed: false, similarity: 4 });
  assert.deepEqual(hairAnalysisToDiagnosis(analysis), { profileGender: 'M', actualLengthCm: 58, naturalTexture: '내추럴 웨이브', density: 'high', damage: 'low', bleachCount: 0, monthsSincePerm: 999, extensionAllowed: false });
  assert.deepEqual(hairAnalysisToColorProfile(analysis), { currentToneId: 'dark-brown', selectedToneIds: ['rose-brown'], intensity: 'subtle' });
});

test('neutral catalog line accepts both F and M haircut records without identity inference', () => {
  const diagnosis = normalizeDiagnosis({ profileGender: 'U', actualLengthCm: 80, naturalTexture: 'straight', density: 'normal', damage: 'low' });
  assert.equal(diagnosis.profileGender, 'U');
  const base = { lengthId: 'S', finishKo: '내추럴 스트레이트', baseKo: '클래식', intensity: '균형 있게' };
  assert.doesNotMatch(evaluateVariation({ ...base, genderId: 'F' }, diagnosis).reasons.join(' '), /프로필 성별/);
  assert.doesNotMatch(evaluateVariation({ ...base, genderId: 'M' }, diagnosis).reasons.join(' '), /프로필 성별/);
});
