import { trendRegistrySnapshot } from './hairTrendData.mjs';

export const TREND_REGISTRY_SCHEMA_VERSION = 1;
const bannedAssetKey = /^(?:image|images|imageurl|imagedataurl|mediaurl|media_url|thumbnail|thumbnailurl|base64|b64_json|dataurl|downloadurl)$/i;

function assertNoExternalAsset(value, path = 'trend registry') {
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

export function validateTrendRegistrySnapshot(snapshot = trendRegistrySnapshot) {
  assertNoExternalAsset(snapshot);
  assertAllowedKeys(snapshot, new Set(['schemaVersion', 'registryVersion', 'snapshotDate', 'sourcePolicy', 'recordCount', 'records']), 'trend registry');
  if (!snapshot || snapshot.schemaVersion !== TREND_REGISTRY_SCHEMA_VERSION) throw new TypeError('Trend registry schema version mismatch');
  if (!/^HLM-TRENDS-/.test(String(snapshot.registryVersion ?? ''))) throw new TypeError('Trend registry version is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.snapshotDate ?? ''))) throw new TypeError('Trend registry snapshot date is invalid');
  if (snapshot.sourcePolicy !== 'metadata-only') throw new TypeError('Trend registry must be metadata-only');
  if (!Array.isArray(snapshot.records) || snapshot.recordCount !== snapshot.records.length) throw new TypeError('Trend registry record count mismatch');
  const ids = new Set();
  const structures = new Set();
  for (const record of snapshot.records) {
    assertAllowedKeys(record, new Set(['id', 'baseKo', 'genderId', 'designIdPrefixes', 'region', 'score', 'sourceCount', 'sourceIds', 'sourceTypes', 'observedAt', 'rights', 'sampleCount', 'references']), `trend record ${record?.id ?? 'unknown'}`);
    if (!/^HLM-TREND-/.test(String(record.id ?? '')) || ids.has(record.id)) throw new TypeError(`Invalid or duplicate trend ID: ${record.id}`);
    ids.add(record.id);
    const structure = `${record.genderId}|${record.baseKo}`;
    if (!['F', 'M'].includes(record.genderId) || !record.baseKo || structures.has(structure)) throw new TypeError(`Invalid or duplicate trend structure: ${structure}`);
    structures.add(structure);
    if (!Array.isArray(record.designIdPrefixes) || !record.designIdPrefixes.length || record.designIdPrefixes.some((prefix) => !/^HLM-C-[FM]-(?:US|S|MD|L|XL)-\d{2}-$/.test(prefix))) throw new TypeError(`Invalid trend design prefix: ${record.id}`);
    if (!Number.isFinite(record.score) || record.score < 0 || record.score > 1) throw new TypeError(`Invalid trend score: ${record.id}`);
    if (!Number.isInteger(record.sourceCount) || record.sourceCount < 1) throw new TypeError(`Invalid trend source count: ${record.id}`);
    if (!Array.isArray(record.sourceIds) || !record.sourceIds.length || !Array.isArray(record.sourceTypes) || record.sourceTypes.length !== record.sourceCount) throw new TypeError(`Invalid trend source metadata: ${record.id}`);
    if (!/^[A-Z]{2,8}$/.test(String(record.region ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.observedAt ?? ''))) throw new TypeError(`Invalid trend region or date: ${record.id}`);
    if (!Number.isInteger(record.sampleCount) || record.sampleCount < 0) throw new TypeError(`Invalid trend sample count: ${record.id}`);
    if (record.rights !== 'metadata-only') throw new TypeError(`Trend record rights must be metadata-only: ${record.id}`);
    for (const reference of record.references ?? []) {
      assertAllowedKeys(reference, new Set(['permalink', 'publishedAt']), `trend reference ${record.id}`);
      const url = new URL(reference.permalink);
      if (url.protocol !== 'https:') throw new TypeError(`Trend reference must use HTTPS: ${record.id}`);
    }
  }
  return snapshot;
}

const registry = validateTrendRegistrySnapshot();
export const TREND_REGISTRY_VERSION = registry.registryVersion;
export const TREND_REGISTRY_UPDATED_AT = registry.snapshotDate;
export const TREND_STRUCTURE_BASES = Object.freeze(registry.records.map((record) => record.baseKo));

const recordByPrefix = new Map(registry.records.flatMap((record) => record.designIdPrefixes.map((prefix) => [prefix, record])));
const recordByStructure = new Map(registry.records.map((record) => [`${record.genderId}|${record.baseKo}`, record]));

function candidatePrefix(candidate) {
  const id = String(candidate?.id ?? candidate?.designId ?? '');
  const parts = id.split('-');
  return parts.length >= 5 && parts[0] === 'HLM' && parts[1] === 'C' ? `${parts.slice(0, 5).join('-')}-` : '';
}

export function trendRecordForCandidate(candidate) {
  const prefix = candidatePrefix(candidate);
  if (prefix && recordByPrefix.has(prefix)) return recordByPrefix.get(prefix);
  const genderId = String(candidate?.genderId ?? '').toUpperCase();
  const baseKo = String(candidate?.baseKo ?? '');
  return recordByStructure.get(`${genderId}|${baseKo}`) ?? null;
}

export function trendPointsForCandidate(candidate) {
  const record = trendRecordForCandidate(candidate);
  if (!record) return 2;
  if (record.score >= 0.7) return 5;
  if (record.score >= 0.5) return 4;
  return 3;
}

export function trendSelectionBonusForCandidate(candidate) {
  const record = trendRecordForCandidate(candidate);
  if (!record) return 0;
  if (record.score >= 0.7) return 3;
  if (record.score >= 0.45) return 2;
  return 1;
}

export function trendBadgeForCandidate(candidate) {
  const record = trendRecordForCandidate(candidate);
  if (!record) return '';
  const state = record.score >= 0.7 ? 'RISING' : 'WATCH';
  return `${state} ${record.region} · ${record.sourceCount} SRC`;
}
