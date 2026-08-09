import { catalogVersion, promptVersion, hydrateCatalogPayload, normalizeProviderResult, normalizeSettings, sourcePhotoKey, genderLineTreatmentPrompt } from '../src/exploreCore.mjs';
import {
  CONSULTATION_HANDOFF_STORAGE_KEY,
  CONSULTATION_HANDOFF_QUERY_TRIGGER,
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
  evaluateVariation,
  summarizeGroupFeasibility,
  selectConsultationStructureDesignIds,
  createConsultationBatch,
  assignConsultationSourceViews,
  startConsultationQueuedItems,
  applyConsultationCompletion,
  supersedeConsultationBatch,
  buildConsultationHandoff
} from '../src/consultationCore.mjs';
import {
  DEFAULT_HAIR_ANALYSIS_MODEL,
  defaultHairAnalysis,
  normalizeHairAnalysis,
  requestHairAnalysis,
  hairAnalysisToDiagnosis,
  hairAnalysisToExploreSettings,
  hairAnalysisToColorProfile
} from '../src/hairAnalysis.mjs';

const app = document.querySelector('#app');
const imageLightbox = document.querySelector('#imageLightbox');
const imageLightboxImage = document.querySelector('#imageLightboxImage');
const stageLabels = Object.freeze({ 0: 'SOURCE', 2: 'STRUCTURE', 5: 'LOCK' });
const visibleStages = Object.freeze([
  { label: 'SOURCE', stateIndex: 0 },
  { label: 'STRUCTURE', stateIndex: 2 },
  { label: 'LOCK', stateIndex: 5 }
]);
const state = {
  stage: 0,
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
  freePrompt: '',
  analysis: null,
  analysisStatus: 'idle',
  analysisVersion: 0,
  analysisController: null,
  catalog: null,
  catalogPromise: null,
  records: [],
  recordsById: new Map(),
  groups: [],
  filteredGroups: [],
  groupSummaries: new Map(),
  groupsByKey: new Map(),
  structureSlots: [],
  structurePreparing: false,
  diagnosis: normalizeDiagnosis({ profileGender: 'U' }),
  hairColorProfile: normalizeHairColorProfile({}),
  hairColorDetection: { status: 'idle', source: 'none', toneId: 'unknown', confidence: 0 },
  settings: normalizeSettings({}),
  mood: '',
  batch: null,
  running: new Set(),
  controllers: new Map(),
  shortlist: new Set(),
  error: '',
  cfg: loadProviderConfig()
};

function h(strings, ...values) {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
}
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const statusKo = (status) => status === 'possible' ? 'OK' : status === 'conditional' ? 'CHECK' : status === 'impossible' ? 'NO' : status === 'done' ? 'DONE' : status === 'failed' ? 'FAIL' : status === 'active' ? 'RUN' : 'WAIT';
const statusClass = (s) => s === 'possible' ? 'ok' : s === 'conditional' ? 'conditional' : 'impossible';
let sourceLoadVersion = 0;
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
const BOARD_VIEWS = [
  { id: 'front', label: 'FRONT' },
  { id: 'side', label: 'SIDE' },
  { id: 'back', label: 'BACK' },
  { id: 'crown', label: 'CROWN' },
  { id: 'nape', label: 'NAPE' },
  { id: 'detail', label: 'DETAIL' }
];

function requiredSourceViewsReady() {
  return Boolean(state.originalJpegDataUrl);
}

function stageEnabled(index) {
  return index === 0
    || (index === 2 && state.structureSlots.length > 0)
    || (index === 5 && state.shortlist.size > 0);
}

function currentStageLabel() {
  return stageLabels[state.stage] || 'SOURCE';
}

function render() {
  const currentContent = app.querySelector('.content');
  const preserveScroll = currentContent?.dataset.stage === String(state.stage);
  const scrollTop = preserveScroll ? currentContent.scrollTop : 0;
  const step = Math.max(1, visibleStages.findIndex((item) => item.stateIndex === state.stage) + 1);
  const stageMarkup = ({ 0: renderSource, 2: renderStructure, 5: renderAgreement }[state.stage] || renderSource)();
  app.innerHTML = h`<div class="workspace">
    <aside class="rail">
      <button class="brand" id="backToList" type="button" aria-label="Back to structure list">H</button>
      <nav class="stages" aria-label="Progress">${visibleStages.map(({ label, stateIndex }) => `<button class="stage" aria-label="${label}" aria-current="${state.stage === stateIndex}" data-stage="${stateIndex}" ${stageEnabled(stateIndex) ? '' : 'disabled'}><i></i></button>`).join('')}</nav>
      <div class="rail-count"><b>${String(step).padStart(2, '0')}</b><span>/ 03</span></div>
    </aside>
    <main class="content" data-stage="${state.stage}">
      <header class="content-head"><b>HAIRLOOM PRO</b><span>${String(step).padStart(2, '0')} / 03 · ${currentStageLabel()}</span></header>
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


function assignBatchSourceViews(batch, purpose) {
  return assignConsultationSourceViews(batch, availableSourceViewKeys(), `${state.sourceKey}:${purpose}`);
}

function analysisStatusText() {
  if (state.analysisStatus === 'analyzing') return 'ANALYZING';
  if (state.analysisStatus === 'done') return 'READY';
  if (state.analysisStatus === 'fallback') return 'FALLBACK';
  if (state.analysisStatus === 'failed') return 'ERROR';
  return 'AUTO';
}

function renderSource() {
  const view = BOARD_VIEWS[state.sourceViewIndex] ?? BOARD_VIEWS[0];
  const source = sourceViewSource(view);
  const required = state.originalJpegDataUrl ? 1 : 0;
  const processing = state.sourceProcessing && view.id === 'front';
  const analyzing = state.analysisStatus === 'analyzing';
  const ready = requiredSourceViewsReady() && !state.sourceProcessing && !state.structurePreparing;
  const uploadContent = source ? `<img src="${esc(source)}" alt="${view.label}">` : processing ? '<span class="source-processing-mark">···</span><small>PREPARING PHOTO</small>' : `<span>＋</span><small>ADD ${view.label}</small>`;
  const galleryInputId = `view-${view.id}-gallery`;
  const cameraInput = view.id === 'front' ? `<input id="view-front-camera" data-view="front" type="file" accept="image/*" capture="user" aria-label="카메라로 정면 사진 촬영">` : '';
  const intakeActions = view.id === 'front'
    ? `<div class="source-intake-actions"><button type="button" data-upload-input="view-front-camera">카메라로 바로 촬영</button><button type="button" data-upload-input="${galleryInputId}">갤러리에서 선택</button></div>`
    : `<div class="source-intake-actions one"><button type="button" data-upload-input="${galleryInputId}">사진 선택</button></div>`;
  return `<section class="source-step single-source"><div class="source-view-head"><b>PHOTO + REQUEST</b><span>${required} / 1 REQUIRED</span></div><div class="source-intake-layout"><div class="source-view-stage"><div class="source-view-title"><span>${String(state.sourceViewIndex + 1).padStart(2, '0')} / 06</span><b>${view.label}</b><small>${state.sourceViewIndex === 0 ? 'REQUIRED' : 'OPTIONAL'}</small></div><button class="single-view-upload ${source ? 'filled' : ''}" type="button" data-upload-input="${galleryInputId}" aria-label="${source ? 'Replace' : 'Add'} ${view.label} photo" aria-busy="${processing ? 'true' : 'false'}">${uploadContent}</button>${cameraInput}<input id="${galleryInputId}" data-view="${view.id}" type="file" accept="image/*" aria-label="${view.label} 갤러리 사진 선택">${intakeActions}<div class="source-view-nav"><button type="button" data-source-step="-1" aria-label="Previous view">←</button><nav class="source-view-dots" aria-label="Source views">${BOARD_VIEWS.map((item, index) => `<button type="button" data-source-view="${index}" class="${index === state.sourceViewIndex ? 'on' : ''} ${sourceViewComplete(item) ? 'done' : ''}" aria-label="${item.label}"><i></i></button>`).join('')}</nav><button type="button" data-source-step="1" aria-label="Next view">→</button></div></div><div class="source-intent"><label for="freePrompt"><b>REQUEST</b></label><textarea id="freePrompt" maxlength="500" placeholder="헤어 스타일 · 색상 · 시술 이력">${esc(state.freePrompt)}</textarea><section class="analysis-card ${state.analysisStatus}" aria-live="polite" aria-busy="${analyzing}"><div><b>AI HAIR ANALYSIS</b><span>${analysisStatusText()}</span></div><button id="reanalyze" type="button" ${requiredSourceViewsReady() && !analyzing ? '' : 'disabled'}>ANALYZE</button></section><details class="provider"><summary>API</summary><div class="cfg"><input id="baseURL" aria-label="API URL" placeholder="API URL" value="${esc(state.cfg.baseURL)}"><input id="model" aria-label="Image model" placeholder="IMAGE MODEL" value="${esc(state.cfg.model)}"><input id="analysisModel" aria-label="Analysis model" placeholder="ANALYSIS MODEL" value="${esc(state.cfg.analysisModel)}"><input id="size" aria-label="Size" placeholder="SIZE" value="${esc(state.cfg.size)}"><input id="apiKey" aria-label="API key" placeholder="API KEY" type="password" value="${esc(state.cfg.apiKey)}"></div></details><div class="source-next"><button class="next-button" id="toStructures" data-ready="${ready ? 'true' : 'false'}" ${ready ? '' : 'disabled'}>${state.structurePreparing ? 'PREPARING…' : 'GENERATE 100'}</button></div></div></div></section>`;
}

function toneLabel(toneId) {
  if (toneId === PRESERVE_CURRENT_TONE_ID) return '현재 색상 유지';
  return HAIR_COLOR_TONES.find((tone) => tone.id === toneId)?.labelKo || toneId || '미선택';
}
const COLOR_RESEMBLANCE = Object.freeze({
  subtle: Object.freeze({ label: '은은하게', percent: 55, prompt: 'softly approximate the selected swatch while retaining some of the current undertone' }),
  balanced: Object.freeze({ label: '적당히 비슷하게', percent: 75, prompt: 'clearly resemble the selected swatch while preserving natural depth and variation' }),
  vivid: Object.freeze({ label: '선택색에 가깝게', percent: 90, prompt: 'closely match the selected swatch without flattening natural roots, depth or highlights' })
});
function colorResemblance(value) { return COLOR_RESEMBLANCE[value] || COLOR_RESEMBLANCE.subtle; }

function selectedTargetToneIds() {
  const current = state.hairColorProfile.currentToneId;
  return [...new Set(state.hairColorProfile.selectedToneIds.map((toneId) => toneId === PRESERVE_CURRENT_TONE_ID ? current : toneId).filter((toneId) => toneId && toneId !== 'unknown'))];
}


function currentStageStatus() { return ''; }

function renderStructure() {
  const slots = state.structureSlots.length ? state.structureSlots : Array.from({ length: 100 }, (_, slotIndex) => ({ slotIndex, status: 'queued' }));
  return panel('STRUCTURE', `<div class="toolbar"><div class="stats"><span class="pill">ALL 500</span><span class="pill">PROFILE ${state.filteredGroups.length}</span><span class="pill">100 PICKS</span><span class="pill">RANDOM FILL</span><span class="pill">SELECT ${state.shortlist.size}/6</span></div><button class="next-button" id="toAgreement" ${state.shortlist.size ? '' : 'disabled'}>LOCK</button></div><div class="structure-board">${slots.map(structureTile).join('')}</div>`);
}

function visualHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
const MOSAIC_TILE_CLASSES = Object.freeze(['mosaic-3x3', 'mosaic-2x3', 'mosaic-2x2', 'mosaic-2x1', 'mosaic-1x2']);
function mosaicTileClass(slot, aspectRatio = 0) {
  const variant = (slot.startRank ?? visualHash(`${state.sourceKey}:${slot.designId || ''}:${slot.slotIndex}:mosaic`)) % 20;
  if (aspectRatio > 0 && aspectRatio < 0.9) return variant % 4 === 0 ? 'mosaic-2x3' : 'mosaic-1x2';
  if (aspectRatio >= 0.9 && aspectRatio < 1.25) return ['mosaic-1x2', 'mosaic-2x3', 'mosaic-2x2'][variant % 3];
  if (aspectRatio >= 1.25) return ['mosaic-2x1', 'mosaic-2x2', 'mosaic-3x3'][variant % 3];
  if (variant < 2) return 'mosaic-3x3';
  if (variant < 5) return 'mosaic-2x3';
  if (variant < 9) return 'mosaic-2x2';
  if (variant < 13) return 'mosaic-2x1';
  return 'mosaic-1x2';
}
function fitMosaicTileToImage(image) {
  if (!image?.naturalWidth || !image.naturalHeight) return;
  const tile = image.closest('.structure-tile');
  if (!tile) return;
  const slot = state.structureSlots[Number(tile.dataset.structureTile)];
  if (!slot) return;
  tile.classList.remove(...MOSAIC_TILE_CLASSES);
  tile.classList.add(mosaicTileClass(slot, image.naturalWidth / image.naturalHeight));
}
function openImageLightbox(button) {
  const image = button?.querySelector('img');
  if (!image?.src) return;
  imageLightboxImage.src = image.src;
  imageLightboxImage.alt = image.alt || '확대 이미지';
  imageLightbox.hidden = false;
  document.body.classList.add('lightbox-open');
  document.querySelector('#imageLightboxClose')?.focus();
}
function closeImageLightbox() {
  imageLightbox.hidden = true;
  imageLightboxImage.removeAttribute('src');
  document.body.classList.remove('lightbox-open');
}


function structureTile(slot) {
  const record = state.recordsById.get(slot.designId);
  const group = record ? state.groupsByKey.get(recordGroupKey(record)) : null;
  const source = slot.previewUrl || sourceViewPreview(slot.sourceViewKey);
  const selected = state.shortlist.has(slot.designId);
  const ready = slot.status === 'done' && record;
  const number = String(slot.slotIndex + 1).padStart(2, '0');
  return `<article class="structure-tile ${mosaicTileClass(slot)} ${slot.status} ${selected ? 'selected' : ''}" data-structure-tile="${slot.slotIndex}"><button type="button" class="tile-image-button" data-preview-image aria-label="${number}번 이미지 크게 보기"><img src="${esc(source)}" alt="${ready ? esc(groupLabel(group)) : ''}"></button><input type="checkbox" aria-label="후보 선택 ${slot.slotIndex + 1}" data-short="${esc(slot.designId || '')}" ${selected ? 'checked' : ''} ${ready ? '' : 'disabled'}><span class="structure-meta"><b>${number}</b></span></article>`;
}

function groupLabel(group) { return `${group.lengthKo} · ${familiarStyleName(group.baseKo)} · ${group.frontKo}`; }
function groupStatus(sum) { return sum.impossible === sum.total ? 'impossible' : sum.possible > 0 ? 'possible' : 'conditional'; }
function recordGroupKey(record) { return canonicalStructureKey(record); }
function variationFromRecord(record) { return { id: record.id, designId: record.id, genderId: record.genderId, lengthId: record.lengthId, baseKo: record.baseKo, frontKo: record.frontKo, finishKo: record.finishKo, mood: '균형 있게', intensity: '균형 있게', finishRecord: record }; }

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


let analysisPromptTimer = 0;

function scheduleHairAnalysis() {
  clearTimeout(analysisPromptTimer);
  analysisPromptTimer = setTimeout(() => {
    if (requiredSourceViewsReady() && !state.sourceProcessing) runHairAnalysis().catch(() => {});
  }, 450);
}

function handleNextAction(event) {
  const button = event.target.closest('button');
  if (!button || !app.contains(button) || !['toStructures', 'toAgreement'].includes(button.id)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (button.disabled) return;
  if (button.id === 'toStructures') startStructureExplore();
  else if (button.id === 'toAgreement') { state.stage = 5; render(); }
}

app.addEventListener('click', handleNextAction, true);

function bind() {
  document.querySelector('#backToList')?.addEventListener('click', () => { state.stage = state.structureSlots.length ? 2 : 0; render(); });
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.stage); if (stageEnabled(next)) { state.stage = next; render(); } }));
  document.querySelectorAll('[data-view]').forEach((input) => input.addEventListener('change', loadBoardView));
  document.querySelectorAll('[data-upload-input]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.uploadInput}`)?.click()));
  document.querySelectorAll('[data-source-view]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Number(button.dataset.sourceView); render(); }));
  document.querySelectorAll('[data-source-step]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Math.max(0, Math.min(BOARD_VIEWS.length - 1, state.sourceViewIndex + Number(button.dataset.sourceStep))); render(); }));
  document.querySelector('#freePrompt')?.addEventListener('input', (event) => {
    state.freePrompt = event.target.value;
    state.mood = state.freePrompt;
    state.analysisStatus = state.analysis ? 'idle' : state.analysisStatus;
    invalidateGeneratedSurfaces('prompt-change');
    scheduleHairAnalysis();
  });
  document.querySelector('#reanalyze')?.addEventListener('click', () => runHairAnalysis({ force: true }).catch(() => {}));
  document.querySelectorAll('[data-preview-image]').forEach((button) => button.addEventListener('click', () => openImageLightbox(button)));
  document.querySelectorAll('[data-preview-image] img').forEach((image) => {
    const fit = () => fitMosaicTileToImage(image);
    if (image.complete && image.naturalWidth) requestAnimationFrame(fit);
    else image.addEventListener('load', fit, { once: true });
  });
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

function syncIntake() {
  state.freePrompt = val('freePrompt') || state.freePrompt;
  state.mood = state.freePrompt;
  if (document.querySelector('#baseURL')) {
    state.cfg = { baseURL: val('baseURL'), model: val('model'), analysisModel: val('analysisModel'), size: val('size'), apiKey: val('apiKey') };
    saveProviderConfig(state.cfg);
  }
}
function val(id) { return document.querySelector(`#${id}`)?.value ?? ''; }
function filterGroups() {
  const line = state.diagnosis.profileGender ?? 'U';
  return state.groups.filter((group) => line === 'U' || group.genderId === line);
}

function prepareGroupSummaries() {
  state.groupSummaries = new Map();
  for (const group of state.filteredGroups) state.groupSummaries.set(group.key, summarizeGroupFeasibility(group, state.diagnosis));
  const rank = { possible: 0, conditional: 1, impossible: 2 };
  state.filteredGroups.sort((a, b) => rank[groupStatus(state.groupSummaries.get(a.key))] - rank[groupStatus(state.groupSummaries.get(b.key))] || a.key.localeCompare(b.key));
}


function invalidateGeneratedSurfaces(reason) {
  cancelActiveBatch(reason);
  state.structureSlots = [];
  state.shortlist.clear();
}

function applyHairAnalysis(value, source) {
  const analysis = normalizeHairAnalysis(value, { freePrompt: state.freePrompt, source });
  state.analysis = analysis;
  state.diagnosis = normalizeDiagnosis(hairAnalysisToDiagnosis(analysis));
  state.settings = normalizeSettings(hairAnalysisToExploreSettings(analysis));
  state.hairColorProfile = normalizeHairColorProfile(hairAnalysisToColorProfile(analysis));
  state.mood = state.freePrompt;
  reconcileHairColorProfile();
  return analysis;
}

async function runHairAnalysis({ force = false } = {}) {
  if (!requiredSourceViewsReady() || state.sourceProcessing) return null;
  syncIntake();
  const sourceKeyAtStart = state.sourceKey;
  const promptAtStart = state.freePrompt;
  if (!force && state.analysis && state.analysis.promptIntent === promptAtStart && ['done', 'fallback'].includes(state.analysisStatus)) return state.analysis;
  state.analysisController?.abort();
  const controller = new AbortController();
  const version = ++state.analysisVersion;
  state.analysisController = controller;
  state.analysisStatus = 'analyzing';
  render();
  let localToneId = state.hairColorDetection.toneId;
  try {
    const detection = await detectCurrentHairTone('front');
    if (!detection.stale && detection.toneId !== 'unknown') localToneId = detection.toneId;
  } catch {
    state.hairColorDetection = { status: 'failed', source: 'auto', toneId: 'unknown', confidence: 0 };
  }
  if (controller.signal.aborted || version !== state.analysisVersion || sourceKeyAtStart !== state.sourceKey || promptAtStart !== state.freePrompt) return null;
  const fallback = defaultHairAnalysis({ currentToneId: localToneId, promptIntent: promptAtStart });
  const cfg = resolvedProviderConfig();
  let result = fallback;
  let status = 'fallback';
  if (cfg.baseURL && cfg.apiKey && cfg.apiKey !== 'YOUR_PROXY_API_KEY') {
    try {
      const provider = await requestHairAnalysis({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, model: cfg.analysisModel, imageDataUrl: state.originalJpegDataUrl, freePrompt: promptAtStart, signal: controller.signal });
      result = normalizeHairAnalysis({ ...provider, currentToneId: provider.currentToneId === 'unknown' ? localToneId : provider.currentToneId }, { freePrompt: promptAtStart, source: 'provider' });
      status = 'done';
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return null;
    }
  }
  if (controller.signal.aborted || version !== state.analysisVersion || sourceKeyAtStart !== state.sourceKey || promptAtStart !== state.freePrompt) return null;
  applyHairAnalysis(result, status === 'done' ? 'provider' : 'fallback');
  state.analysisStatus = status;
  state.analysisController = null;
  render();
  return state.analysis;
}


async function startStructureExplore() {
  if (state.structurePreparing) return;
  state.error = '';
  try {
    syncIntake();
    if (!requiredSourceViewsReady()) throw new Error('FRONT REQUIRED · FRONT 사진을 먼저 추가하세요.');
    await runHairAnalysis();
    const cfg = resolvedProviderConfig();
    if (!cfg.baseURL || !cfg.apiKey || cfg.apiKey === 'YOUR_PROXY_API_KEY') throw new Error('API REQUIRED · SOURCE의 API 설정을 확인하세요.');
    state.structurePreparing = true;
    render();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await ensureCatalog();
    state.filteredGroups = filterGroups();
    prepareGroupSummaries();
    const selection = selectConsultationStructureDesignIds(state.filteredGroups, state.diagnosis, {
      sourceViewKeys: availableSourceViewKeys(),
      hairColorProfile: state.hairColorProfile,
      mood: state.mood,
      preferences: { mood: state.mood, maintenance: 'medium' },
      seedInput: `${state.sourceKey}:structure:${state.freePrompt}:${state.analysis?.summaryKo || ''}`
    });
    cancelActiveBatch('structure-refresh');
    state.shortlist.clear();
    state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `structure-${Date.now()}`, designIds: selection.designIds, generationAxes: selection.generationAxes, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'structure', diversityRelaxations: selection.diversityRelaxations } }), 'structure');
    state.structureSlots = state.batch.slots;
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
  const loadVersion = ++sourceLoadVersion;
  state.analysisController?.abort();
  state.analysisVersion += 1;
  state.analysisController = null;
  state.analysis = null;
  state.analysisStatus = 'idle';
  state.error = '';
  invalidateGeneratedSurfaces('source-change');
  state.originalFile = file;
  state.originalDataUrl = '';
  state.originalJpegDataUrl = '';
  state.originalJpegBlob = null;
  state.sourceViews.front = '';
  state.sourceViewBlobs.front = null;
  state.sourceKey = '';
  state.shortlist.clear();
  clearProviderInputCache('front');
  replaceHairColorProfile({ currentToneId: 'unknown', selectedToneIds: [PRESERVE_CURRENT_TONE_ID] });
  state.hairColorDetection = { status: 'idle', source: 'none', toneId: 'unknown', confidence: 0 };
  state.sourceProcessing = true;
  render();
  const previewPromise = fileToDataUrl(file);
  const preparationPromise = prepareOriginalJpeg(file).then((value) => ({ value }), (error) => ({ error }));
  try {
    const originalDataUrl = await previewPromise;
    if (loadVersion !== sourceLoadVersion) return;
    state.originalDataUrl = originalDataUrl;
    state.sourceViews.front = originalDataUrl;
    render();
    const preparation = await preparationPromise;
    if (preparation.error) throw preparation.error;
    const prepared = preparation.value;
    if (loadVersion !== sourceLoadVersion) return;
    state.originalJpegDataUrl = prepared.dataUrl;
    state.originalJpegBlob = prepared.blob;
    state.sourceViewBlobs.front = prepared.blob;
    state.sourceViews.front = prepared.dataUrl;
    state.sourceKey = await sourcePhotoKey(new Uint8Array(await prepared.blob.arrayBuffer()), prepared.blob.type);
    if (loadVersion !== sourceLoadVersion) return;
    state.sourceProcessing = false;
    state.analysisStatus = 'analyzing';
    render();
    runHairAnalysis({ force: true }).catch(() => {
      if (loadVersion === sourceLoadVersion) {
        applyHairAnalysis(defaultHairAnalysis({ promptIntent: state.freePrompt }), 'fallback');
        state.analysisStatus = 'fallback';
        render();
      }
    });
  } catch {
    if (loadVersion !== sourceLoadVersion) return;
    state.sourceProcessing = false;
    state.hairColorDetection = { status: 'failed', source: 'auto', toneId: 'unknown', confidence: 0 };
    state.error = 'IMAGE ERROR';
    render();
  }
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
    analysisModel: state.cfg.analysisModel || local.analysisModel || DEFAULT_HAIR_ANALYSIS_MODEL,
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


function syncBatchSurface() {
  state.structureSlots = state.batch?.slots || [];
}

function renderActiveBatchSurface() {
  if (state.stage === 2) render();
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
  } finally {
    state.running.delete(jobKey);
    state.controllers.delete(jobKey);
    if (state.batch?.batchId === batchId) {
      syncBatchSurface();
      const queued = state.batch.slots.some((slot) => slot.status === 'queued');
      const active = state.batch.slots.some((slot) => slot.status === 'active');
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
  const axes = item.generationAxes || {};
  const viewKey = item.sourceViewKey || axes.sourceViewKey || 'front';
  const currentToneId = state.hairColorProfile.currentToneId;
  const targetToneId = axes.colorToneId || currentToneId;
  const resemblance = colorResemblance(axes.colorIntensity || state.hairColorProfile.intensity);
  const preserveVisibleColor = targetToneId === PRESERVE_CURRENT_TONE_ID || currentToneId === 'unknown';
  const colorRule = preserveVisibleColor || targetToneId === currentToneId
    ? `COLOR: preserve the exact visible current hair tone${currentToneId === 'unknown' ? '' : ` (${toneLabel(currentToneId)})`}. No global color grading.`
    : `COLOR: change hair from ${toneLabel(currentToneId)} toward ${toneLabel(targetToneId)}. RESEMBLANCE STRENGTH: ${resemblance.percent}% — ${resemblance.prompt}. Keep roots, depth and highlights natural; no global color grading.`;
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
    `CURRENT HAIR: ${state.diagnosis.naturalTexture}, damage ${state.diagnosis.damage}.`,
    state.freePrompt ? `USER REQUEST: ${state.freePrompt}` : '',
    state.analysis?.summaryKo ? `AUTOMATIC HAIR ANALYSIS: ${state.analysis.summaryKo}. Confidence ${Math.round(state.analysis.confidence * 100)}%.` : '',
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
function agreementPayload(includeOriginal) { const first = state.recordsById.get([...state.shortlist][0]); return { ...(includeOriginal ? { originalFrontDataUrl: state.originalJpegDataUrl, sourceViews: { ...state.sourceViews, front: state.originalJpegDataUrl } } : {}), currentDesignIds: [...state.shortlist].slice(0, 6), settings: state.settings, diagnosis: state.diagnosis, hairColorProfile: state.hairColorProfile, decision: { freePrompt: state.freePrompt, selectedStructureKey: first ? canonicalStructureKey(first) : undefined }, catalogVersion, promptVersion }; }
function downloadJson() { const blob = new Blob([JSON.stringify(agreementPayload(false), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hairloom-consultation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function handoff() { const payload = buildConsultationHandoff(agreementPayload(true)); sessionStorage.setItem(CONSULTATION_HANDOFF_STORAGE_KEY, JSON.stringify(payload)); location.href = CONSULTATION_HANDOFF_QUERY_TRIGGER; }
function loadProviderConfig() { try { const cfg = JSON.parse(localStorage.getItem('HAIR_IMAGEN_CFG') || '{}'); return { baseURL: cfg.baseURL || '', model: cfg.model || 'gpt-image-2', analysisModel: cfg.analysisModel || DEFAULT_HAIR_ANALYSIS_MODEL, size: cfg.size || '1024x1024', apiKey: sessionStorage.getItem('HAIR_IMAGEN_KEY') || '' }; } catch { localStorage.removeItem('HAIR_IMAGEN_CFG'); return { baseURL: '', model: 'gpt-image-2', analysisModel: DEFAULT_HAIR_ANALYSIS_MODEL, size: '1024x1024', apiKey: '' }; } }
function saveProviderConfig(cfg) { localStorage.setItem('HAIR_IMAGEN_CFG', JSON.stringify({ baseURL: cfg.baseURL, model: cfg.model, analysisModel: cfg.analysisModel, size: cfg.size })); if (cfg.apiKey) sessionStorage.setItem('HAIR_IMAGEN_KEY', cfg.apiKey); else sessionStorage.removeItem('HAIR_IMAGEN_KEY'); }

document.querySelector('#imageLightboxClose')?.addEventListener('click', closeImageLightbox);
imageLightbox?.addEventListener('click', (event) => { if (event.target === imageLightbox) closeImageLightbox(); });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !imageLightbox.hidden) closeImageLightbox(); });
render();
(globalThis.requestIdleCallback || ((callback) => setTimeout(callback, 120)))(() => ensureCatalog().catch(() => {}));
