import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'data/hair-trend-signals.json');
const generatedPath = resolve(root, 'src/hairTrendData.mjs');
const catalogPath = resolve(root, 'docs/hair-design-master/catalog.json');
const allowedSourceTypes = new Set(['stylist-curated', 'instagram-hashtag', 'instagram-business', 'naver-datalab', 'google-trends', 'pinterest-trends', 'editorial']);
const bannedAssetKey = /^(?:image|images|imageurl|imagedataurl|mediaurl|media_url|thumbnail|thumbnailurl|base64|b64_json|dataurl|downloadurl)$/i;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const unitInterval = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} must be between 0 and 1`);
  return number;
};
const isoDate = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid trend date: ${value}`);
  return date.toISOString().slice(0, 10);
};
const dayDistance = (later, earlier) => Math.max(0, Math.round((new Date(`${later}T00:00:00Z`) - new Date(`${earlier}T00:00:00Z`)) / 86_400_000));

function assertNoExternalAsset(value, path = 'trend data') {
  if (typeof value === 'string' && /^data:image\//i.test(value)) throw new TypeError(`${path} must not contain image data`);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoExternalAsset(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (bannedAssetKey.test(key)) throw new TypeError(`${path} contains forbidden asset field: ${key}`);
    assertNoExternalAsset(nested, `${path}.${key}`);
  }
}

function assertAllowedKeys(value, allowed, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${path} contains unexpected field: ${key}`);
}

function validateWatch(watch = {}) {
  assertAllowedKeys(watch, new Set(['instagramHashtags', 'naverKeywordGroups']), 'trend watch');
  const hashtags = Array.isArray(watch.instagramHashtags) ? watch.instagramHashtags : [];
  if (hashtags.length > 30) throw new TypeError('Instagram hashtag watch list exceeds the rolling 30-hashtag limit');
  for (const item of hashtags) {
    assertAllowedKeys(item, new Set(['query', 'baseKo', 'genderId', 'region']), 'Instagram hashtag watch entry');
    if (!item.query || !item.baseKo || !['F', 'M'].includes(item.genderId) || !/^[A-Z]{2,8}$/.test(item.region)) throw new TypeError('Invalid Instagram hashtag watch entry');
    if (/^#/.test(item.query) || /[\p{Extended_Pictographic}]/u.test(item.query)) throw new TypeError(`Instagram hashtag query must omit # and emoji: ${item.query}`);
  }
  const naver = Array.isArray(watch.naverKeywordGroups) ? watch.naverKeywordGroups : [];
  for (const item of naver) {
    assertAllowedKeys(item, new Set(['groupName', 'baseKo', 'genderId', 'region', 'keywords']), 'Naver keyword group');
    if (!item.groupName || !item.baseKo || !['F', 'M'].includes(item.genderId) || !/^[A-Z]{2,8}$/.test(item.region)) throw new TypeError('Invalid Naver keyword group');
    if (!Array.isArray(item.keywords) || item.keywords.length < 1 || item.keywords.length > 20 || item.keywords.some((keyword) => typeof keyword !== 'string' || !keyword.trim())) throw new TypeError(`Naver keyword group must contain 1-20 keywords: ${item.groupName}`);
  }
}

function validateSourceBatch(batch) {
  assertNoExternalAsset(batch, `source batch ${batch?.sourceId ?? 'unknown'}`);
  assertAllowedKeys(batch, new Set(['sourceId', 'sourceType', 'region', 'observedAt', 'rights', 'confidence', 'momentum', 'entries']), `source batch ${batch?.sourceId ?? 'unknown'}`);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(String(batch.sourceId ?? '')) || !allowedSourceTypes.has(batch.sourceType)) throw new TypeError('Invalid trend source batch identity');
  if (!/^[A-Z]{2,8}$/.test(String(batch.region ?? '')) || !batch.observedAt) throw new TypeError(`Trend source batch ${batch.sourceId} requires region and observedAt`);
  if (batch.rights !== 'metadata-only') throw new TypeError(`Trend source batch ${batch.sourceId} must use metadata-only rights`);
  if (!Array.isArray(batch.entries) || batch.entries.length < 1) throw new TypeError(`Trend source batch ${batch.sourceId} requires entries`);
  isoDate(batch.observedAt);
  for (const entry of batch.entries) {
    assertAllowedKeys(entry, new Set(['baseKo', 'genderId', 'region', 'observedAt', 'confidence', 'momentum', 'sampleCount', 'references']), `trend entry in ${batch.sourceId}`);
    if (!entry.baseKo || !['F', 'M'].includes(entry.genderId) || (entry.region && !/^[A-Z]{2,8}$/.test(entry.region))) throw new TypeError(`Invalid trend entry in ${batch.sourceId}`);
    unitInterval(entry.confidence ?? batch.confidence, `Trend confidence in ${batch.sourceId}`);
    unitInterval(entry.momentum ?? batch.momentum, `Trend momentum in ${batch.sourceId}`);
    if (entry.sampleCount != null && (!Number.isInteger(Number(entry.sampleCount)) || Number(entry.sampleCount) < 0)) throw new TypeError(`Trend sampleCount in ${batch.sourceId} must be a non-negative integer`);
    for (const reference of entry.references ?? []) {
      assertAllowedKeys(reference, new Set(['permalink', 'publishedAt']), `trend reference in ${batch.sourceId}`);
      const url = new URL(reference.permalink);
      if (url.protocol !== 'https:') throw new TypeError('Trend reference permalink must use HTTPS');
      if (reference.publishedAt) isoDate(reference.publishedAt);
    }
  }
}

export function validateTrendSource(source) {
  assertNoExternalAsset(source);
  assertAllowedKeys(source, new Set(['schemaVersion', 'registryVersion', 'snapshotDate', 'sourcePolicy', 'watch', 'sourceBatches']), 'trend source');
  if (source?.schemaVersion !== 1) throw new TypeError('Trend source schemaVersion must be 1');
  if (!/^HLM-TRENDS-/.test(String(source.registryVersion ?? ''))) throw new TypeError('Trend registryVersion is required');
  if (source.sourcePolicy !== 'metadata-only') throw new TypeError('Trend source policy must be metadata-only');
  isoDate(source.snapshotDate);
  validateWatch(source.watch);
  if (!Array.isArray(source.sourceBatches) || source.sourceBatches.length < 1) throw new TypeError('Trend source batches are required');
  const ids = new Set();
  for (const batch of source.sourceBatches) {
    validateSourceBatch(batch);
    if (ids.has(batch.sourceId)) throw new TypeError(`Duplicate trend sourceId: ${batch.sourceId}`);
    ids.add(batch.sourceId);
  }
  return source;
}

function freshnessScore(observedAt, snapshotDate) {
  const age = dayDistance(snapshotDate, observedAt);
  if (age <= 30) return 1;
  if (age <= 90) return 0.72;
  if (age <= 180) return 0.4;
  return 0.15;
}

function catalogBasePrefixes(catalog) {
  if (catalog?.schemaVersion !== 1 || catalog?.encoding !== 'HLM-DICT-TUPLE-1') throw new TypeError('Unsupported Hairloom catalog for trend compilation');
  const result = new Map();
  for (const tuple of catalog.records ?? []) {
    if (tuple[1] !== 0) continue;
    const genderId = tuple[2];
    const baseKo = catalog.dictionaries.bases[tuple[4]];
    const prefix = `${tuple[0].split('-').slice(0, 5).join('-')}-`;
    const key = `${genderId}|${baseKo}`;
    if (!result.has(key)) result.set(key, new Set());
    result.get(key).add(prefix);
  }
  return new Map([...result].map(([key, values]) => [key, [...values].sort()]));
}

export function compileTrendRegistry(source, catalog) {
  validateTrendSource(source);
  const prefixMap = catalogBasePrefixes(catalog);
  const grouped = new Map();
  for (const batch of source.sourceBatches) {
    for (const entry of batch.entries) {
      const key = `${entry.genderId}|${entry.baseKo}`;
      const prefixes = prefixMap.get(key);
      if (!prefixes?.length) throw new TypeError(`Trend base does not resolve to a stable catalog prefix: ${key}`);
      if (!grouped.has(key)) grouped.set(key, { baseKo: entry.baseKo, genderId: entry.genderId, designIdPrefixes: prefixes, signals: [] });
      const confidence = clamp(entry.confidence ?? batch.confidence);
      const momentum = clamp(entry.momentum ?? batch.momentum);
      const observedAt = isoDate(entry.observedAt ?? batch.observedAt);
      const freshness = freshnessScore(observedAt, source.snapshotDate);
      grouped.get(key).signals.push({
        sourceId: batch.sourceId,
        sourceType: batch.sourceType,
        region: entry.region ?? batch.region,
        observedAt,
        rights: batch.rights,
        confidence,
        momentum,
        freshness,
        sampleCount: Math.max(0, Number(entry.sampleCount ?? 0) || 0),
        references: (entry.references ?? []).map((reference) => ({ permalink: reference.permalink, publishedAt: reference.publishedAt ? isoDate(reference.publishedAt) : observedAt }))
      });
    }
  }
  const records = [...grouped.values()].map((group) => {
    const sourceIds = [...new Set(group.signals.map((signal) => signal.sourceId))].sort();
    const sourceTypes = [...new Set(group.signals.map((signal) => signal.sourceType))].sort();
    const regions = [...new Set(group.signals.map((signal) => signal.region))].sort();
    const average = group.signals.reduce((sum, signal) => sum + signal.momentum * 0.45 + signal.confidence * 0.35 + signal.freshness * 0.2, 0) / group.signals.length;
    const agreement = Math.min(0.15, Math.max(0, sourceTypes.length - 1) * 0.05);
    const score = Number(clamp(average + agreement).toFixed(4));
    const references = [...new Map(group.signals.flatMap((signal) => signal.references).map((reference) => [reference.permalink, reference])).values()]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.permalink.localeCompare(b.permalink))
      .slice(0, 6);
    const observedAt = group.signals.map((signal) => signal.observedAt).sort().at(-1);
    const idParts = group.designIdPrefixes[0].replace(/-$/, '').split('-').slice(2);
    return {
      id: `HLM-TREND-${idParts.join('-')}`,
      baseKo: group.baseKo,
      genderId: group.genderId,
      designIdPrefixes: group.designIdPrefixes,
      region: regions.length === 1 ? regions[0] : 'GLOBAL',
      score,
      sourceCount: sourceTypes.length,
      sourceIds,
      sourceTypes,
      observedAt,
      rights: 'metadata-only',
      sampleCount: group.signals.reduce((sum, signal) => sum + signal.sampleCount, 0),
      references
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    registryVersion: source.registryVersion,
    snapshotDate: source.snapshotDate,
    sourcePolicy: 'metadata-only',
    recordCount: records.length,
    records
  };
}

function generatedModule(snapshot) {
  return `// Generated by scripts/syncHairTrends.mjs. Do not hand-edit.\nexport const trendRegistrySnapshot = ${JSON.stringify(snapshot, null, 2)};\n`;
}

function mediaDate(item) {
  const date = new Date(item?.timestamp);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function summarizeInstagramMedia(media = [], observedAt = new Date().toISOString().slice(0, 10)) {
  const now = new Date(`${isoDate(observedAt)}T23:59:59Z`);
  const valid = media.filter((item) => mediaDate(item) && item.permalink && /^https:\/\//.test(item.permalink));
  const recent7 = valid.filter((item) => (now - mediaDate(item)) / 86_400_000 <= 7).length;
  const recent30 = valid.filter((item) => (now - mediaDate(item)) / 86_400_000 <= 30).length;
  const momentum = clamp((recent7 * 4) / Math.max(1, recent30));
  const confidence = clamp(recent30 / 20);
  const references = valid.sort((a, b) => mediaDate(b) - mediaDate(a)).slice(0, 3).map((item) => ({ permalink: item.permalink, publishedAt: isoDate(item.timestamp) }));
  return { observedAt: isoDate(observedAt), sampleCount: recent30, momentum: Number(momentum.toFixed(4)), confidence: Number(confidence.toFixed(4)), references };
}

export function summarizeNaverTrend(data = []) {
  const points = (Array.isArray(data) ? data : []).map((item) => Number(item?.ratio)).filter(Number.isFinite);
  const recent = points.slice(-4);
  const previous = points.slice(-8, -4);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const recentAverage = average(recent);
  const previousAverage = average(previous);
  const momentum = previousAverage > 0 ? clamp((recentAverage / previousAverage - 0.5) / 1.5) : clamp(recentAverage / 100);
  return { sampleCount: points.length, momentum: Number(momentum.toFixed(4)), confidence: Number(clamp(points.length / 12).toFixed(4)) };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Trend provider request failed with HTTP ${response.status}`);
  return response.json();
}

async function collectInstagramBatch(source) {
  const token = process.env.HAIRLOOM_META_ACCESS_TOKEN;
  const userId = process.env.HAIRLOOM_META_IG_USER_ID;
  if (!token || !userId) return null;
  const version = process.env.HAIRLOOM_META_API_VERSION || 'v25.0';
  const observedAt = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const watch of source.watch.instagramHashtags ?? []) {
    const search = new URL(`https://graph.facebook.com/${version}/ig_hashtag_search`);
    search.searchParams.set('user_id', userId);
    search.searchParams.set('q', watch.query);
    search.searchParams.set('access_token', token);
    const hashtag = await fetchJson(search);
    const hashtagId = hashtag?.data?.[0]?.id ?? hashtag?.id;
    if (!hashtagId) continue;
    const mediaUrl = new URL(`https://graph.facebook.com/${version}/${hashtagId}/recent_media`);
    mediaUrl.searchParams.set('user_id', userId);
    mediaUrl.searchParams.set('fields', 'id,media_type,permalink,timestamp,like_count,comments_count');
    mediaUrl.searchParams.set('limit', '50');
    mediaUrl.searchParams.set('access_token', token);
    const media = await fetchJson(mediaUrl);
    entries.push({ ...watch, ...summarizeInstagramMedia(media?.data ?? [], observedAt) });
  }
  return entries.length ? { sourceId: `instagram-hashtag-${observedAt}`, sourceType: 'instagram-hashtag', region: 'KR', observedAt, rights: 'metadata-only', confidence: 0, momentum: 0, entries } : null;
}

async function collectNaverBatch(source) {
  const clientId = process.env.HAIRLOOM_NAVER_CLIENT_ID;
  const clientSecret = process.env.HAIRLOOM_NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const observedAt = new Date().toISOString().slice(0, 10);
  const start = new Date(`${observedAt}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 83);
  const watch = source.watch.naverKeywordGroups ?? [];
  const entries = [];
  for (let offset = 0; offset < watch.length; offset += 5) {
    const group = watch.slice(offset, offset + 5);
    const payload = await fetchJson('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
      body: JSON.stringify({ startDate: start.toISOString().slice(0, 10), endDate: observedAt, timeUnit: 'week', keywordGroups: group.map((item) => ({ groupName: item.groupName, keywords: item.keywords })) })
    });
    for (const result of payload?.results ?? []) {
      const config = group.find((item) => item.groupName === result.title);
      if (!config) continue;
      entries.push({ baseKo: config.baseKo, genderId: config.genderId, region: config.region, observedAt, ...summarizeNaverTrend(result.data) });
    }
  }
  return entries.length ? { sourceId: `naver-datalab-${observedAt}`, sourceType: 'naver-datalab', region: 'KR', observedAt, rights: 'metadata-only', confidence: 0, momentum: 0, entries } : null;
}

function mergeBatches(source, batches, { replaceSourceTypes = false } = {}) {
  const replacements = new Map(batches.map((batch) => [batch.sourceId, batch]));
  const sourceTypes = new Set(batches.map((batch) => batch.sourceType));
  const next = source.sourceBatches.filter((batch) => !replacements.has(batch.sourceId) && !(replaceSourceTypes && sourceTypes.has(batch.sourceType)));
  next.push(...batches);
  return { ...source, snapshotDate: batches.map((batch) => batch.observedAt).sort().at(-1) ?? source.snapshotDate, sourceBatches: next.sort((a, b) => a.sourceId.localeCompare(b.sourceId)) };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadLocalTrendEnv() {
  const allowed = new Set(['HAIRLOOM_META_ACCESS_TOKEN', 'HAIRLOOM_META_IG_USER_ID', 'HAIRLOOM_META_API_VERSION', 'HAIRLOOM_NAVER_CLIENT_ID', 'HAIRLOOM_NAVER_CLIENT_SECRET']);
  const content = await readFile(resolve(root, '.env'), 'utf8').catch((error) => error?.code === 'ENOENT' ? '' : Promise.reject(error));
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1]) || process.env[match[1]] != null) continue;
    const rawValue = match[2].trim();
    const quoted = /^(?:"([\s\S]*)"|'([\s\S]*)')$/.exec(rawValue);
    process.env[match[1]] = quoted ? quoted[1] ?? quoted[2] ?? '' : rawValue;
  }
}

async function compileAndWrite(source, { check = false } = {}) {
  const catalog = await loadJson(catalogPath);
  const snapshot = compileTrendRegistry(source, catalog);
  const output = generatedModule(snapshot);
  if (check) {
    const current = await readFile(generatedPath, 'utf8').catch(() => '');
    if (current !== output) throw new Error('Trend registry drift detected; run npm run trend');
    console.log(`Trend registry verified: ${snapshot.recordCount} records, ${snapshot.registryVersion}.`);
    return snapshot;
  }
  await writeFile(generatedPath, output);
  console.log(`Trend registry generated: ${snapshot.recordCount} records, ${snapshot.registryVersion}.`);
  return snapshot;
}

export async function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const live = argv.includes('--live');
  const importArg = argv.find((value) => value.startsWith('--import='));
  let source = validateTrendSource(await loadJson(sourcePath));
  if (importArg) {
    const imported = await loadJson(resolve(process.cwd(), importArg.slice('--import='.length)));
    assertNoExternalAsset(imported, 'imported trend data');
    const batches = Array.isArray(imported) ? imported : imported.sourceBatches ?? [imported];
    batches.forEach(validateSourceBatch);
    source = mergeBatches(source, batches);
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  }
  if (live) {
    await loadLocalTrendEnv();
    const batches = (await Promise.all([collectInstagramBatch(source), collectNaverBatch(source)])).filter(Boolean);
    if (!batches.length) throw new Error('No live trend provider configured; set Meta or Naver Hairloom credentials');
    source = mergeBatches(source, batches, { replaceSourceTypes: true });
    validateTrendSource(source);
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  }
  return compileAndWrite(source, { check });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
