export const MODEL_PREVIEW_SCHEMA_VERSION = 1;
export const MODEL_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
export const MODEL_PREVIEW_MAX_RECORDS = 80;
export const MODEL_PREVIEW_MAX_TOTAL_BYTES = 160 * 1024 * 1024;
export const MODEL_PREVIEW_LENGTH_IDS = Object.freeze(['US', 'S', 'MD', 'L', 'XL']);
export const MODEL_PREVIEW_RIGHTS = Object.freeze(['salon-owned', 'model-consented', 'licensed-stock', 'public-domain']);

const DB_NAME = 'hairloom-model-previews';
const DB_VERSION = 1;
const STORE_NAME = 'previews';
const genders = new Set(['U', 'F', 'M']);
const lengths = new Set(MODEL_PREVIEW_LENGTH_IDS);
const rights = new Set(MODEL_PREVIEW_RIGHTS);
const sourceKinds = new Set(['salon', 'web']);
const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedMetadataKeys = new Set([
  'id', 'schemaVersion', 'title', 'genderId', 'lengthIds', 'textureBuckets',
  'sourceKind', 'rightsBasis', 'attribution', 'sourceUrl', 'consentConfirmed',
  'imageMime', 'imageBytes', 'createdAt', 'displayOnly', 'enabled'
]);

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

export function createModelPreviewId(seed = '') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `HLM-MP-${stableHash32(`${seed}:${random}`).toString(16).padStart(8, '0').toUpperCase()}`;
}

export function normalizeModelPreviewMetadata(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Model preview metadata must be an object');
  for (const key of Object.keys(raw)) if (!allowedMetadataKeys.has(key)) throw new TypeError(`Unknown model preview field: ${key}`);
  const id = String(raw.id ?? '').trim();
  if (!/^HLM-MP-[A-F0-9]{8}$/.test(id)) throw new TypeError('Model preview id must use HLM-MP-XXXXXXXX');
  const schemaVersion = Number(raw.schemaVersion ?? MODEL_PREVIEW_SCHEMA_VERSION);
  if (schemaVersion !== MODEL_PREVIEW_SCHEMA_VERSION) throw new TypeError('Model preview schema version mismatch');
  const title = normalizedString(raw.title, 'Model preview title', 80);
  const genderId = String(raw.genderId ?? 'U').toUpperCase();
  if (!genders.has(genderId)) throw new TypeError('Model preview genderId must be U, F, or M');
  const lengthIds = [...new Set(Array.isArray(raw.lengthIds) ? raw.lengthIds.map(String) : [])].sort();
  if (lengthIds.some((value) => !lengths.has(value))) throw new TypeError('Model preview lengthIds contain an unsupported value');
  const textureBuckets = [...new Set(Array.isArray(raw.textureBuckets) ? raw.textureBuckets.map(Number) : [])].sort((a, b) => a - b);
  if (textureBuckets.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) throw new TypeError('Model preview textureBuckets must contain integers from 0 to 3');
  const sourceKind = String(raw.sourceKind ?? 'salon');
  if (!sourceKinds.has(sourceKind)) throw new TypeError('Model preview sourceKind must be salon or web');
  const rightsBasis = String(raw.rightsBasis ?? '');
  if (!rights.has(rightsBasis)) throw new TypeError('Model preview rightsBasis is unsupported');
  const attribution = normalizedString(raw.attribution, 'Model preview attribution', 160);
  const sourceUrl = normalizedSourceUrl(raw.sourceUrl, sourceKind === 'web');
  if (raw.consentConfirmed !== true) throw new TypeError('Model preview rights and model consent must be confirmed');
  const imageMime = String(raw.imageMime ?? '').toLowerCase();
  if (!imageMimes.has(imageMime)) throw new TypeError('Model preview image must be JPEG, PNG, or WebP');
  const imageBytes = Number(raw.imageBytes);
  if (!Number.isInteger(imageBytes) || imageBytes < 1 || imageBytes > MODEL_PREVIEW_MAX_BYTES) throw new TypeError(`Model preview image must be 1-${MODEL_PREVIEW_MAX_BYTES} bytes`);
  const createdAt = new Date(raw.createdAt ?? Date.now());
  if (!Number.isFinite(createdAt.getTime())) throw new TypeError('Model preview createdAt is invalid');
  if (raw.displayOnly === false) throw new TypeError('Model previews are display-only');
  return Object.freeze({
    id,
    schemaVersion,
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
    createdAt: createdAt.toISOString(),
    displayOnly: true,
    enabled: raw.enabled !== false
  });
}

export function modelPreviewDescriptor(record = {}) {
  const vector = record.vector ?? {};
  const genderId = record.genderId ?? (vector.gender === 1 ? 'F' : vector.gender === 2 ? 'M' : 'U');
  const lengthId = record.lengthId ?? MODEL_PREVIEW_LENGTH_IDS[Number(vector.length)] ?? '';
  const textureBucket = Number.isInteger(vector.textureBucket) ? vector.textureBucket : null;
  return { id: String(record.id ?? ''), genderId, lengthId, textureBucket };
}

export function modelPreviewMatchScore(preview, record) {
  if (!preview?.enabled) return Number.NEGATIVE_INFINITY;
  const descriptor = modelPreviewDescriptor(record);
  if (preview.genderId !== 'U' && descriptor.genderId !== preview.genderId) return Number.NEGATIVE_INFINITY;
  if (preview.lengthIds.length && !preview.lengthIds.includes(descriptor.lengthId)) return Number.NEGATIVE_INFINITY;
  if (preview.textureBuckets.length && !preview.textureBuckets.includes(descriptor.textureBucket)) return Number.NEGATIVE_INFINITY;
  return (preview.genderId === descriptor.genderId ? 8 : 0)
    + (preview.lengthIds.includes(descriptor.lengthId) ? 6 : 0)
    + (preview.textureBuckets.includes(descriptor.textureBucket) ? 4 : 0)
    + preview.lengthIds.length
    + preview.textureBuckets.length;
}

export function selectModelPreview(previews, record, slotIndex = 0) {
  const candidates = (Array.isArray(previews) ? previews : [])
    .map((preview) => ({ preview, score: modelPreviewMatchScore(preview, record) }))
    .filter((entry) => Number.isFinite(entry.score));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score
    || stableHash32(`${record?.id}:${slotIndex}:${a.preview.id}`) - stableHash32(`${record?.id}:${slotIndex}:${b.preview.id}`)
    || a.preview.id.localeCompare(b.preview.id));
  return candidates[0].preview;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Model preview database failed to open'));
  });
}

function transactionRequest(mode, execute) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try {
      request = execute(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => { database.close(); resolve(request?.result); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Model preview database transaction failed')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Model preview database transaction aborted')); };
  }));
}

export async function saveModelPreview(raw, blob) {
  if (!(blob instanceof Blob)) throw new TypeError('Model preview image Blob is required');
  const metadata = normalizeModelPreviewMetadata({
    ...raw,
    id: raw?.id || createModelPreviewId(`${raw?.title}:${blob.size}`),
    imageMime: blob.type,
    imageBytes: blob.size,
    createdAt: raw?.createdAt || new Date().toISOString(),
    displayOnly: true
  });
  const rows = await transactionRequest('readonly', (store) => store.getAll());
  const stored = Array.isArray(rows) ? rows : [];
  const existing = stored.find((row) => row.id === metadata.id);
  if (!existing && stored.length >= MODEL_PREVIEW_MAX_RECORDS) throw new Error(`등록 모델은 최대 ${MODEL_PREVIEW_MAX_RECORDS}장까지 저장할 수 있습니다.`);
  const totalBytes = stored.reduce((sum, row) => sum + Number(row.imageBytes || 0), 0) - Number(existing?.imageBytes || 0) + blob.size;
  if (totalBytes > MODEL_PREVIEW_MAX_TOTAL_BYTES) throw new Error('등록 모델 저장 공간은 160MB를 초과할 수 없습니다.');
  await transactionRequest('readwrite', (store) => store.put({ ...metadata, blob }));
  return metadata;
}

export async function listModelPreviews() {
  const rows = await transactionRequest('readonly', (store) => store.getAll());
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const { blob, ...metadata } = row;
    return { ...normalizeModelPreviewMetadata(metadata), blob };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function deleteModelPreview(id) {
  const value = String(id ?? '');
  if (!/^HLM-MP-[A-F0-9]{8}$/.test(value)) throw new TypeError('Invalid model preview id');
  await transactionRequest('readwrite', (store) => store.delete(value));
}
