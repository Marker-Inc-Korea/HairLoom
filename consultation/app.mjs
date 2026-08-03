import { catalogVersion, promptVersion, hydrateCatalogPayload, normalizeProviderResult, normalizeSettings, sourcePhotoKey, genderLineTreatmentPrompt } from '../src/exploreCore.mjs';
import { trendBadgeForCandidate } from '../src/trendRegistry.mjs';
let ModelPreviewRegistry = null;
let modelPreviewDisposed = false;
let modelPreviewUnsubscribe = () => {};
const modelPreviewRegistryReady = import('../src/modelPreviewRegistry.mjs').then((registry) => (ModelPreviewRegistry = registry)).catch(() => null);
import {
  CONSULTATION_HANDOFF_STORAGE_KEY,
  CONSULTATION_HANDOFF_QUERY_TRIGGER,
  CONSULTATION_INITIAL_ACTIVE,
  CONSULTATION_HARD_MAX_ACTIVE,
  CONSULTATION_GENERATION_AXES_VERSION,
  CONSULTATION_SOURCE_TRANSFORM_VERSION,
  HAIR_COLOR_TONES,
  PRESERVE_CURRENT_TONE_ID,
  normalizeDiagnosis,
  normalizeHairColorProfile,
  deriveAllowedHairColorTones,
  classifyHairColorSamples,
  canonicalStructureKey,
  buildConsultationGroups,
  expandConsultationGroup,
  evaluateVariation,
  summarizeGroupFeasibility,
  selectConsultationStructureDesignIds,
  rankConsultationVariations,
  selectConsultationDesignIds,
  assignConsultationGenerationAxes,
  createConsultationBatch,
  assignConsultationSourceViews,
  startConsultationQueuedItems,
  applyConsultationCompletion,
  supersedeConsultationBatch,
  buildConsultationHandoff
} from '../src/consultationCore.mjs';

const app = document.querySelector('#app');
const stages = ['SOURCE', 'PROFILE', 'STRUCTURE', 'VARIATION', 'COMPARE', 'LOCK'];
const state = {
  stage: 0,
  profileStep: 0,
  originalFile: null,
  originalDataUrl: '',
  originalJpegDataUrl: '',
  originalJpegBlob: null,
  sourceViews: { front: '', side: '', back: '', crown: '', nape: '', detail: '' },
  sourceViewBlobs: { front: null, side: null, back: null, crown: null, nape: null, detail: null },
  sourceViewIndex: 0,
  sourceProcessing: false,
  providerInputCache: new Map(),
  sourceKey: '',
  catalog: null,
  catalogPromise: null,
  records: [],
  recordsById: new Map(),
  groups: [],
  filteredGroups: [],
  groupSummaries: new Map(),
  variationPage: 0,
  groupsByKey: new Map(),
  structureSlots: [],
  structureActiveLimit: CONSULTATION_INITIAL_ACTIVE,
  modelPreviews: [],
  modelPreviewUrls: new Map(),
  structureStatus: '',
  structurePreparing: false,
  selectedGroup: null,
  variations: [],
  ranked: [],
  selectedVariation: null,
  diagnosis: {},
  hairColorProfile: normalizeHairColorProfile({}),
  hairColorDetection: { status: 'idle', source: 'none', toneId: 'unknown', confidence: 0 },
  settings: normalizeSettings({}),
  mood: '',
  batch: null,
  slots: [],
  activeLimit: CONSULTATION_INITIAL_ACTIVE,
  running: new Set(),
  controllers: new Map(),
  shortlist: new Set(),
  error: '',
  status: '',
  cfg: loadProviderConfig()
};

function h(strings, ...values) {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
}
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const statusKo = (status) => status === 'possible' ? 'OK' : status === 'conditional' ? 'CHECK' : status === 'impossible' ? 'NO' : status === 'done' ? 'DONE' : status === 'failed' ? 'FAIL' : status === 'active' ? 'RUN' : 'WAIT';
const statusClass = (s) => s === 'possible' ? 'ok' : s === 'conditional' ? 'conditional' : 'impossible';
const densityToThickness = { low: 'fine', normal: 'normal', high: 'thick' };
const damageMap = { low: 'low', medium: 'medium', high: 'high' };
let moodRankTimer = 0;
const STYLE_NAME_REPLACEMENTS = [
  ['턱선 블런트 보브', '태슬 단발'],
  ['그래듀에이티드 보브', 'A라인 단발'],
  ['샤기 보브', '허쉬 단발'],
  ['라운드 보브', '볼륨 단발'],
  ['애시메트릭 보브', '비대칭 단발'],
  ['프렌치 보브', '프렌치 단발'],
  ['미니 보브', '미니 단발'],
  ['이탈리안 보브', '이탈리안 단발'],
  ['보브', '단발']
];
function familiarStyleName(value) {
  return STYLE_NAME_REPLACEMENTS.reduce((name, [source, target]) => name.replaceAll(source, target), String(value ?? ''));
}
const DIAGNOSIS_DEFINITIONS = [
  { id: 'naturalTexture', label: 'TEXTURE', labels: ['STRAIGHT', 'WAVY', 'CURL', 'COIL'], values: ['내추럴 스트레이트', '내추럴 웨이브', '내추럴 컬', '내추럴 코일'], defaultIndex: 0 },
  { id: 'density', label: 'DENSITY', labels: ['LOW', 'MEDIUM', 'HIGH'], values: ['low', 'normal', 'high'], defaultIndex: 1 },
  { id: 'damage', label: 'DAMAGE', labels: ['LOW', 'MEDIUM', 'HIGH'], values: ['low', 'medium', 'high'], defaultIndex: 1 },
  { id: 'bleachCount', label: 'BLEACH', labels: ['NONE', 'ONCE', 'TWICE', '3+'], values: [0, 1, 2, 3], defaultIndex: 0 },
  { id: 'recentPerm', label: 'PERM', labels: ['NONE', '< 3M', '3–6M', '6M+'], values: [999, 1, 4, 6], defaultIndex: 0 },
  { id: 'extensionAllowed', label: 'EXTENSION', labels: ['NO', 'YES'], values: [false, true], defaultIndex: 0 }
];
const BOARD_VIEWS = [
  { id: 'front', label: 'FRONT' },
  { id: 'side', label: 'SIDE' },
  { id: 'back', label: 'BACK' },
  { id: 'crown', label: 'CROWN' },
  { id: 'nape', label: 'NAPE' },
  { id: 'detail', label: 'DETAIL' }
];
const LENGTH_OPTIONS = [
  { label: '짧은 머리', actualLengthCm: 10, currentLength: 1 },
  { label: '중간', actualLengthCm: 20, currentLength: 2 },
  { label: '장발', actualLengthCm: 60, currentLength: 4 }
];

function requiredSourceViewsReady() {
  return Boolean(state.originalJpegDataUrl);
}

function stageEnabled(index) {
  return index === 0
    || (index === 1 && requiredSourceViewsReady())
    || (index === 2 && state.structureSlots.length > 0)
    || (index === 3 && Boolean(state.selectedGroup))
    || (index === 4 && state.batch?.metadata?.purpose === 'compare')
    || (index === 5 && state.shortlist.size > 0);
}

function currentStageLabel() {
  if (state.stage === 1) return state.profileStep === 0 ? 'PROFILE 1/2' : 'COLOR 2/2';
  return stages[state.stage];
}

function render() {
  const currentContent = app.querySelector('.content');
  const preserveScroll = currentContent?.dataset.stage === String(state.stage);
  const scrollTop = preserveScroll ? currentContent.scrollTop : 0;
  const step = state.stage + 1;
  const stageMarkup = [renderSource, renderProfile, renderStructure, renderVariations, renderCompare, renderAgreement][state.stage]();
  app.innerHTML = h`<div class="workspace">
    <aside class="rail">
      <button class="brand" id="backToList" type="button" aria-label="Back to structure list">H</button>
      <nav class="stages" aria-label="Progress">${stages.map((label, index) => `<button class="stage" aria-label="${label}" aria-current="${state.stage === index}" data-stage="${index}" ${stageEnabled(index) ? '' : 'disabled'}><i></i></button>`).join('')}</nav>
      <div class="rail-count"><b>${String(step).padStart(2, '0')}</b><span>/ 06</span></div>
    </aside>
    <main class="content" data-stage="${state.stage}">
      <header class="content-head"><b>HAIRLOOM PRO</b><span>${String(step).padStart(2, '0')} / 06 · ${currentStageLabel()}</span></header>
      ${state.error ? `<div class="status-banner error" role="alert">${esc(state.error)}</div>` : currentStageStatus() ? `<div class="status-banner" role="status">${esc(currentStageStatus())}</div>` : ''}
      ${stageMarkup}
    </main>
  </div>`;
  bind();
  const nextContent = app.querySelector('.content');
  if (preserveScroll && nextContent) {
    nextContent.scrollTop = scrollTop;
    requestAnimationFrame(() => { if (nextContent.isConnected) nextContent.scrollTop = scrollTop; });
  }
}

function diagnosisValue(definition) {
  if (definition.id === 'recentPerm') {
    const months = state.diagnosis.monthsSincePerm ?? 999;
    return months < 3 ? 1 : months < 6 ? 4 : months < 999 ? 6 : 999;
  }
  if (definition.id === 'extensionAllowed') return Boolean(state.diagnosis.extensionAllowed);
  return state.diagnosis[definition.id] ?? definition.values[definition.defaultIndex];
}

function rangeSetting(definition) {
  const current = diagnosisValue(definition);
  const index = Math.max(0, definition.values.findIndex((value) => value === current));
  const max = definition.values.length - 1;
  const percent = max ? index / max * 100 : 0;
  return `<section class="setting"><div class="setting-head"><label for="${definition.id}">${definition.label}</label><output id="${definition.id}Value">${definition.labels[index]}</output></div><div class="range-shell"><input class="dot-range" id="${definition.id}" data-setting="${definition.id}" type="range" min="0" max="${max}" step="1" value="${index}" style="--p:${percent}%"><div class="range-dots" aria-hidden="true">${definition.labels.map((_, dot) => `<i class="${dot <= index ? 'on' : ''}"></i>`).join('')}</div></div><div class="ends"><span>${definition.labels[0]}</span><span>${definition.labels[max]}</span></div></section>`;
}

function currentLengthOptionIndex() {
  const setting = Number(state.settings.currentLength);
  const bySetting = LENGTH_OPTIONS.findIndex((option) => option.currentLength === setting);
  if (bySetting >= 0) return bySetting;
  const cm = Number(state.diagnosis.actualLengthCm ?? 10);
  return LENGTH_OPTIONS.reduce((best, option, index) => Math.abs(option.actualLengthCm - cm) < Math.abs(LENGTH_OPTIONS[best].actualLengthCm - cm) ? index : best, 0);
}

function currentLengthSetting() {
  const index = currentLengthOptionIndex();
  const max = LENGTH_OPTIONS.length - 1;
  const percent = index / max * 100;
  return `<section class="setting"><div class="setting-head"><label for="currentLength">LENGTH</label><output id="currentLengthValue">${LENGTH_OPTIONS[index].label}</output></div><div class="range-shell"><input class="dot-range" id="currentLength" type="range" min="0" max="${max}" step="1" value="${index}" style="--p:${percent}%"><div class="range-dots length-dots" aria-hidden="true">${LENGTH_OPTIONS.map((_, dot) => `<i class="${dot <= index ? 'on' : ''}"></i>`).join('')}</div></div><div class="ends"><span>${LENGTH_OPTIONS[0].label}</span><span>${LENGTH_OPTIONS[max].label}</span></div></section>`;
}

function sourceViewSource(view) {
  return view.id === 'front' ? state.originalDataUrl : state.sourceViews[view.id];
}

function sourceViewComplete(view) {
  return Boolean(view.id === 'front' ? state.originalJpegDataUrl : state.sourceViews[view.id]);
}

function availableSourceViewKeys() {
  return BOARD_VIEWS.map((view) => view.id).filter((key) => state.sourceViewBlobs[key] instanceof Blob);
}

function sourceViewPreview(key = 'front') {
  return state.sourceViews[key] || state.originalJpegDataUrl || state.originalDataUrl;
}

function releaseModelPreviewUrls() {
  for (const url of state.modelPreviewUrls.values()) URL.revokeObjectURL(url);
  state.modelPreviewUrls.clear();
}

async function refreshModelPreviews() {
  releaseModelPreviewUrls();
  try {
    const registry = await modelPreviewRegistryReady;
    if (!registry) { state.modelPreviews = []; return false; }
    state.modelPreviews = await registry.listModelPreviews();
    return true;
  } catch {
    state.modelPreviews = [];
    return false;
  }
}

function registeredModelPreview(slot, record) {
  if (!record || !ModelPreviewRegistry?.modelPreviewAllowedForSlot(slot.status) || !state.modelPreviews.length) return null;
  const preview = ModelPreviewRegistry.selectModelPreview(state.modelPreviews, record, slot.slotIndex);
  if (!preview?.blob) return null;
  if (!state.modelPreviewUrls.has(preview.id)) state.modelPreviewUrls.set(preview.id, URL.createObjectURL(preview.blob));
  return { ...preview, url: state.modelPreviewUrls.get(preview.id) };
}

function assignBatchSourceViews(batch, purpose) {
  return assignConsultationSourceViews(batch, availableSourceViewKeys(), `${state.sourceKey}:${purpose}`);
}

function renderSource() {
  const gender = state.diagnosis.profileGender ?? 'F';
  const view = BOARD_VIEWS[state.sourceViewIndex] ?? BOARD_VIEWS[0];
  const source = sourceViewSource(view);
  const required = state.originalJpegDataUrl ? 1 : 0;
  const processing = state.sourceProcessing && view.id === 'front';
  const uploadContent = source ? `<img src="${esc(source)}" alt="${view.label}">` : processing ? '<span class="source-processing-mark">···</span><small>ANALYZING PHOTO</small>' : `<span>＋</span><small>ADD ${view.label}</small>`;
  const continueLabel = state.sourceProcessing ? '사진과 현재 컬러를 분석하고 있습니다.' : required ? 'FRONT 준비 완료' : 'FRONT 사진을 먼저 추가하세요.';
  return `<section class="source-step single-source"><div class="source-view-head"><b>VIEWS</b><span>${required} / 1 REQUIRED</span></div><div class="source-view-stage"><div class="source-view-title"><span>${String(state.sourceViewIndex + 1).padStart(2, '0')} / 06</span><b>${view.label}</b><small>${state.sourceViewIndex === 0 ? 'REQUIRED' : 'OPTIONAL'}</small></div><button class="single-view-upload ${source ? 'filled' : ''}" type="button" data-upload-view="${view.id}" aria-label="${source ? 'Replace' : 'Add'} ${view.label} photo" ${state.sourceProcessing ? 'disabled' : ''}>${uploadContent}</button><input id="view-${view.id}" data-view="${view.id}" type="file" accept="image/*" aria-label="${view.label}"><div class="source-view-nav"><button type="button" data-source-step="-1" aria-label="Previous view">←</button><nav class="source-view-dots" aria-label="Source views">${BOARD_VIEWS.map((item, index) => `<button type="button" data-source-view="${index}" class="${index === state.sourceViewIndex ? 'on' : ''} ${sourceViewComplete(item) ? 'done' : ''}" aria-label="${item.label}"><i></i></button>`).join('')}</nav><button type="button" data-source-step="1" aria-label="Next view">→</button></div></div><div class="source-footer"><div class="profile-switch" aria-label="Profile"><button data-gender="F" class="${gender === 'F' ? 'on' : ''}">FEMALE</button><button data-gender="M" class="${gender === 'M' ? 'on' : ''}">MALE</button></div><div class="source-next"><small id="sourceContinueStatus">${continueLabel}</small><button class="next-button" id="toProfile" data-ready="${requiredSourceViewsReady() ? 'true' : 'false'}" aria-describedby="sourceContinueStatus" ${state.sourceProcessing ? 'disabled aria-busy="true"' : ''}>${state.sourceProcessing ? 'PROCESSING…' : 'NEXT'}</button></div></div></section>`;
}

function toneLabel(toneId) {
  if (toneId === PRESERVE_CURRENT_TONE_ID) return '현재 색상 유지';
  return HAIR_COLOR_TONES.find((tone) => tone.id === toneId)?.labelKo || toneId || '미선택';
}

function selectedTargetToneIds() {
  const current = state.hairColorProfile.currentToneId;
  return [...new Set(state.hairColorProfile.selectedToneIds.map((toneId) => toneId === PRESERVE_CURRENT_TONE_ID ? current : toneId).filter((toneId) => toneId && toneId !== 'unknown'))];
}

function currentColorDetectionLabel() {
  const detection = state.hairColorDetection;
  if (detection.status === 'detecting') return 'AUTO ANALYZING';
  if (detection.source === 'auto' && detection.status === 'done') return `AUTO ${Math.round(detection.confidence * 100)}%`;
  if (detection.source === 'manual') return 'MANUAL';
  return 'AUTO FAILED';
}

function renderDiagnosisProfile() {
  return `<section class="profile-step"><div class="profile-page-head"><b>PROFILE</b><span>1 / 2</span></div>
    <div class="settings-grid">${currentLengthSetting()}${DIAGNOSIS_DEFINITIONS.map(rangeSetting).join('')}</div>
    <label class="mood-field" for="mood"><span>MOOD</span><textarea id="mood" placeholder="SOFT · CLEAN">${esc(state.mood)}</textarea></label>
    <a class="model-preview-link" href="/model-previews/" target="_blank" rel="noopener">대기 모델 이미지 관리 ↗</a>
    <details class="provider"><summary>API</summary><div class="cfg"><input id="baseURL" aria-label="API URL" placeholder="API URL" value="${esc(state.cfg.baseURL)}"><input id="model" aria-label="Model" placeholder="MODEL" value="${esc(state.cfg.model)}"><input id="size" aria-label="Size" placeholder="SIZE" value="${esc(state.cfg.size)}"><input id="apiKey" aria-label="API key" placeholder="API KEY" type="password" value="${esc(state.cfg.apiKey)}"></div></details>
    <div class="actions"><button class="next-button" id="toColor">NEXT</button></div>
  </section>`;
}

function renderColorProfile() {
  const profile = state.hairColorProfile;
  const allowed = deriveAllowedHairColorTones(profile, state.diagnosis);
  const selected = new Set(selectedTargetToneIds());
  const canContinue = profile.currentToneId !== 'unknown';
  const emptyMessage = state.hairColorDetection.status === 'detecting' ? '원본 사진에서 현재 머리색을 분석 중입니다.' : '자동 감지 실패 · 현재 머리색을 직접 선택하세요.';
  const continueMessage = state.structurePreparing ? '100개 구조 후보를 준비하고 있습니다. 잠시만 기다려 주세요.' : profile.currentToneId === 'unknown' ? '현재 머리색을 선택해야 다음 단계로 갈 수 있습니다.' : '준비 완료 · NEXT를 누르면 STRUCTURE 단계가 시작됩니다.';
  const continueStatus = state.structurePreparing ? 'busy' : canContinue ? 'ready' : 'blocked';
  return `<section class="profile-step color-step"><div class="profile-page-head"><b>COLOR</b><span>2 / 2</span></div><section class="color-section"><div class="color-section-head"><div><b>CURRENT</b><small>${currentColorDetectionLabel()} · 직접 수정 가능</small></div><span>${esc(toneLabel(profile.currentToneId))}</span></div><div class="tone-grid current-tones">${HAIR_COLOR_TONES.map((tone) => `<button type="button" data-current-tone="${tone.id}" class="tone-chip ${profile.currentToneId === tone.id ? 'on' : ''}"><i style="--tone-level:${tone.level}"></i><span>${esc(tone.labelKo)}</span></button>`).join('')}</div></section>${profile.currentToneId === 'unknown' ? `<div class="color-empty">${emptyMessage}</div>` : `<section class="color-section"><div class="color-section-head"><div><b>TARGET</b><small>복수 선택</small></div><span>${profile.intensity === 'balanced' ? 'BALANCED' : 'SUBTLE'}</span></div><div class="tone-grid target-tones">${allowed.map((tone) => `<button type="button" data-target-tone="${tone.id}" class="tone-chip ${selected.has(tone.id) ? 'on' : ''} ${tone.id === profile.currentToneId ? 'fixed' : ''}"><i style="--tone-level:${tone.level}"></i><span>${esc(tone.labelKo)}</span></button>`).join('')}</div><div class="intensity-switch"><button type="button" data-color-intensity="subtle" class="${profile.intensity === 'subtle' ? 'on' : ''}">SUBTLE</button><button type="button" data-color-intensity="balanced" class="${profile.intensity === 'balanced' ? 'on' : ''}">BALANCED</button></div></section><div class="color-empty maskless-notice">MASKLESS · 헤어 마스크 없이 원본 전체를 기준으로 생성합니다.</div>`}<div class="color-continue-note ${continueStatus}" id="colorContinueStatus" role="status">${continueMessage}</div><div class="actions profile-actions"><button class="secondary" id="backToDiagnosis">BACK</button><button class="next-button" id="toStructures" data-ready="${canContinue ? 'true' : 'false'}" aria-describedby="colorContinueStatus" ${state.structurePreparing ? 'disabled aria-busy="true"' : ''}>${state.structurePreparing ? 'PREPARING…' : 'NEXT'}</button></div></section>`;
}

function renderProfile() {
  return state.profileStep === 0 ? renderDiagnosisProfile() : renderColorProfile();
}

function currentStageStatus() {
  if (state.stage === 2) return state.structureStatus;
  if (state.stage === 4) return state.status;
  return '';
}

function renderStructure() {
  const slots = state.structureSlots.length ? state.structureSlots : Array.from({ length: 100 }, (_, slotIndex) => ({ slotIndex, status: 'queued' }));
  const done = slots.filter((slot) => slot.status === 'done').length;
  const failed = slots.filter((slot) => slot.status === 'failed').length;
  const running = state.batch?.metadata?.purpose === 'structure' ? state.running.size : 0;
  return panel('STRUCTURE', `<div class="toolbar"><div class="stats"><span class="pill">ALL 500</span><span class="pill">PROFILE ${state.filteredGroups.length}</span><span class="pill">100 PICKS</span><span class="pill">ACTIVE ${state.structureActiveLimit}</span><span class="pill">RUN ${running}</span><span class="pill ok">DONE ${done}</span><span class="pill impossible">FAIL ${failed}</span></div><button class="next-button" id="toVariations" ${state.selectedGroup ? '' : 'disabled'}>NEXT</button></div><div class="structure-board">${slots.map(structureTile).join('')}</div>`);
}

const STRUCTURE_TILE_RATIOS = [0.66, 0.82, 0.6, 0.74, 0.9, 0.69, 0.57, 0.78, 0.63, 0.86, 0.71, 0.55, 0.8, 0.65, 0.76];
function structureTileRatio(slotIndex) {
  return STRUCTURE_TILE_RATIOS[(Math.imul(Number(slotIndex) + 5, 11) + 7) % STRUCTURE_TILE_RATIOS.length];
}

function generationAxisLabel(slot) {
  const axes = slot.generationAxes || {};
  return [
    String(slot.sourceViewKey || axes.sourceViewKey || 'front').toUpperCase(),
    axes.mirrored ? 'MIRROR' : 'ORIGINAL',
    axes.colorToneId ? toneLabel(axes.colorToneId) : '',
    statusKo(slot.status)
  ].filter(Boolean).join(' · ');
}

function structureTile(slot) {
  const record = state.recordsById.get(slot.designId);
  const group = record ? state.groupsByKey.get(recordGroupKey(record)) : null;
  const preview = registeredModelPreview(slot, record);
  const source = slot.previewUrl || preview?.url || sourceViewPreview(slot.sourceViewKey);
  const selected = group && state.selectedGroup?.key === group.key;
  const ready = slot.status === 'done' && group;
  const trend = group ? trendBadgeForCandidate(group) : '';
  const previewState = slot.status === 'active' ? '생성 중' : '생성 대기';
  const previewLabel = preview ? `<span class="registered-model-label">등록 모델 · ${previewState}</span>` : '';
  const previewPosition = preview ? ` style="object-position:${preview.focalX * 100}% ${preview.focalY * 100}%"` : '';
  return `<button class="structure-tile ${slot.status} ${preview ? 'registered-preview' : ''} ${selected ? 'selected' : ''}" data-structure-slot="${slot.slotIndex}" style="--tile-ratio:${structureTileRatio(slot.slotIndex)}" ${ready ? '' : 'disabled'}><img src="${esc(source)}" alt="${preview ? esc(`${preview.title} · 등록 모델 미리보기 · ${previewState}`) : ready ? esc(groupLabel(group)) : ''}"${previewPosition}>${previewLabel}<span class="structure-meta"><b>${ready ? esc(groupLabel(group)) : String(slot.slotIndex + 1).padStart(2, '0')}</b><small>${trend ? `${esc(trend)} · ` : ''}${esc(generationAxisLabel(slot))}</small></span></button>`;
}

function groupLabel(group) { return `${group.lengthKo} · ${familiarStyleName(group.baseKo)} · ${group.frontKo}`; }
function groupStatus(sum) { return sum.impossible === sum.total ? 'impossible' : sum.possible > 0 ? 'possible' : 'conditional'; }
function recordGroupKey(record) { return canonicalStructureKey(record); }
function variationFromRecord(record) { return { id: record.id, designId: record.id, genderId: record.genderId, lengthId: record.lengthId, baseKo: record.baseKo, frontKo: record.frontKo, finishKo: record.finishKo, mood: '균형 있게', intensity: '균형 있게', finishRecord: record }; }
function rankFeasibleVariations(variations) {
  const order = { possible: 0, conditional: 1, impossible: 2 };
  return rankConsultationVariations(variations, state.mood).sort((a, b) => order[evaluateVariation(a, state.diagnosis).status] - order[evaluateVariation(b, state.diagnosis).status]);
}

function renderVariations() {
  const pageSize = 72;
  const totalPages = Math.max(1, Math.ceil(state.ranked.length / pageSize));
  const list = state.ranked.slice(state.variationPage * pageSize, (state.variationPage + 1) * pageSize);
  return panel('VARIATION', `<div class="toolbar"><div class="stats"><span class="pill">ALL ${state.variations.length}</span><span class="pill">SHOW ${list.length}</span></div><div><textarea id="mood2" placeholder="MOOD">${esc(state.mood)}</textarea><button id="prevVariation" class="secondary">←</button><span class="pill">${state.variationPage + 1}/${totalPages}</span><button id="nextVariation" class="secondary">→</button></div></div><div class="cards">${list.map(variationCard).join('')}</div><div class="actions"><button class="next-button" id="toCompare" ${state.selectedVariation ? '' : 'disabled'}>NEXT</button></div>`);
}
function variationCard(variation) {
  const evaluation = evaluateVariation(variation, state.diagnosis);
  const id = variation.designId || variation.id;
  return `<button class="card ${state.selectedVariation?.id === variation.id ? 'selected' : ''}" data-var="${esc(variation.id)}" ${evaluation.status === 'impossible' ? 'disabled' : ''}><h3>${esc(variation.finishKo)} · ${esc(variation.mood)} · ${esc(variation.intensity)}</h3><div class="metrics"><span class="metric ${statusClass(evaluation.status)}">${statusKo(evaluation.status)}</span><span class="metric">${esc(id)}</span><span class="metric">필요 ${evaluation.requiredPreTreatmentLengthCm}cm</span></div><div class="mini">${esc((evaluation.reasons || []).slice(0, 2).join(' · '))}</div></button>`;
}

function renderCompare() {
  const done = state.slots.filter((slot) => slot.status === 'done').length;
  const failed = state.slots.filter((slot) => slot.status === 'failed').length;
  return panel('COMPARE', `<div class="toolbar"><div class="stats"><span class="pill">${state.slots.length || 100} SLOTS</span><span class="pill">ACTIVE ${state.batch?.activeLimit ?? state.activeLimit}</span><span class="pill">RUN ${state.running.size}</span><span class="pill ok">DONE ${done}</span><span class="pill impossible">FAIL ${failed}</span></div><button class="next-button" id="toAgreement" ${state.shortlist.size ? '' : 'disabled'}>NEXT</button></div><div class="slots">${(state.slots.length ? state.slots : Array.from({ length: 100 }, (_, index) => ({ slotIndex: index, status: 'queued' }))).map(slotCard).join('')}</div>`);
}
function slotCard(slot) {
  const record = state.recordsById.get(slot.designId);
  const preview = registeredModelPreview(slot, record);
  const source = slot.previewUrl || preview?.url || sourceViewPreview(slot.sourceViewKey);
  const checked = state.shortlist.has(slot.designId) ? 'checked' : '';
  const previewState = slot.status === 'active' ? '생성 중' : '생성 대기';
  const previewLabel = preview ? `<span class="registered-model-label">등록 모델 · ${previewState}</span>` : '';
  const previewPosition = preview ? ` style="object-position:${preview.focalX * 100}% ${preview.focalY * 100}%"` : '';
  return `<div class="slot ${slot.status} ${preview ? 'registered-preview' : ''}" data-slot="${slot.slotIndex}"><div class="image"><img src="${esc(source)}" alt="${preview ? esc(`${preview.title} · 등록 모델 미리보기 · ${previewState}`) : slot.status === 'done' ? esc(slot.designId) : ''}"${previewPosition}></div>${previewLabel}<input type="checkbox" aria-label="후보 선택 ${slot.slotIndex + 1}" data-short="${esc(slot.designId || '')}" ${checked} ${slot.status === 'done' ? '' : 'disabled'}><div class="meta">${String(slot.slotIndex + 1).padStart(2, '0')} · ${esc(generationAxisLabel(slot))} · ${esc(slot.designId || '대기')}</div></div>`;
}

function renderAgreement() {
  const ids = [...state.shortlist].slice(0, 6);
  const exportPayload = agreementPayload(false);
  return panel('LOCK', `<div class="stats"><span class="pill">SELECT ${ids.length}/6</span><span class="pill">NO IMAGE EXPORT</span></div><div class="shortlist">${ids.map(shortCard).join('')}</div><pre class="notice">${esc(JSON.stringify(exportPayload, null, 2))}</pre><div class="actions"><button id="print">PRINT</button><button id="downloadJson" class="secondary">JSON</button><button id="handoff">DESIGN LOCK</button></div>`);
}
function shortCard(id) {
  const record = state.records.find((item) => item.id === id);
  const evaluation = !record
    ? { status: 'possible', reasons: [] }
    : record.kind === 'special'
      ? { status: 'conditional', reasons: ['특수 구조 시술 가능성 확인 필요'] }
      : evaluateVariation(variationFromRecord(record), state.diagnosis);
  return `<article class="card"><h3>${esc(id)}</h3><div class="metrics"><span class="metric ${statusClass(evaluation.status)}">${statusKo(evaluation.status)}</span><span class="metric">${esc(record?.nameKo || '')}</span></div><div class="mini">${esc((evaluation.reasons || ['선택']).slice(0, 2).join(' · '))}</div></article>`;
}
function panel(title, body) { return `<section class="panel"><h2>${title}</h2>${body}</section>`; }
function restoreTextFocus(id, selectionStart, selectionEnd = selectionStart) {
  requestAnimationFrame(() => {
    const input = document.querySelector(`#${id}`);
    if (!input) return;
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
  });
}

function replaceHairColorProfile(patch = {}) {
  state.hairColorProfile = normalizeHairColorProfile({ ...state.hairColorProfile, ...patch });
}

function reconcileHairColorProfile() {
  const profile = state.hairColorProfile;
  if (profile.currentToneId === 'unknown') {
    replaceHairColorProfile({ selectedToneIds: [PRESERVE_CURRENT_TONE_ID] });
    return;
  }
  const allowed = new Set(deriveAllowedHairColorTones(profile, state.diagnosis).map((tone) => tone.id));
  const selected = selectedTargetToneIds().filter((toneId) => allowed.has(toneId) && toneId !== profile.currentToneId);
  replaceHairColorProfile({ selectedToneIds: [profile.currentToneId, ...selected] });
}

function clearProviderInputCache(viewKey = '') {
  for (const key of state.providerInputCache.keys()) if (!viewKey || key.startsWith(`${viewKey}:`)) state.providerInputCache.delete(key);
}

function setCurrentTone(toneId) {
  if (!HAIR_COLOR_TONES.some((tone) => tone.id === toneId)) return;
  replaceHairColorProfile({ currentToneId: toneId, selectedToneIds: [toneId] });
  state.hairColorDetection = { status: 'done', source: 'manual', toneId, confidence: 1 };
  reconcileHairColorProfile();
  invalidateGeneratedSurfaces('color-change');
  render();
}

function toggleTargetTone(toneId) {
  const current = state.hairColorProfile.currentToneId;
  if (toneId === current) return;
  const selected = new Set(selectedTargetToneIds());
  if (selected.has(toneId)) selected.delete(toneId); else selected.add(toneId);
  replaceHairColorProfile({ selectedToneIds: [current, ...selected] });
  invalidateGeneratedSurfaces('color-change');
  render();
}

function goToProfile() {
  if (state.sourceProcessing) return;
  if (!requiredSourceViewsReady()) {
    state.error = 'FRONT REQUIRED · FRONT 사진을 먼저 추가하세요.';
    render();
    return;
  }
  state.error = '';
  state.profileStep = 0;
  state.stage = 1;
  render();
}

function handleNextAction(event) {
  const button = event.target.closest('button');
  if (!button || !app.contains(button) || !['toProfile', 'toColor', 'toStructures', 'toVariations', 'toCompare', 'toAgreement'].includes(button.id)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (button.disabled) return;
  if (button.id === 'toProfile') goToProfile();
  else if (button.id === 'toColor') { syncIntake(); reconcileHairColorProfile(); state.profileStep = 1; render(); }
  else if (button.id === 'toStructures') startStructureExplore();
  else if (button.id === 'toVariations') { hydrateVariations(); state.stage = 3; render(); }
  else if (button.id === 'toCompare') startCompare();
  else if (button.id === 'toAgreement') { state.stage = 5; render(); }
}

app.addEventListener('click', handleNextAction, true);

function bind() {
  document.querySelector('#backToList')?.addEventListener('click', () => { state.stage = state.structureSlots.length ? 2 : 0; render(); });
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.stage); if (stageEnabled(next)) { state.stage = next; render(); } }));
  document.querySelectorAll('[data-view]').forEach((input) => input.addEventListener('change', loadBoardView));
  document.querySelectorAll('[data-upload-view]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#view-${button.dataset.uploadView}`)?.click()));
  document.querySelectorAll('[data-source-view]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Number(button.dataset.sourceView); render(); }));
  document.querySelectorAll('[data-source-step]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Math.max(0, Math.min(BOARD_VIEWS.length - 1, state.sourceViewIndex + Number(button.dataset.sourceStep))); render(); }));
  document.querySelectorAll('[data-gender]').forEach((button) => button.addEventListener('click', () => { state.diagnosis.profileGender = button.dataset.gender; invalidateGeneratedSurfaces('profile-change'); render(); }));
  document.querySelectorAll('.dot-range').forEach((input) => input.addEventListener('input', () => updateDiagnosisRange(input)));
  document.querySelector('#mood')?.addEventListener('input', (event) => { state.mood = event.target.value; if (state.structureSlots.length || state.batch) invalidateGeneratedSurfaces('profile-change'); });
  document.querySelector('#backToDiagnosis')?.addEventListener('click', () => { state.profileStep = 0; render(); });
  document.querySelectorAll('[data-current-tone]').forEach((button) => button.addEventListener('click', () => setCurrentTone(button.dataset.currentTone)));
  document.querySelectorAll('[data-target-tone]').forEach((button) => button.addEventListener('click', () => toggleTargetTone(button.dataset.targetTone)));
  document.querySelectorAll('[data-color-intensity]').forEach((button) => button.addEventListener('click', () => { replaceHairColorProfile({ intensity: button.dataset.colorIntensity }); invalidateGeneratedSurfaces('color-change'); render(); }));
  document.querySelectorAll('[data-structure-slot]').forEach((button) => button.addEventListener('click', () => selectStructureSlot(Number(button.dataset.structureSlot))));
  document.querySelector('#mood2')?.addEventListener('input', (event) => { const { selectionStart, selectionEnd } = event.target; state.mood = event.target.value; clearTimeout(moodRankTimer); moodRankTimer = setTimeout(() => { if (state.stage !== 3) return; state.ranked = rankFeasibleVariations(state.variations); state.variationPage = 0; state.selectedVariation = state.ranked.find((variation) => evaluateVariation(variation, state.diagnosis).status !== 'impossible') || null; render(); restoreTextFocus('mood2', selectionStart, selectionEnd); }, 350); });
  document.querySelector('#prevVariation')?.addEventListener('click', () => { state.variationPage = Math.max(0, state.variationPage - 1); render(); });
  document.querySelector('#nextVariation')?.addEventListener('click', () => { const pages = Math.max(1, Math.ceil(state.ranked.length / 72)); state.variationPage = Math.min(pages - 1, state.variationPage + 1); render(); });
  document.querySelectorAll('[data-var]').forEach((button) => button.addEventListener('click', () => { state.selectedVariation = state.ranked.find((variation) => String(variation.id) === button.dataset.var); render(); }));
  document.querySelectorAll('[data-short]').forEach((input) => input.addEventListener('change', toggleShort));
  document.querySelector('#print')?.addEventListener('click', () => window.print());
  document.querySelector('#downloadJson')?.addEventListener('click', downloadJson);
  document.querySelector('#handoff')?.addEventListener('click', handoff);
}

async function ensureCatalog() {
  if (state.catalog) return state.catalog;
  if (!state.catalogPromise) state.catalogPromise = (async () => {
    const response = await fetch('/docs/hair-design-master/catalog.json');
    if (!response.ok) throw new Error('CATALOG ERROR');
    state.catalog = hydrateCatalogPayload(await response.json());
    state.records = state.catalog.records;
    state.recordsById = new Map(state.records.map((record) => [record.id, record]));
    state.groups = buildConsultationGroups(state.records);
    state.groupsByKey = new Map(state.groups.map((group) => [group.key, group]));
    return state.catalog;
  })().catch((error) => { state.catalogPromise = null; throw error; });
  return state.catalogPromise;
}
function settingValue(id) {
  const definition = DIAGNOSIS_DEFINITIONS.find((item) => item.id === id);
  const input = document.querySelector(`#${id}`);
  if (!input) return diagnosisValue(definition);
  const index = Number(input.value ?? definition.defaultIndex);
  return definition.values[Math.max(0, Math.min(definition.values.length - 1, index))];
}

function updateDiagnosisRange(input) {
  if (state.structureSlots.length || state.batch) invalidateGeneratedSurfaces('profile-change');
  const value = Number(input.value);
  const max = Number(input.max) || 1;
  input.style.setProperty('--p', `${value / max * 100}%`);
  const dots = input.parentElement?.querySelectorAll('.range-dots i') || [];
  dots.forEach((dot, index) => dot.classList.toggle('on', index <= value));
  if (input.id === 'currentLength') {
    const option = LENGTH_OPTIONS[value];
    state.diagnosis.actualLengthCm = option.actualLengthCm;
    state.settings.currentLength = option.currentLength;
    document.querySelector('#currentLengthValue').textContent = option.label;
    reconcileHairColorProfile();
    return;
  }
  const definition = DIAGNOSIS_DEFINITIONS.find((item) => item.id === input.dataset.setting);
  const serialized = definition.values[value];
  document.querySelector(`#${definition.id}Value`).textContent = definition.labels[value];
  if (definition.id === 'recentPerm') state.diagnosis.monthsSincePerm = serialized;
  else state.diagnosis[definition.id] = serialized;
  reconcileHairColorProfile();
}

function syncIntake() {
  const lengthOption = LENGTH_OPTIONS[Math.max(0, Math.min(LENGTH_OPTIONS.length - 1, Number(val('currentLength') || currentLengthOptionIndex())))];
  state.diagnosis = normalizeDiagnosis({ profileGender: state.diagnosis.profileGender ?? 'F', actualLengthCm: lengthOption.actualLengthCm, naturalTexture: settingValue('naturalTexture'), density: settingValue('density'), damage: settingValue('damage'), bleachCount: settingValue('bleachCount'), monthsSincePerm: settingValue('recentPerm'), extensionAllowed: settingValue('extensionAllowed') });
  state.settings = normalizeSettings({ currentLength: lengthOption.currentLength, hairThickness: densityToThickness[state.diagnosis.density] || 'normal', damageCondition: damageMap[state.diagnosis.damage] || 'medium', permAllowed: state.diagnosis.monthsSincePerm >= 3, extensionAllowed: Boolean(state.diagnosis.extensionAllowed), similarity: 2 });
  state.mood = val('mood') || state.mood;
  if (document.querySelector('#baseURL')) {
    state.cfg = { baseURL: val('baseURL'), model: val('model'), size: val('size'), apiKey: val('apiKey') };
    saveProviderConfig(state.cfg);
  }
  reconcileHairColorProfile();
}
function val(id) { return document.querySelector(`#${id}`)?.value ?? ''; }
function filterGroups() {
  const gender = state.diagnosis.profileGender ?? 'F';
  return state.groups.filter((group) => group.genderId === gender);
}

function prepareGroupSummaries() {
  state.groupSummaries = new Map();
  for (const group of state.filteredGroups) state.groupSummaries.set(group.key, summarizeGroupFeasibility(group, state.diagnosis));
  const rank = { possible: 0, conditional: 1, impossible: 2 };
  state.filteredGroups.sort((a, b) => rank[groupStatus(state.groupSummaries.get(a.key))] - rank[groupStatus(state.groupSummaries.get(b.key))] || a.key.localeCompare(b.key));
}

function hydrateVariations() {
  state.variations = expandConsultationGroup(state.selectedGroup);
  state.ranked = rankFeasibleVariations(state.variations);
  state.variationPage = 0;
  state.selectedVariation = state.ranked.find((variation) => evaluateVariation(variation, state.diagnosis).status !== 'impossible') || null;
}

function invalidateGeneratedSurfaces(reason) {
  cancelActiveBatch(reason);
  state.structureSlots = [];
  state.structureStatus = '';
  state.slots = [];
  state.status = '';
  state.selectedGroup = null;
  state.selectedVariation = null;
  state.shortlist.clear();
}

function selectStructureSlot(slotIndex) {
  const slot = state.structureSlots[slotIndex];
  if (!slot || slot.status !== 'done') return;
  const record = state.recordsById.get(slot.designId);
  const group = record ? state.groupsByKey.get(recordGroupKey(record)) : null;
  if (!group) return;
  state.selectedGroup = group;
  render();
}

async function startStructureExplore() {
  if (state.structurePreparing) return;
  state.error = '';
  try {
    syncIntake();
    if (!requiredSourceViewsReady()) throw new Error('FRONT REQUIRED · FRONT 사진을 먼저 추가하세요.');
    if (state.hairColorProfile.currentToneId === 'unknown') throw new Error('CURRENT COLOR REQUIRED · 현재 머리색을 선택하세요.');
    const cfg = resolvedProviderConfig();
    if (!cfg.baseURL || !cfg.apiKey || cfg.apiKey === 'YOUR_PROXY_API_KEY') throw new Error('API REQUIRED · PROFILE 1/2의 API 설정을 확인하세요.');
    state.structurePreparing = true;
    render();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await Promise.all([ensureCatalog(), refreshModelPreviews()]);
    state.filteredGroups = filterGroups();
    prepareGroupSummaries();
    const selection = selectConsultationStructureDesignIds(state.filteredGroups, state.diagnosis, {
      sourceViewKeys: availableSourceViewKeys(),
      hairColorProfile: state.hairColorProfile,
      mood: state.mood,
      preferences: { mood: state.mood, maintenance: 'medium' },
      seedInput: `${state.sourceKey}:structure:${state.mood}`
    });
    cancelActiveBatch('structure-refresh');
    state.selectedGroup = null;
    state.selectedVariation = null;
    state.shortlist.clear();
    state.slots = [];
    state.status = '';
    state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `structure-${Date.now()}`, designIds: selection.designIds, generationAxes: selection.generationAxes, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'structure', diversityRelaxations: selection.diversityRelaxations } }), 'structure');
    state.structureSlots = state.batch.slots;
    state.structureActiveLimit = state.batch.activeLimit;
    state.structureStatus = '100 PICKS';
    state.structurePreparing = false;
    state.stage = 2;
    render();
    pumpQueue();
  } catch (error) {
    state.structurePreparing = false;
    state.error = error?.message || 'STRUCTURE ERROR';
    render();
  }
}


async function loadBoardView(event) {
  const role = event.target.dataset.view;
  const file = event.target.files?.[0];
  if (!role || !file || !file.type.startsWith('image/')) return;
  if (role === 'front') {
    await loadPhoto(event);
    return;
  }
  try {
    invalidateGeneratedSurfaces('source-change');
    const prepared = await prepareOriginalJpeg(file);
    state.sourceViews[role] = prepared.dataUrl;
    state.sourceViewBlobs[role] = prepared.blob;
    clearProviderInputCache(role);
    state.error = '';
  } catch {
    state.error = 'IMAGE ERROR';
  }
  setTimeout(render, 0);
}

async function loadPhoto(event) {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  state.error = '';
  state.sourceProcessing = true;
  render();
  try {
    invalidateGeneratedSurfaces('source-change');
    const prepared = await prepareOriginalJpeg(file);
    state.originalFile = file;
    state.originalDataUrl = await fileToDataUrl(file);
    state.originalJpegDataUrl = prepared.dataUrl;
    state.originalJpegBlob = prepared.blob;
    state.sourceViewBlobs.front = prepared.blob;
    clearProviderInputCache('front');
    state.sourceKey = await sourcePhotoKey(new Uint8Array(await prepared.blob.arrayBuffer()), prepared.blob.type);
    state.sourceViews.front = prepared.dataUrl;
    state.shortlist.clear();
    replaceHairColorProfile({ currentToneId: 'unknown', selectedToneIds: [PRESERVE_CURRENT_TONE_ID] });
    try {
      await detectCurrentHairTone('front');
    } catch {
      state.hairColorDetection = { status: 'failed', source: 'auto', toneId: 'unknown', confidence: 0 };
    }
  } catch {
    state.hairColorDetection = { status: 'failed', source: 'auto', toneId: 'unknown', confidence: 0 };
    state.error = 'IMAGE ERROR';
  }
  state.sourceProcessing = false;
  setTimeout(render, 0);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadBlobImage(blob, message = 'Image decode failed') {
  return new Promise((resolve, reject) => {
    const element = new Image();
    const objectUrl = URL.createObjectURL(blob);
    element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(message)); };
    element.src = objectUrl;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas encode failed')), type, quality));
}

async function detectCurrentHairTone(viewKey = 'front') {
  const sourceBlob = state.sourceViewBlobs[viewKey];
  if (!(sourceBlob instanceof Blob)) return { toneId: 'unknown', confidence: 0 };
  state.hairColorDetection = { status: 'detecting', source: 'auto', toneId: 'unknown', confidence: 0 };
  const source = await loadBlobImage(sourceBlob, 'Color source decode failed');
  const scale = Math.min(1, 256 / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const samplingRegions = {
    front: [[0.5, 0.24, 0.24, 0.15], [0.33, 0.36, 0.08, 0.14], [0.67, 0.36, 0.08, 0.14]],
    side: [[0.5, 0.25, 0.25, 0.17], [0.43, 0.38, 0.14, 0.14]],
    back: [[0.5, 0.31, 0.28, 0.23]],
    crown: [[0.5, 0.48, 0.32, 0.3]],
    nape: [[0.5, 0.35, 0.28, 0.26]],
    detail: [[0.5, 0.5, 0.35, 0.38]]
  };
  const excludedRegions = {
    front: [[0.5, 0.59, 0.3, 0.3], [0.22, 0.48, 0.055, 0.11], [0.78, 0.48, 0.055, 0.11]],
    side: [[0.5, 0.61, 0.31, 0.3], [0.77, 0.47, 0.07, 0.12]],
    back: [[0.5, 0.69, 0.18, 0.22]],
    nape: [[0.5, 0.7, 0.18, 0.23]]
  };
  const inside = (x, y, region) => {
    const [cx, cy, rx, ry] = region;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  };
  const included = samplingRegions[viewKey] ?? samplingRegions.front;
  const excluded = excludedRegions[viewKey] ?? [];
  const samples = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      if (!included.some((region) => inside(nx, ny, region)) || excluded.some((region) => inside(nx, ny, region))) continue;
      const index = (y * width + x) * 4;
      samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
    }
  }
  const detection = classifyHairColorSamples(samples);
  if (state.sourceViewBlobs[viewKey] !== sourceBlob) return { ...detection, stale: true };
  if (detection.toneId !== 'unknown') {
    replaceHairColorProfile({ currentToneId: detection.toneId, selectedToneIds: [detection.toneId] });
    state.hairColorDetection = { ...detection, status: 'done', source: 'auto' };
  } else {
    state.hairColorDetection = { ...detection, status: 'failed', source: 'auto' };
  }
  return detection;
}

function prepareOriginalJpeg(file, maxEdge = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('JPEG encode failed'));
        resolve({ blob, dataUrl: await blobToDataUrl(blob) });
      }, 'image/jpeg', quality);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image decode failed')); };
    image.src = objectUrl;
  });
}

async function flipBlobHorizontally(blob, type = blob.type || 'image/png') {
  const image = await loadBlobImage(blob, 'Transform decode failed');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(image, 0, 0);
  return canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);
}

async function providerInputsForItem(item) {
  const viewKey = item.sourceViewKey || item.generationAxes?.sourceViewKey || 'front';
  const mirrored = Boolean(item.generationAxes?.mirrored);
  const key = `${viewKey}:${mirrored ? 1 : 0}`;
  if (state.providerInputCache.has(key)) return state.providerInputCache.get(key);
  const originalSourceBlob = state.sourceViewBlobs[viewKey];
  if (!(originalSourceBlob instanceof Blob)) throw new Error(`Missing source view: ${viewKey}`);
  const value = { sourceBlob: mirrored ? await flipBlobHorizontally(originalSourceBlob, 'image/jpeg') : originalSourceBlob };
  state.providerInputCache.set(key, value);
  return value;
}

async function restoreGeneratedOrientation(resultUrl, signal, mirrored = false) {
  const response = await fetch(resultUrl, { signal });
  if (!response.ok) throw new Error('Generated image fetch failed');
  const generatedBlob = await response.blob();
  const resultBlob = mirrored ? await flipBlobHorizontally(generatedBlob, 'image/png') : generatedBlob;
  return { url: await blobToDataUrl(resultBlob), bytes: resultBlob.size, mimeType: resultBlob.type || (mirrored ? 'image/png' : 'image/jpeg') };
}

function resolvedProviderConfig() {
  const local = window.HAIR_IMAGEN || {};
  return {
    baseURL: state.cfg.baseURL || local.baseURL || '',
    model: state.cfg.model || local.model || 'gpt-image-2',
    size: state.cfg.size || local.size || '1024x1024',
    apiKey: state.cfg.apiKey || local.apiKey || ''
  };
}

function cancelActiveBatch(reason) {
  for (const controller of state.controllers.values()) controller.abort();
  state.controllers.clear();
  state.running.clear();
  if (state.batch && !state.batch.supersededBy) {
    state.batch = supersedeConsultationBatch(state.batch, `${reason}-${Date.now()}`);
    if (state.batch.metadata?.purpose === 'structure') state.structureSlots = state.batch.slots;
  }
}

async function startCompare() {
  state.error = '';
  const cfg = resolvedProviderConfig();
  if (!state.originalJpegBlob || !state.originalJpegDataUrl) {
    state.error = 'FRONT REQUIRED';
    render();
    return;
  }
  if (!cfg.baseURL || !cfg.apiKey || cfg.apiKey === 'YOUR_PROXY_API_KEY') {
    state.error = 'API REQUIRED';
    render();
    return;
  }
  await refreshModelPreviews();
  cancelActiveBatch('new-batch');
  const selected = selectConsultationDesignIds(state.records, state.settings, { seedInput: `${state.sourceKey}:${state.mood}`, centerDesignId: state.selectedVariation?.designId, diagnosis: state.diagnosis, mood: state.selectedVariation?.mood, intensity: state.selectedVariation?.intensity });
  const candidates = selected.designIds.map((designId) => {
    const record = state.recordsById.get(designId);
    return { ...record, id: designId, designId, structureKey: canonicalStructureKey(record), mood: state.selectedVariation?.mood || '자연스러운', intensity: state.selectedVariation?.intensity || '균형 있게', finishKo: record.finishKo || record.promptAtoms?.finishKo, finishRecord: record };
  });
  const assigned = assignConsultationGenerationAxes(candidates, { diagnosis: state.diagnosis, sourceViewKeys: availableSourceViewKeys(), hairColorProfile: state.hairColorProfile, preferences: { mood: state.mood, maintenance: 'medium' }, seedInput: `${state.sourceKey}:compare:${state.selectedVariation?.designId || ''}` });
  const generationAxes = assigned.map((candidate) => candidate.generationAxes);
  state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `consult-${Date.now()}`, designIds: selected.designIds, generationAxes, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'compare', selectedVariationId: state.selectedVariation?.id } }), 'compare');
  state.shortlist.clear();
  state.slots = state.batch.slots;
  state.status = '100 SLOTS';
  state.stage = 4;
  render();
  pumpQueue();
}

function syncBatchSurface() {
  if (state.batch?.metadata?.purpose === 'structure') {
    state.structureSlots = state.batch.slots;
    state.structureActiveLimit = state.batch.activeLimit;
  } else {
    state.slots = state.batch?.slots || [];
    state.activeLimit = state.batch?.activeLimit ?? CONSULTATION_INITIAL_ACTIVE;
  }
}

function renderActiveBatchSurface() {
  const purpose = state.batch?.metadata?.purpose;
  if ((purpose === 'structure' && state.stage === 2) || (purpose === 'compare' && state.stage === 4)) render();
}

function pumpQueue() {
  if (!state.batch || state.batch.supersededBy) return;
  state.batch = startConsultationQueuedItems(state.batch);
  const batchId = state.batch.batchId;
  const active = state.batch.slots.filter((item) => item.status === 'active' && !state.running.has(`${batchId}:${item.slotIndex}`));
  for (const item of active) runJob(item, batchId, state.batch.sourcePhotoKey);
  syncBatchSurface();
  renderActiveBatchSurface();
}

async function runJob(item, batchId, batchSourcePhotoKey) {
  const jobKey = `${batchId}:${item.slotIndex}`;
  const controller = new AbortController();
  state.running.add(jobKey);
  state.controllers.set(jobKey, controller);
  let result;
  try {
    result = await requestImageEdit(item, controller.signal);
  } catch (error) {
    result = { ok: false, errorType: error?.name === 'AbortError' ? 'aborted' : 'network', statusCode: error?.name === 'AbortError' ? 0 : 503 };
  }
  try {
    if (!state.batch || state.batch.batchId !== batchId || state.batch.sourcePhotoKey !== batchSourcePhotoKey) return;
    const applied = applyConsultationCompletion(state.batch, {
      ok: result.ok,
      batchId,
      sourcePhotoKey: batchSourcePhotoKey,
      slotIndex: item.slotIndex,
      designId: item.designId,
      generation: item.generation,
      sourceViewKey: item.sourceViewKey,
      mirrored: item.generationAxes?.mirrored,
      colorToneId: item.generationAxes?.colorToneId,
      errorType: result.errorType,
      statusCode: result.statusCode
    });
    if (!applied.accepted) return;
    state.batch = result.ok ? withPreview(applied.batch, item.slotIndex, result.url) : applied.batch;
    state.activeLimit = Math.min(CONSULTATION_HARD_MAX_ACTIVE, state.batch.activeLimit);
  } finally {
    state.running.delete(jobKey);
    state.controllers.delete(jobKey);
    if (state.batch?.batchId === batchId) {
      syncBatchSurface();
      const queued = state.batch.slots.some((slot) => slot.status === 'queued');
      const active = state.batch.slots.some((slot) => slot.status === 'active');
      if (!queued && !active) {
        const done = state.batch.slots.filter((slot) => slot.status === 'done').length;
        const failed = state.batch.slots.filter((slot) => slot.status === 'failed').length;
        const finalStatus = failed ? `${done} DONE · ${failed} FAIL` : '100 DONE';
        if (state.batch.metadata?.purpose === 'structure') state.structureStatus = finalStatus;
        else state.status = finalStatus;
      }
      renderActiveBatchSurface();
      if (queued) pumpQueue();
    }
  }
}

function withPreview(batch, slotIndex, url) {
  return { ...batch, slots: batch.slots.map((slot) => slot.slotIndex === slotIndex ? { ...slot, previewUrl: url } : slot) };
}

function textureControlPrompt(record) {
  const finish = String(record.promptAtoms?.finishKo || record.finishKo || '');
  if (/내추럴 컬|내추럴 코일/.test(finish)) {
    return 'TEXTURE CONTROL: preserve the customer’s natural curl family and density. Refine the silhouette without multiplying curls, adding frizz, wet clumps or artificial strand separation.';
  }
  if (/타이트|스파이럴|히피|워터 웨이브|젤리|코일/.test(finish)) {
    return 'TEXTURE CONTROL: translate the named finish into a restrained current salon version with broader, softer and less frequent bends. Keep the roots calm and the silhouette readable; no micro-crimping, noodle curls, wet clumps, frizz halo or uniformly repeated texture.';
  }
  return 'TEXTURE CONTROL: keep texture natural, soft and low-amplitude. Use a few readable bends and cohesive hair masses; no wiry strands, crispy separation, wet look, excessive curl frequency or over-styled volume.';
}

const NATURAL_SURFACE_FINISH_PROMPT = 'SURFACE FINISH LOCK: use natural low-sheen satin-to-matte hair with soft, diffuse, broken highlights, realistic strand variation and shadow depth. No wet or oily look, glassy or plastic shine, mirror-like specular bands, metallic gloss, lacquered finish or synthetic wig sheen. Keep subtle healthy highlights; do not make the hair chalky or flat.';

function consultationPrompt(record, item) {
  const selected = state.selectedVariation;
  const axes = item.generationAxes || {};
  const viewKey = item.sourceViewKey || axes.sourceViewKey || 'front';
  const currentToneId = state.hairColorProfile.currentToneId;
  const targetToneId = axes.colorToneId || currentToneId;
  const colorRule = targetToneId === currentToneId
    ? `COLOR: preserve the exact current hair tone (${toneLabel(currentToneId)}). No global color grading.`
    : `COLOR: change hair from ${toneLabel(currentToneId)} to ${toneLabel(targetToneId)} with ${axes.intensity || state.hairColorProfile.intensity} intensity. Keep roots, depth and highlights natural; no global color grading.`;
  const viewRule = {
    front: 'Preserve the exact front-facing pose, facial geometry, gaze and expression.',
    side: 'Preserve the exact side profile, nose line, jaw line, ear position and neck angle.',
    back: 'Preserve the exact rear head position, ear symmetry, neck and shoulder geometry.',
    crown: 'Preserve the exact overhead camera position, scalp placement and part line.',
    nape: 'Preserve the exact rear-lower camera position, neck and nape boundary.',
    detail: 'Preserve the exact close-up framing and every non-hair detail.'
  }[viewKey] ?? '';
  return [
    `TASK: edit only the hair in the single uploaded original customer ${viewKey} photograph.`,
    `SOURCE VIEW: ${viewKey.toUpperCase()}. Return the same view and camera angle.`,
    `SOURCE TRANSFORM: ${axes.mirrored ? 'HORIZONTAL MIRROR AUGMENTATION; keep the supplied mirrored orientation exactly so the client can invert it back.' : 'ORIGINAL ORIENTATION; do not mirror.'}`,
    `GENERATION AXES: v${axes.version || CONSULTATION_GENERATION_AXES_VERSION}; source-transform v${axes.sourceTransformVersion || CONSULTATION_SOURCE_TRANSFORM_VERSION}; maskless full-frame edit.`,
    'OUTPUT CONTRACT: exactly ONE full-frame image and ONE person.',
    'PIXEL LOCK: every non-hair pixel must remain unchanged. Do not redraw, regenerate, beautify, retouch or reinterpret face shape, identity, expression, skin, scalp skin, eyes, eyebrows, facial hair, nose, lips, jaw, ears, neck, body, clothing, background, lighting, framing or camera angle.',
    'FACE LOCK: preserve exact identity, proportions, expression, gaze, skin texture and alignment. No face slimming, eye enlargement, skin smoothing or symmetry correction.',
    'HAIRLINE LOCK: preserve the exact forehead, temples and visible hairline boundary. Never recolor scalp skin or generate hair across skin.',
    'COLOR BOUNDARY: never recolor face, eyebrows, facial hair, ears, neck, body, clothing, background, highlights outside hair, or the whole frame.',
    'MASKLESS CONTRACT: no edit mask is supplied. Render the requested hairstyle as one natural continuous silhouette, including necessary length or volume beyond the current hair outline, while changing hair only.',
    viewRule,
    'PRESERVE SOURCE FRAME: no crop, zoom, enlargement, reframing, collage, split screen, duplicate person, inset or border.',
    textureControlPrompt(record),
    NATURAL_SURFACE_FINISH_PROMPT,
    genderLineTreatmentPrompt(record.genderId),
    colorRule,
    `DESIGN ID: ${record.id}`,
    `STYLE: ${familiarStyleName(record.promptAtoms?.titleKo || record.nameKo)}`,
    `STRUCTURE: ${familiarStyleName(record.promptAtoms?.structureKo || record.baseKo)}`,
    record.promptAtoms?.frontKo ? `FRONT DESIGN: ${record.promptAtoms.frontKo}` : '',
    record.promptAtoms?.finishKo ? `FINISH: ${record.promptAtoms.finishKo}` : '',
    selected?.mood ? `MOOD: ${selected.mood}` : '',
    selected?.intensity ? `INTENSITY: ${selected.intensity}` : '',
    `CURRENT HAIR: ${state.diagnosis.naturalTexture}, damage ${state.diagnosis.damage}.`,
    'No text, logo, watermark or decorative graphic.'
  ].filter(Boolean).join('\n');
}

async function requestImageEdit(item, signal) {
  const cfg = resolvedProviderConfig();
  const designId = item.designId;
  const viewKey = item.sourceViewKey || item.generationAxes?.sourceViewKey || 'front';
  const record = state.recordsById.get(designId);
  if (!cfg.baseURL || !cfg.apiKey || !record) return { ok: false, errorType: 'config', statusCode: 0 };
  const inputs = await providerInputsForItem(item);
  const form = new FormData();
  form.append('model', cfg.model);
  form.append('prompt', consultationPrompt(record, item));
  form.append('size', cfg.size);
  form.append('quality', 'low');
  form.append('output_format', 'jpeg');
  form.append('output_compression', '70');
  const suffix = item.generationAxes?.mirrored ? 'mirror' : 'original';
  form.append('image', inputs.sourceBlob, `${designId}-${viewKey}-${suffix}.jpg`);
  const response = await fetch(cfg.baseURL.replace(/\/+$/, '') + '/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}` }, body: form, signal });
  if (!response.ok) return { ok: false, errorType: 'http', statusCode: response.status };
  let payload;
  try { payload = await response.json(); } catch { return { ok: false, errorType: 'provider-shape', statusCode: response.status }; }
  const datum = payload?.data?.[0];
  const normalized = normalizeProviderResult(datum ? { ...datum, providerStatus: response.status } : null, { designId, batchId: state.batch?.batchId, slotIndex: item.slotIndex });
  if (!normalized.ok) return { ok: false, errorType: normalized.errorCode, statusCode: normalized.providerStatus || response.status };
  try {
    const restored = await restoreGeneratedOrientation(normalized.url, signal, Boolean(item.generationAxes?.mirrored));
    return { ...normalized, ...restored, providerKind: `${normalized.providerKind}-maskless${item.generationAxes?.mirrored ? '-unmirrored' : ''}` };
  } catch (error) {
    return { ok: false, errorType: error?.name === 'AbortError' ? 'aborted' : 'result', statusCode: 0 };
  }
}

function toggleShort(event) {
  const id = event.target.dataset.short;
  if (!id) return;
  if (event.target.checked) {
    if (state.shortlist.size >= 6) { event.target.checked = false; state.error = '후보는 최대 6개입니다.'; }
    else state.shortlist.add(id);
  } else state.shortlist.delete(id);
  render();
}
function agreementPayload(includeOriginal) { return { ...(includeOriginal ? { originalFrontDataUrl: state.originalJpegDataUrl, sourceViews: { ...state.sourceViews, front: state.originalJpegDataUrl } } : {}), currentDesignIds: [...state.shortlist].slice(0, 6), settings: state.settings, diagnosis: state.diagnosis, hairColorProfile: state.hairColorProfile, decision: { mood: state.mood, selectedStructureKey: state.selectedGroup?.key, selectedVariation: state.selectedVariation?.id }, catalogVersion, promptVersion }; }
function downloadJson() { const blob = new Blob([JSON.stringify(agreementPayload(false), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hairloom-consultation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function handoff() { const payload = buildConsultationHandoff(agreementPayload(true)); sessionStorage.setItem(CONSULTATION_HANDOFF_STORAGE_KEY, JSON.stringify(payload)); location.href = CONSULTATION_HANDOFF_QUERY_TRIGGER; }
function loadProviderConfig() { try { const cfg = JSON.parse(localStorage.getItem('HAIR_IMAGEN_CFG') || '{}'); return { baseURL: cfg.baseURL || '', model: cfg.model || 'gpt-image-2', size: cfg.size || '1024x1024', apiKey: sessionStorage.getItem('HAIR_IMAGEN_KEY') || '' }; } catch { localStorage.removeItem('HAIR_IMAGEN_CFG'); return { baseURL: '', model: 'gpt-image-2', size: '1024x1024', apiKey: '' }; } }
function saveProviderConfig(cfg) { localStorage.setItem('HAIR_IMAGEN_CFG', JSON.stringify({ baseURL: cfg.baseURL, model: cfg.model, size: cfg.size })); if (cfg.apiKey) sessionStorage.setItem('HAIR_IMAGEN_KEY', cfg.apiKey); else sessionStorage.removeItem('HAIR_IMAGEN_KEY'); }

modelPreviewRegistryReady.then((registry) => {
  if (!registry || modelPreviewDisposed) return;
  modelPreviewUnsubscribe = registry.subscribeModelPreviewChanges(async () => {
    if (modelPreviewDisposed) return;
    await refreshModelPreviews();
    if (state.stage === 2 || state.stage === 4) render();
  });
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  modelPreviewDisposed = true;
  modelPreviewUnsubscribe();
  releaseModelPreviewUrls();
});
render();
(globalThis.requestIdleCallback || ((callback) => setTimeout(callback, 120)))(() => ensureCatalog().catch(() => {}));
