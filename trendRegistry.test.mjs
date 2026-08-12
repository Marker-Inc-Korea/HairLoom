import assert from 'node:assert/strict';
import test from 'node:test';
import catalogPayload from './docs/hair-design-master/catalog.json' with { type: 'json' };
import trendSource from './data/hair-trend-signals.json' with { type: 'json' };
import { trendRegistrySnapshot } from './src/hairTrendData.mjs';
import {
  TREND_REGISTRY_VERSION,
  TREND_REGISTRY_UPDATED_AT,
  TREND_STRUCTURE_BASES,
  validateTrendRegistrySnapshot,
  trendRecordForCandidate,
  trendPointsForCandidate,
  trendSelectionBonusForCandidate,
  trendBadgeForCandidate
} from './src/trendRegistry.mjs';
import {
  compileTrendRegistry,
  summarizeInstagramMedia,
  summarizeNaverTrend,
  validateTrendSource
} from './scripts/syncHairTrends.mjs';

test('trend registry preserves all curated bases with metadata-only rights', () => {
  const registry = validateTrendRegistrySnapshot();
  assert.equal(TREND_REGISTRY_VERSION, 'HLM-TRENDS-2026-07-1');
  assert.equal(TREND_REGISTRY_UPDATED_AT, '2026-07-29');
  assert.equal(registry.recordCount, 40);
  assert.equal(TREND_STRUCTURE_BASES.length, 40);
  assert.equal(new Set(TREND_STRUCTURE_BASES).size, 40);
  assert.equal(registry.records.every((record) => record.rights === 'metadata-only'), true);
  assert.equal(registry.records.some((record) => record.genderId === 'F'), true);
  assert.equal(registry.records.some((record) => record.genderId === 'M'), true);
});

test('trend lookup maps stable female and male catalog prefixes', () => {
  const female = trendRecordForCandidate({ id: 'HLM-C-F-L-03-NH-NS' });
  const male = trendRecordForCandidate({ id: 'HLM-C-M-S-03-NH-NS' });
  assert.equal(female.baseKo, '버터플라이 레이어');
  assert.equal(female.genderId, 'F');
  assert.equal(male.baseKo, '텍스처드 크롭');
  assert.equal(male.genderId, 'M');
  assert.equal(trendRecordForCandidate({ baseKo: '버터플라이 레이어', genderId: 'F' }).id, female.id);
});

test('trend remains a bounded ranking signal with a non-trend fallback', () => {
  const trendCandidate = { id: 'HLM-C-F-L-03-NH-NS' };
  const nonTrendCandidate = { id: 'HLM-C-F-US-01-NH-NS', baseKo: '클래식 픽시', genderId: 'F' };
  assert.equal(trendPointsForCandidate(trendCandidate), 5);
  assert.equal(trendSelectionBonusForCandidate(trendCandidate), 3);
  assert.equal(trendPointsForCandidate(nonTrendCandidate), 2);
  assert.equal(trendSelectionBonusForCandidate(nonTrendCandidate), 0);
  assert.match(trendBadgeForCandidate(trendCandidate), /^RISING KR · 1 SRC$/);
  assert.equal(trendBadgeForCandidate(nonTrendCandidate), '');
});

test('trend validators reject external image fields and non-metadata rights', () => {
  const unsafeRegistry = structuredClone(trendRegistrySnapshot);
  unsafeRegistry.records[0].imageUrl = 'https://example.com/reference.jpg';
  assert.throws(() => validateTrendRegistrySnapshot(unsafeRegistry), /forbidden asset field/);
  const unsafeSource = structuredClone(trendSource);
  unsafeSource.sourceBatches[0].rights = 'public-image';
  assert.throws(() => validateTrendSource(unsafeSource), /metadata-only rights/);
  const embeddedSource = structuredClone(trendSource);
  embeddedSource.sourceBatches[0].entries[0].dataUrl = 'data:image/png;base64,AAAA';
  assert.throws(() => validateTrendSource(embeddedSource), /forbidden asset field|image data/);
  const secretSource = structuredClone(trendSource);
  secretSource.sourceBatches[0].accessToken = 'must-not-persist';
  assert.throws(() => validateTrendSource(secretSource), /unexpected field: accessToken/);
  const oversizedWatch = structuredClone(trendSource);
  oversizedWatch.watch.instagramHashtags = Array.from({ length: 31 }, (_, index) => ({ query: `trend${index}`, baseKo: '미니 보브', genderId: 'F', region: 'KR' }));
  assert.throws(() => validateTrendSource(oversizedWatch), /30-hashtag limit/);
  const invalidRange = structuredClone(trendSource);
  invalidRange.sourceBatches[0].confidence = 1.1;
  assert.throws(() => validateTrendSource(invalidRange), /between 0 and 1/);
  const secretRegistry = structuredClone(trendRegistrySnapshot);
  secretRegistry.records[0].clientSecret = 'must-not-serve';
  assert.throws(() => validateTrendRegistrySnapshot(secretRegistry), /unexpected field: clientSecret/);
});

test('trend compilation is deterministic against the stable catalog', () => {
  const first = compileTrendRegistry(structuredClone(trendSource), catalogPayload);
  const second = compileTrendRegistry(structuredClone(trendSource), catalogPayload);
  assert.deepEqual(first, second);
  assert.deepEqual(first, trendRegistrySnapshot);
  assert.equal(first.records.every((record) => record.designIdPrefixes.every((prefix) => /^HLM-C-[FM]-/.test(prefix))), true);
});

test('provider summaries retain counts and permalinks without image payloads', () => {
  const instagram = summarizeInstagramMedia([
    { permalink: 'https://www.instagram.com/p/current/', timestamp: '2026-07-28T12:00:00Z', media_url: 'ignored-by-summary' },
    { permalink: 'https://www.instagram.com/p/previous/', timestamp: '2026-07-10T12:00:00Z' }
  ], '2026-07-29');
  assert.equal(instagram.sampleCount, 2);
  assert.equal(instagram.references.length, 2);
  assert.equal(JSON.stringify(instagram).includes('media_url'), false);
  const naver = summarizeNaverTrend([10, 12, 11, 13, 20, 22, 24, 26].map((ratio, index) => ({ period: `2026-W${index + 1}`, ratio })));
  assert.equal(naver.sampleCount, 8);
  assert.ok(naver.momentum > 0.5);
  assert.ok(naver.confidence > 0 && naver.confidence <= 1);
});
