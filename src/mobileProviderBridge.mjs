const OPAQUE_ID = /^[a-z0-9][a-z0-9_-]{7,127}$/i;
const SOURCE_VIEWS = new Set(['front', 'side', 'back', 'crown', 'nape', 'detail']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FORBIDDEN_KEYS = /^(?:api[-_]?key|authorization|token|cookie|headers?|url|baseurl|path|command|auth(?:file)?)$/i;

function plugin() {
  return globalThis.Capacitor?.Plugins?.HairloomProvider ?? null;
}

function unavailableError() {
  const error = new Error('Hairloom 모바일 앱에서 이미지 생성 연결을 설정해주세요.');
  error.code = 'native-provider-unavailable';
  return error;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function exactKeys(value, allowed, label) {
  plainObject(value, label);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.test(key) || !allowed.has(key)) throw new TypeError(`Unexpected ${label} field: ${key}`);
  }
  return value;
}
function safeSerializable(value, label = 'context', depth = 0) {
  if (depth > 6) throw new TypeError(`${label} is too deeply nested`);
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains an invalid number`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 4000) throw new TypeError(`${label} contains an oversized string`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new TypeError(`${label} contains an oversized array`);
    return value.map((item, index) => safeSerializable(item, `${label}[${index}]`, depth + 1));
  }
  plainObject(value, label);
  const entries = Object.entries(value);
  if (entries.length > 64) throw new TypeError(`${label} contains too many fields`);
  return Object.fromEntries(entries.map(([key, item]) => {
    if (FORBIDDEN_KEYS.test(key)) throw new TypeError(`Unexpected ${label} field: ${key}`);
    return [key, safeSerializable(item, `${label}.${key}`, depth + 1)];
  }));
}


function opaqueId(value, label) {
  const id = String(value ?? '');
  if (!OPAQUE_ID.test(id)) throw new TypeError(`${label} must be an opaque id`);
  return id;
}

function typedOpaqueId(value, label, prefix) {
  const id = opaqueId(value, label);
  if (!id.startsWith(`${prefix}_`)) throw new TypeError(`${label} must be a ${prefix} opaque id`);
  return id;
}

function sourceHash(value) {
  const hash = String(value ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('sourceHash must be SHA-256');
  return hash;
}

function sourcePayload(raw) {
  const value = exactKeys(raw, new Set(['viewKey', 'sourceHash', 'mimeType', 'base64']), 'source');
  const viewKey = String(value.viewKey ?? '');
  const mimeType = String(value.mimeType ?? '').toLowerCase();
  const base64 = String(value.base64 ?? '');
  if (!SOURCE_VIEWS.has(viewKey)) throw new TypeError('Unsupported source view');
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new TypeError('Unsupported source MIME type');
  if (!/^[a-z0-9+/=\r\n]+$/i.test(base64) || base64.length < 32) throw new TypeError('Source image must be base64');
  return { viewKey, sourceHash: sourceHash(value.sourceHash), mimeType, base64 };
}

function analysisPayload(raw) {
  const value = exactKeys(raw, new Set(['sourceId', 'sourceHash', 'freePrompt']), 'analysis');
  const freePrompt = String(value.freePrompt ?? '').trim();
  if (freePrompt.length > 500) throw new TypeError('Analysis prompt is too long');
  return {
    sourceId: typedOpaqueId(value.sourceId, 'sourceId', 'source'),
    sourceHash: sourceHash(value.sourceHash),
    freePrompt
  };
}

function slotPayload(raw) {
  const value = exactKeys(raw, new Set([
    'slotIndex', 'designId', 'generation', 'sourceId', 'sourceHash', 'sourceViewKey', 'mirrored', 'prompt'
  ]), 'slot');
  const slotIndex = Number(value.slotIndex);
  const generation = Number(value.generation);
  const designId = String(value.designId ?? '');
  const sourceViewKey = String(value.sourceViewKey ?? '');
  const prompt = String(value.prompt ?? '');
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 100) throw new TypeError('slotIndex must be 0-99');
  if (!Number.isInteger(generation) || generation < 1) throw new TypeError('generation must be positive');
  if (!/^HLM-[A-Z0-9-]+$/.test(designId)) throw new TypeError('Invalid designId');
  if (!SOURCE_VIEWS.has(sourceViewKey)) throw new TypeError('Unsupported source view');
  if (!prompt || prompt.length > 24000) throw new TypeError('Invalid generation prompt');
  return {
    slotIndex,
    designId,
    generation,
    sourceId: typedOpaqueId(value.sourceId, 'sourceId', 'source'),
    sourceHash: sourceHash(value.sourceHash),
    sourceViewKey,
    mirrored: Boolean(value.mirrored),
    prompt
  };
}

function batchPayload(raw) {
  const value = exactKeys(raw, new Set(['batchId', 'sourcePhotoKey', 'slots', 'context']), 'batch');
  const slots = Array.isArray(value.slots) ? value.slots.map(slotPayload) : [];
  if (slots.length !== 100) throw new TypeError('Hairloom batches require exactly 100 slots');
  if (new Set(slots.map((item) => item.slotIndex)).size !== 100) throw new TypeError('Batch slot indexes must be unique');
  return {
    batchId: opaqueId(value.batchId, 'batchId'),
    sourcePhotoKey: opaqueId(value.sourcePhotoKey, 'sourcePhotoKey'),
    context: safeSerializable(value.context ?? {}, 'context'),
    slots
  };
}

async function invoke(method, payload) {
  const target = plugin();
  if (!target || typeof target[method] !== 'function') throw unavailableError();
  return target[method](payload);
}

export function nativeProviderAvailable() {
  return Boolean(plugin());
}

export async function providerStatus() {
  if (!plugin()) return Object.freeze({ available: false, configured: false, provider: 'native-required', model: '' });
  const result = await invoke('status');
  return Object.freeze({
    available: result?.available !== false,
    configured: Boolean(result?.configured),
    provider: String(result?.provider ?? 'OpenAI Image API'),
    model: String(result?.model ?? 'gpt-image-2')
  });
}

export async function configureProvider() {
  return invoke('configure');
}

export async function clearProvider() {
  return invoke('clear');
}

export async function createPreparedSource(raw) {
  return invoke('createSource', sourcePayload(raw));
}

export async function deletePreparedSource(sourceId) {
  return invoke('deleteSource', { sourceId: typedOpaqueId(sourceId, 'sourceId', 'source') });
}
export async function readPreparedSource(sourceId) {
  return invoke('readSource', { sourceId: typedOpaqueId(sourceId, 'sourceId', 'source') });
}

export async function runNativeAnalysis(raw) {
  return invoke('runAnalysis', analysisPayload(raw));
}


export async function createNativeBatch(raw) {
  // TODO(subscription-provider): add only after an official supported mobile subscription contract passes a separate compatibility and security review.
  return invoke('createBatch', batchPayload(raw));
}

export async function nativeBatchStatus(batchId) {
  return invoke('batchStatus', { batchId: opaqueId(batchId, 'batchId') });
}

export async function cancelNativeBatch(batchId) {
  return invoke('cancelBatch', { batchId: opaqueId(batchId, 'batchId') });
}

export async function readNativeOutput(outputId) {
  return invoke('readOutput', { outputId: typedOpaqueId(outputId, 'outputId', 'output') });
}

export async function deleteAllCustomerData() {
  return invoke('deleteCustomerData');
}

export async function onNativeBatchEvent(listener) {
  if (typeof listener !== 'function') throw new TypeError('Batch listener must be a function');
  const target = plugin();
  if (!target || typeof target.addListener !== 'function') return { remove: async () => {} };
  return target.addListener('batchEvent', (event) => listener(Object.freeze({ ...event })));
}
