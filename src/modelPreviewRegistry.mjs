export const MODEL_PREVIEW_SCHEMA_VERSION = 2;
export const MODEL_PREVIEW_ARCHIVE_SCHEMA_VERSION = 1;
export const MODEL_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const MODEL_PREVIEW_MAX_RECORDS = 80;
export const MODEL_PREVIEW_MAX_TOTAL_BYTES = 160 * 1024 * 1024;
export const MODEL_PREVIEW_LENGTH_IDS = Object.freeze(['US', 'S', 'MD', 'L', 'XL']);
export const MODEL_PREVIEW_RIGHTS = Object.freeze(['salon-owned', 'model-consented', 'licensed-stock', 'public-domain']);
export const MODEL_PREVIEW_CHANGE_CHANNEL = 'hairloom-model-preview-changes-v2';

const DB_NAME = 'hairloom-model-previews';
const DB_VERSION = 1;
const STORE_NAME = 'previews';
const STORAGE_EVENT_KEY = '__hairloom_model_preview_change_v2';
const ARCHIVE_KIND = 'hairloom-model-preview-archive';
const ARCHIVE_MIME = 'application/vnd.hairloom.model-previews+json';
const ARCHIVE_ITERATIONS = 250000;
const ARCHIVE_MAX_BYTES = MODEL_PREVIEW_MAX_TOTAL_BYTES + 8 * 1024 * 1024;
const genders = new Set(['U', 'F', 'M']);
const lengths = new Set(MODEL_PREVIEW_LENGTH_IDS);
const rights = new Set(MODEL_PREVIEW_RIGHTS);
const sourceKinds = new Set(['salon', 'web']);
const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedMetadataKeys = new Set([
  'id', 'schemaVersion', 'title', 'genderId', 'lengthIds', 'textureBuckets',
  'sourceKind', 'rightsBasis', 'attribution', 'sourceUrl', 'consentConfirmed',
  'imageMime', 'imageBytes', 'createdAt', 'updatedAt', 'displayOnly', 'enabled',
  'consentVerifiedAt', 'rightsExpiresAt', 'revokedAt', 'rightsReference',
  'reviewedBy', 'designRefs', 'focalX', 'focalY', 'contentHash'
]);

let writeQueue = Promise.resolve();
let changeCounter = 0;

function stableHash32(input) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(input))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalizedString(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) throw new TypeError(`${label} is required and must be at most ${maxLength} characters`);
  return text;
}

function optionalString(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new TypeError(`${label} must be at most ${maxLength} characters`);
  return text;
}

function normalizedSourceUrl(value, required) {
  const text = String(value ?? '').trim();
  if (!text && !required) return '';
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new TypeError('Model preview sourceUrl must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError('Model preview sourceUrl must be a credential-free HTTPS URL');
  return parsed.href;
}

function normalizedIsoDate(value, label, { required = false, endOfDay = false, fallback = '' } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required && !fallback) throw new TypeError(`${label} is required`);
    return fallback;
  }
  const source = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : raw;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} is invalid`);
  return date.toISOString();
}

function normalizedNumber(value, label, fallback = 0.5) {
  const number = value === '' || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} must be from 0 to 1`);
  return Math.round(number * 10000) / 10000;
}

function normalizedDesignRefs(value) {
  const refs = [...new Set(Array.isArray(value) ? value.map((item) => String(item).trim().toUpperCase()).filter(Boolean) : [])].sort();
  if (refs.length > 20) throw new TypeError('Model preview designRefs may contain at most 20 values');
  for (const ref of refs) {
    if (!/^HLM-(?:C|S)-[A-Z0-9]+(?:-[A-Z0-9]+){1,6}$/.test(ref)) throw new TypeError(`Unsupported model preview designRef: ${ref}`);
  }
  return refs;
}

function normalizedContentHash(value, required) {
  const hash = String(value ?? '').trim().toLowerCase();
  if (!hash && !required) return '';
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('Model preview contentHash must be a SHA-256 hex value');
  return hash;
}

function migrateMetadata(raw) {
  const sourceVersion = Number(raw?.schemaVersion ?? MODEL_PREVIEW_SCHEMA_VERSION);
  if (![1, MODEL_PREVIEW_SCHEMA_VERSION].includes(sourceVersion)) throw new TypeError('Model preview schema version mismatch');
  if (sourceVersion === MODEL_PREVIEW_SCHEMA_VERSION) return { ...raw };
  const createdAt = normalizedIsoDate(raw.createdAt, 'Model preview createdAt', { required: true });
  return {
    ...raw,
    schemaVersion: MODEL_PREVIEW_SCHEMA_VERSION,
    updatedAt: createdAt,
    consentVerifiedAt: createdAt,
    rightsExpiresAt: '',
    revokedAt: raw.enabled === false ? createdAt : '',
    rightsReference: '',
    reviewedBy: '',
    designRefs: [],
    focalX: 0.5,
    focalY: 0.5,
    contentHash: ''
  };
}
function normalizedPreviewIds(ids) {
  const values = [...new Set(Array.isArray(ids) ? ids.map((id) => String(id ?? '').trim()) : [])];
  if (!values.length || values.length > MODEL_PREVIEW_MAX_RECORDS) throw new TypeError('Model preview IDs must contain 1-80 values');
  for (const value of values) if (!/^HLM-MP-[A-F0-9]{8}$/.test(value)) throw new TypeError('Invalid model preview id');
  return values;
}


function refMatchesDesign(ref, designId) {
  return designId === ref || designId.startsWith(`${ref}-`);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Model preview database failed to open'));
  });
}

function transactionRequest(mode, execute) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = execute(store, transaction);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Model preview database transaction failed')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Model preview database transaction aborted')); };
  }));
}

function readRawRows() {
  return openDatabase().then(async (database) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      return await requestResult(transaction.objectStore(STORE_NAME).getAll());
    } finally {
      database.close();
    }
  });
}

function withWriteLock(operation) {
  if (globalThis.navigator?.locks?.request) {
    try { return globalThis.navigator.locks.request('hairloom-model-preview-write-v2', operation); } catch { /* use the local serialization fallback */ }
  }
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

function broadcastChange(type, id = '') {
  const change = { schemaVersion: 1, type, id: String(id || ''), at: new Date().toISOString(), sequence: ++changeCounter };
  if (globalThis.BroadcastChannel) {
    try {
      const channel = new BroadcastChannel(MODEL_PREVIEW_CHANGE_CHANNEL);
      channel.postMessage(change);
      queueMicrotask(() => { try { channel.close(); } catch { /* no-op */ } });
    } catch {
      // localStorage remains the fallback same-origin notification path.
    }
  }
  if (globalThis.window) {
    try {
      globalThis.localStorage?.setItem(STORAGE_EVENT_KEY, JSON.stringify(change));
    } catch {
      // Persistence is already complete; notification failures must not change its outcome.
    }
  }
}

function isChange(value) {
  return Boolean(value && typeof value === 'object' && value.schemaVersion === 1 && ['add', 'update', 'delete', 'import'].includes(value.type));
}

function bytesToBase64(bytes) {
  if (globalThis.Buffer) return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  if (globalThis.Buffer) return new Uint8Array(Buffer.from(String(value), 'base64'));
  const binary = atob(String(value));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cryptoApi() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('Web Crypto is unavailable');
  return globalThis.crypto;
}

async function deriveArchiveKey(passphrase, salt, usage) {
  const crypto = cryptoApi();
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ARCHIVE_ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

function assertPassphrase(passphrase) {
  const value = String(passphrase ?? '');
  if (value.length < 10) throw new TypeError('Archive passphrase must be at least 10 characters');
  return value;
}

async function hydrateStoredRow(row) {
  if (!row || typeof row !== 'object' || !(row.blob instanceof Blob)) throw new TypeError('Stored model preview row is invalid');
  if (!imageMimes.has(row.blob.type) || !row.blob.size || row.blob.size > MODEL_PREVIEW_MAX_BYTES) throw new TypeError('Stored model preview Blob is invalid');
  const hash = row.contentHash || await modelPreviewContentHash(row.blob);
  const { blob, ...rawMetadata } = row;
  const metadata = normalizeModelPreviewMetadata({ ...rawMetadata, imageMime: blob.type, imageBytes: blob.size, contentHash: hash });
  return { ...metadata, blob };
}

async function persistPreparedRecord(metadata, blob) {
  await transactionRequest('readwrite', (store) => { store.put({ ...metadata, blob }); });
}

export function createModelPreviewId(seed = '') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `HLM-MP-${stableHash32(`${seed}:${random}`).toString(16).padStart(8, '0').toUpperCase()}`;
}

export function normalizeModelPreviewMetadata(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Model preview metadata must be an object');
  for (const key of Object.keys(raw)) if (!allowedMetadataKeys.has(key)) throw new TypeError(`Unknown model preview field: ${key}`);
  const migrated = migrateMetadata(raw);
  const id = String(migrated.id ?? '').trim();
  if (!/^HLM-MP-[A-F0-9]{8}$/.test(id)) throw new TypeError('Model preview id must use HLM-MP-XXXXXXXX');
  const title = normalizedString(migrated.title, 'Model preview title', 80);
  const genderId = String(migrated.genderId ?? 'U').toUpperCase();
  if (!genders.has(genderId)) throw new TypeError('Model preview genderId must be U, F, or M');
  const lengthIds = [...new Set(Array.isArray(migrated.lengthIds) ? migrated.lengthIds.map(String) : [])].sort();
  if (lengthIds.some((value) => !lengths.has(value))) throw new TypeError('Model preview lengthIds contain an unsupported value');
  const textureBuckets = [...new Set(Array.isArray(migrated.textureBuckets) ? migrated.textureBuckets.map(Number) : [])].sort((a, b) => a - b);
  if (textureBuckets.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) throw new TypeError('Model preview textureBuckets must contain integers from 0 to 3');
  const sourceKind = String(migrated.sourceKind ?? 'salon');
  if (!sourceKinds.has(sourceKind)) throw new TypeError('Model preview sourceKind must be salon or web');
  const rightsBasis = String(migrated.rightsBasis ?? '');
  if (!rights.has(rightsBasis)) throw new TypeError('Model preview rightsBasis is unsupported');
  const attribution = normalizedString(migrated.attribution, 'Model preview attribution', 160);
  const sourceUrl = normalizedSourceUrl(migrated.sourceUrl, sourceKind === 'web');
  if (migrated.consentConfirmed !== true) throw new TypeError('Model preview rights and model consent must be confirmed');
  const imageMime = String(migrated.imageMime ?? '').toLowerCase();
  if (!imageMimes.has(imageMime)) throw new TypeError('Model preview image must be JPEG, PNG, or WebP');
  const imageBytes = Number(migrated.imageBytes);
  if (!Number.isInteger(imageBytes) || imageBytes < 1 || imageBytes > MODEL_PREVIEW_MAX_BYTES) throw new TypeError(`Model preview image must be 1-${MODEL_PREVIEW_MAX_BYTES} bytes`);
  const createdAt = normalizedIsoDate(migrated.createdAt, 'Model preview createdAt', { required: true });
  const updatedAt = normalizedIsoDate(migrated.updatedAt, 'Model preview updatedAt', { fallback: createdAt });
  const consentVerifiedAt = normalizedIsoDate(migrated.consentVerifiedAt, 'Model preview consentVerifiedAt', { required: true, fallback: createdAt });
  const rightsExpiresAt = normalizedIsoDate(migrated.rightsExpiresAt, 'Model preview rightsExpiresAt', { endOfDay: true });
  const revokedAt = normalizedIsoDate(migrated.revokedAt, 'Model preview revokedAt');
  if (rightsExpiresAt && new Date(rightsExpiresAt) < new Date(consentVerifiedAt)) throw new TypeError('Model preview rightsExpiresAt must not precede consentVerifiedAt');
  if (migrated.displayOnly === false) throw new TypeError('Model previews are display-only');
  const enabled = migrated.enabled !== false && !revokedAt;
  const contentHash = normalizedContentHash(migrated.contentHash, false);
  return Object.freeze({
    id,
    schemaVersion: MODEL_PREVIEW_SCHEMA_VERSION,
    title,
    genderId,
    lengthIds: Object.freeze(lengthIds),
    textureBuckets: Object.freeze(textureBuckets),
    sourceKind,
    rightsBasis,
    attribution,
    sourceUrl,
    consentConfirmed: true,
    imageMime,
    imageBytes,
    createdAt,
    updatedAt,
    consentVerifiedAt,
    rightsExpiresAt,
    revokedAt,
    rightsReference: optionalString(migrated.rightsReference, 'Model preview rightsReference', 120),
    reviewedBy: optionalString(migrated.reviewedBy, 'Model preview reviewedBy', 80),
    designRefs: Object.freeze(normalizedDesignRefs(migrated.designRefs)),
    focalX: normalizedNumber(migrated.focalX, 'Model preview focalX'),
    focalY: normalizedNumber(migrated.focalY, 'Model preview focalY'),
    contentHash,
    displayOnly: true,
    enabled
  });
}

export function modelPreviewDescriptor(record = {}) {
  const vector = record.vector ?? {};
  const genderId = record.genderId ?? (vector.gender === 1 ? 'F' : vector.gender === 2 ? 'M' : 'U');
  const lengthId = record.lengthId ?? MODEL_PREVIEW_LENGTH_IDS[Number(vector.length)] ?? '';
  const textureBucket = Number.isInteger(vector.textureBucket) ? vector.textureBucket : null;
  return { id: String(record.id ?? ''), genderId, lengthId, textureBucket };
}

export function modelPreviewRightsStatus(preview, now = Date.now()) {
  if (preview?.revokedAt) return 'revoked';
  if (preview?.enabled === false) return 'disabled';
  if (preview?.rightsExpiresAt && new Date(preview.rightsExpiresAt).getTime() < new Date(now).getTime()) return 'expired';
  return 'active';
}
export function modelPreviewAllowedForSlot(status) {
  return status === 'queued' || status === 'active';
}

export function modelPreviewMatchScore(preview, record, now = Date.now()) {
  if (!preview || modelPreviewRightsStatus(preview, now) !== 'active') return Number.NEGATIVE_INFINITY;
  const descriptor = modelPreviewDescriptor(record);
  if (preview.designRefs?.length && !preview.designRefs.some((ref) => refMatchesDesign(ref, descriptor.id))) return Number.NEGATIVE_INFINITY;
  if (preview.genderId !== 'U' && descriptor.genderId !== preview.genderId) return Number.NEGATIVE_INFINITY;
  if (preview.lengthIds.length && !preview.lengthIds.includes(descriptor.lengthId)) return Number.NEGATIVE_INFINITY;
  if (preview.textureBuckets.length && !preview.textureBuckets.includes(descriptor.textureBucket)) return Number.NEGATIVE_INFINITY;
  const designScore = preview.designRefs?.some((ref) => descriptor.id === ref) ? 80 : preview.designRefs?.length ? 50 : 0;
  return designScore
    + (preview.genderId === descriptor.genderId ? 8 : 0)
    + (preview.lengthIds.includes(descriptor.lengthId) ? 6 : 0)
    + (preview.textureBuckets.includes(descriptor.textureBucket) ? 4 : 0)
    + preview.lengthIds.length
    + preview.textureBuckets.length;
}

export function selectModelPreview(previews, record, slotIndex = 0, now = Date.now()) {
  const candidates = (Array.isArray(previews) ? previews : [])
    .map((preview) => ({ preview, score: modelPreviewMatchScore(preview, record, now) }))
    .filter((entry) => Number.isFinite(entry.score));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score
    || stableHash32(`${record?.id}:${slotIndex}:${a.preview.id}`) - stableHash32(`${record?.id}:${slotIndex}:${b.preview.id}`)
    || a.preview.id.localeCompare(b.preview.id));
  return candidates[0].preview;
}

export async function modelPreviewContentHash(blob) {
  if (!(blob instanceof Blob)) throw new TypeError('Model preview image Blob is required');
  const digest = await cryptoApi().subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function inspectModelPreviewLibrary() {
  const rows = await readRawRows();
  const records = [];
  let invalidCount = 0;
  let totalBytes = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    totalBytes += Number(row?.blob?.size || row?.imageBytes || 0);
    try {
      records.push(await hydrateStoredRow(row));
    } catch {
      invalidCount += 1;
    }
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return Object.freeze({
    records: Object.freeze(records),
    invalidCount,
    totalBytes,
    count: records.length,
    maxRecords: MODEL_PREVIEW_MAX_RECORDS,
    maxTotalBytes: MODEL_PREVIEW_MAX_TOTAL_BYTES
  });
}

export async function listModelPreviews() {
  return [...(await inspectModelPreviewLibrary()).records];
}

export async function saveModelPreview(raw, blob) {
  if (!(blob instanceof Blob)) throw new TypeError('Model preview image Blob is required');
  if (!imageMimes.has(blob.type) || !blob.size || blob.size > MODEL_PREVIEW_MAX_BYTES) throw new TypeError('Model preview image Blob is invalid');
  const computedHash = await modelPreviewContentHash(blob);
  if (raw?.contentHash && String(raw.contentHash).toLowerCase() !== computedHash) throw new TypeError('Model preview contentHash does not match image bytes');
  return withWriteLock(async () => {
    const rows = await readRawRows();
    const stored = Array.isArray(rows) ? rows : [];
    const existingRow = raw?.id ? stored.find((row) => row.id === raw.id) : null;
    const existingRecords = [];
    for (const row of stored) {
      try {
        existingRecords.push(await hydrateStoredRow(row));
      } catch {
        // Invalid rows still count toward storage limits but cannot participate in matching.
      }
    }
    const duplicate = existingRecords.find((record) => record.contentHash === computedHash && record.id !== raw?.id);
    if (duplicate) throw new Error(`같은 모델 사진이 이미 등록되어 있습니다: ${duplicate.title}`);
    const now = new Date().toISOString();
    const metadata = normalizeModelPreviewMetadata({
      ...raw,
      id: raw?.id || createModelPreviewId(`${raw?.title}:${computedHash}`),
      imageMime: blob.type,
      imageBytes: blob.size,
      contentHash: computedHash,
      createdAt: existingRow?.createdAt || raw?.createdAt || now,
      updatedAt: now,
      displayOnly: true
    });
    if (!existingRow && stored.length >= MODEL_PREVIEW_MAX_RECORDS) throw new Error(`등록 모델은 최대 ${MODEL_PREVIEW_MAX_RECORDS}장까지 저장할 수 있습니다.`);
    const currentBytes = stored.reduce((sum, row) => sum + Number(row?.blob?.size || row?.imageBytes || 0), 0);
    const totalBytes = currentBytes - Number(existingRow?.blob?.size || existingRow?.imageBytes || 0) + blob.size;
    if (totalBytes > MODEL_PREVIEW_MAX_TOTAL_BYTES) throw new Error('등록 모델 저장 공간은 160MB를 초과할 수 없습니다.');
    await persistPreparedRecord(metadata, blob);
    broadcastChange(existingRow ? 'update' : 'add', metadata.id);
    return metadata;
  });
}

export async function saveModelPreviewBatch(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new TypeError('Model preview batch requires entries');
  const prepared = [];
  for (const entry of entries) {
    if (!(entry?.blob instanceof Blob) || !imageMimes.has(entry.blob.type) || !entry.blob.size || entry.blob.size > MODEL_PREVIEW_MAX_BYTES) throw new TypeError('Model preview batch contains an invalid image Blob');
    const contentHash = await modelPreviewContentHash(entry.blob);
    prepared.push({ raw: entry.metadata || {}, blob: entry.blob, contentHash });
  }
  return withWriteLock(async () => {
    const rows = await readRawRows();
    const stored = Array.isArray(rows) ? rows : [];
    const existingRecords = [];
    for (const row of stored) {
      try { existingRecords.push(await hydrateStoredRow(row)); } catch { /* invalid rows still count toward limits */ }
    }
    const hashes = new Set(existingRecords.map((record) => record.contentHash));
    const now = new Date().toISOString();
    const recordsToSave = [];
    for (const item of prepared) {
      if (hashes.has(item.contentHash)) throw new Error('일괄 등록에 이미 저장된 중복 모델 사진이 포함되어 있습니다.');
      hashes.add(item.contentHash);
      const metadata = normalizeModelPreviewMetadata({
        ...item.raw,
        id: item.raw.id || createModelPreviewId(`${item.raw.title}:${item.contentHash}`),
        imageMime: item.blob.type,
        imageBytes: item.blob.size,
        contentHash: item.contentHash,
        createdAt: item.raw.createdAt || now,
        updatedAt: now,
        displayOnly: true
      });
      recordsToSave.push({ metadata, blob: item.blob });
    }
    if (stored.length + recordsToSave.length > MODEL_PREVIEW_MAX_RECORDS) throw new Error(`등록 모델은 최대 ${MODEL_PREVIEW_MAX_RECORDS}장까지 저장할 수 있습니다.`);
    const currentBytes = stored.reduce((sum, row) => sum + Number(row?.blob?.size || row?.imageBytes || 0), 0);
    const addedBytes = recordsToSave.reduce((sum, item) => sum + item.blob.size, 0);
    if (currentBytes + addedBytes > MODEL_PREVIEW_MAX_TOTAL_BYTES) throw new Error('등록 모델 저장 공간은 160MB를 초과할 수 없습니다.');
    await transactionRequest('readwrite', (store) => { for (const item of recordsToSave) store.put({ ...item.metadata, blob: item.blob }); });
    broadcastChange('import');
    return Object.freeze(recordsToSave.map((item) => item.metadata));
  });
}

async function updateStoredPreviews(ids, update) {
  const values = normalizedPreviewIds(ids);
  return withWriteLock(async () => {
    const rows = await readRawRows();
    const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, row]));
    const missing = values.find((id) => !byId.has(id));
    if (missing) throw new Error(`등록 모델을 찾을 수 없습니다: ${missing}`);
    const now = new Date().toISOString();
    const prepared = [];
    for (const id of values) {
      const record = await hydrateStoredRow(byId.get(id));
      const { blob, ...metadata } = record;
      const next = normalizeModelPreviewMetadata({
        ...metadata,
        ...update(metadata, now),
        id,
        imageMime: blob.type,
        imageBytes: blob.size,
        contentHash: record.contentHash,
        updatedAt: now,
        displayOnly: true
      });
      prepared.push({ metadata: next, blob });
    }
    await transactionRequest('readwrite', (store) => { for (const item of prepared) store.put({ ...item.metadata, blob: item.blob }); });
    broadcastChange('update', values.length === 1 ? values[0] : '');
    return Object.freeze(prepared.map((item) => item.metadata));
  });
}

export async function setModelPreviewsEnabled(ids, enabled) {
  return updateStoredPreviews(ids, (metadata, now) => ({
    enabled: Boolean(enabled),
    revokedAt: enabled ? '' : metadata.revokedAt || now
  }));
}

export async function setModelPreviewEnabled(id, enabled, metadata = {}) {
  const [record] = await updateStoredPreviews([id], (stored, now) => ({
    ...metadata,
    enabled: Boolean(enabled),
    revokedAt: enabled ? '' : metadata.revokedAt || stored.revokedAt || now
  }));
  return record;
}

export async function setModelPreviewsDesignRefs(ids, designRefs) {
  const normalized = normalizedDesignRefs(designRefs);
  return updateStoredPreviews(ids, () => ({ designRefs: normalized }));
}

export async function deleteModelPreviews(ids) {
  const values = normalizedPreviewIds(ids);
  return withWriteLock(async () => {
    const rows = await readRawRows();
    const existing = new Set((Array.isArray(rows) ? rows : []).map((row) => row.id));
    const found = values.filter((id) => existing.has(id));
    if (!found.length) return 0;
    await transactionRequest('readwrite', (store) => { for (const id of found) store.delete(id); });
    broadcastChange('delete', found.length === 1 ? found[0] : '');
    return found.length;
  });
}

export async function deleteModelPreview(id) {
  return (await deleteModelPreviews([id])) === 1;
}

export function subscribeModelPreviewChanges(listener) {
  if (typeof listener !== 'function') throw new TypeError('Model preview change listener must be a function');
  let active = true;
  const deliver = (change) => {
    if (!active || !isChange(change)) return;
    Promise.resolve(listener(change)).catch(() => {});
  };
  let channel = null;
  if (globalThis.BroadcastChannel) {
    try {
      channel = new BroadcastChannel(MODEL_PREVIEW_CHANGE_CHANNEL);
      channel.onmessage = (event) => deliver(event.data);
    } catch {
      channel = null;
    }
  }
  const storageHandler = (event) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch { /* ignore malformed external storage events */ }
  };
  globalThis.addEventListener?.('storage', storageHandler);
  return () => {
    active = false;
    try { channel?.close(); } catch { /* no-op */ }
    globalThis.removeEventListener?.('storage', storageHandler);
  };
}

export async function exportModelPreviewArchive(passphrase) {
  const password = assertPassphrase(passphrase);
  const records = await listModelPreviews();
  const archiveRecords = [];
  for (const record of records) {
    const { blob, ...metadata } = record;
    archiveRecords.push({ metadata, imageBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const payload = new TextEncoder().encode(JSON.stringify({
    schemaVersion: MODEL_PREVIEW_ARCHIVE_SCHEMA_VERSION,
    kind: ARCHIVE_KIND,
    exportedAt: new Date().toISOString(),
    records: archiveRecords
  }));
  const crypto = cryptoApi();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveArchiveKey(password, salt, 'encrypt');
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  const envelope = {
    schemaVersion: MODEL_PREVIEW_ARCHIVE_SCHEMA_VERSION,
    kind: ARCHIVE_KIND,
    encryption: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: ARCHIVE_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
  return new Blob([JSON.stringify(envelope)], { type: ARCHIVE_MIME });
}

export async function importModelPreviewArchive(blob, passphrase) {
  const password = assertPassphrase(passphrase);
  if (!(blob instanceof Blob) || !blob.size || blob.size > ARCHIVE_MAX_BYTES) throw new TypeError('Model preview archive is invalid or too large');
  let envelope;
  try {
    envelope = JSON.parse(await blob.text());
  } catch {
    throw new TypeError('Model preview archive is not valid JSON');
  }
  if (!envelope || envelope.schemaVersion !== MODEL_PREVIEW_ARCHIVE_SCHEMA_VERSION || envelope.kind !== ARCHIVE_KIND
    || envelope.encryption !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== ARCHIVE_ITERATIONS) {
    throw new TypeError('Model preview archive envelope is unsupported');
  }
  let payload;
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('invalid archive parameters');
    const key = await deriveArchiveKey(password, salt, 'decrypt');
    const plaintext = await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(envelope.ciphertext));
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('보관 파일 암호가 틀렸거나 파일이 손상되었습니다.');
  }
  if (!payload || payload.schemaVersion !== MODEL_PREVIEW_ARCHIVE_SCHEMA_VERSION || payload.kind !== ARCHIVE_KIND || !Array.isArray(payload.records)) {
    throw new TypeError('Model preview archive payload is unsupported');
  }
  if (payload.records.length > MODEL_PREVIEW_MAX_RECORDS) throw new TypeError('Model preview archive contains too many records');
  const prepared = [];
  let archiveBytes = 0;
  for (const item of payload.records) {
    const bytes = base64ToBytes(item?.imageBase64);
    archiveBytes += bytes.byteLength;
    if (!bytes.byteLength || bytes.byteLength > MODEL_PREVIEW_MAX_BYTES || archiveBytes > MODEL_PREVIEW_MAX_TOTAL_BYTES) throw new TypeError('Model preview archive image limits exceeded');
    const mime = String(item?.metadata?.imageMime || '');
    if (!imageMimes.has(mime)) throw new TypeError('Model preview archive contains an unsupported image');
    const image = new Blob([bytes], { type: mime });
    const hash = await modelPreviewContentHash(image);
    const metadata = normalizeModelPreviewMetadata({ ...item.metadata, contentHash: hash, imageBytes: image.size, imageMime: image.type });
    prepared.push({ metadata, blob: image });
  }
  return withWriteLock(async () => {
    const rows = await readRawRows();
    const stored = Array.isArray(rows) ? rows : [];
    const existingRecords = [];
    for (const row of stored) {
      try { existingRecords.push(await hydrateStoredRow(row)); } catch { /* retain invalid rows but do not match them */ }
    }
    const hashes = new Set(existingRecords.map((record) => record.contentHash));
    const ids = new Set(stored.map((row) => row.id));
    const accepted = [];
    let skipped = 0;
    for (const item of prepared) {
      if (hashes.has(item.metadata.contentHash)) { skipped += 1; continue; }
      let metadata = item.metadata;
      if (ids.has(metadata.id)) metadata = normalizeModelPreviewMetadata({ ...metadata, id: createModelPreviewId(`${metadata.title}:${metadata.contentHash}`) });
      accepted.push({ metadata, blob: item.blob });
      hashes.add(metadata.contentHash);
      ids.add(metadata.id);
    }
    const currentBytes = stored.reduce((sum, row) => sum + Number(row?.blob?.size || row?.imageBytes || 0), 0);
    const addedBytes = accepted.reduce((sum, item) => sum + item.blob.size, 0);
    if (stored.length + accepted.length > MODEL_PREVIEW_MAX_RECORDS) throw new Error(`등록 모델은 최대 ${MODEL_PREVIEW_MAX_RECORDS}장까지 저장할 수 있습니다.`);
    if (currentBytes + addedBytes > MODEL_PREVIEW_MAX_TOTAL_BYTES) throw new Error('등록 모델 저장 공간은 160MB를 초과할 수 없습니다.');
    if (accepted.length) await transactionRequest('readwrite', (store) => { for (const item of accepted) store.put({ ...item.metadata, blob: item.blob }); });
    if (accepted.length) broadcastChange('import');
    return Object.freeze({ imported: accepted.length, skipped });
  });
}
