import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HAIR_ANALYSIS_SCHEMA_VERSION,
  buildHairAnalysisPrompt,
  defaultHairAnalysis,
  hairAnalysisToColorProfile,
  hairAnalysisToDiagnosis,
  hairAnalysisToExploreSettings,
  normalizeHairAnalysis
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

test('prompt color aliases, multiple targets and percentages map deterministically', () => {
  const vivid = defaultHairAnalysis({ promptIntent: '핑크 브라운과 실버 그레이를 90% 정도로 선명하게' });
  assert.deepEqual(vivid.targetToneIds, ['rose-brown', 'ash-gray']);
  assert.equal(vivid.colorIntensity, 'vivid');

  const subtle = defaultHairAnalysis({ promptIntent: '밀크티 베이지를 55% 정도로 자연스럽게' });
  assert.deepEqual(subtle.targetToneIds, ['beige-blonde']);
  assert.equal(subtle.colorIntensity, 'subtle');

  const generic = defaultHairAnalysis({ promptIntent: '그냥 브라운으로 중간 정도' });
  assert.deepEqual(generic.targetToneIds, ['dark-brown']);
  assert.equal(generic.colorIntensity, 'balanced');
});

test('analysis prompt forbids identity and hidden-history inference', () => {
  const prompt = buildHairAnalysisPrompt('부드러운 웨이브');
  assert.match(prompt, /Never infer or describe identity/);
  assert.match(prompt, /gender identity/);
  assert.match(prompt, /Do not claim chemical history/);
  assert.match(prompt, /USER REQUEST: 부드러운 웨이브/);
});

test('provider analysis normalization bounds untrusted values and text', () => {
  const analysis = normalizeHairAnalysis({
    actualLengthCm: 9999,
    similarity: 99,
    confidence: 8,
    uncertainties: ['x'.repeat(500)],
    summaryKo: 'y'.repeat(500)
  }, { source: 'provider' });
  assert.equal(analysis.actualLengthCm, 160);
  assert.equal(analysis.similarity, 4);
  assert.equal(analysis.confidence, 1);
  assert.equal(analysis.uncertainties[0].length, 160);
  assert.equal(analysis.summaryKo.length, 180);
});

test('shared analysis code contains no browser Provider transport', async () => {
  const source = await readFile(new URL('./src/hairAnalysis.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|Authorization|Bearer|apiKey|baseURL|\/responses|\/chat\/completions/);
});

test('analysis normalization drops forbidden person-inference fields', () => {
  const analysis = normalizeHairAnalysis({
    catalogLine: 'F',
    identity: 'someone',
    age: 42,
    ethnicity: 'unknown',
    faceShape: 'oval',
    body: 'unknown',
    health: 'unknown',
    genderIdentity: 'woman'
  }, { source: 'provider' });
  for (const key of ['identity', 'age', 'ethnicity', 'faceShape', 'body', 'health', 'genderIdentity']) {
    assert.equal(Object.hasOwn(analysis, key), false);
  }
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
