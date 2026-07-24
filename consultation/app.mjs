import { catalogVersion, promptVersion, hydrateCatalogPayload, normalizeProviderResult, normalizeSettings, sourcePhotoKey } from '../src/exploreCore.mjs';
import {
  CONSULTATION_HANDOFF_STORAGE_KEY,
  CONSULTATION_HANDOFF_QUERY_TRIGGER,
  CONSULTATION_INITIAL_ACTIVE,
  CONSULTATION_HARD_MAX_ACTIVE,
  normalizeDiagnosis,
  buildConsultationGroups,
  expandConsultationGroup,
  evaluateVariation,
  summarizeGroupFeasibility,
  selectConsultationStructureDesignIds,
  rankConsultationVariations,
  selectConsultationDesignIds,
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
  originalFile: null,
  originalDataUrl: '',
  originalJpegDataUrl: '',
  originalJpegBlob: null,
  sourceViews: { front: '', side: '', back: '', crown: '', nape: '', detail: '' },
  sourceViewBlobs: { front: null, side: null, back: null, crown: null, nape: null, detail: null },
  sourceViewMasks: new Map(),
  sourceViewIndex: 0,
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
  structureStatus: '',
  selectedGroup: null,
  variations: [],
  ranked: [],
  selectedVariation: null,
  diagnosis: {},
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
  { label: '매우 짧음', actualLengthCm: 4, currentLength: 0 },
  { label: '짧은 머리', actualLengthCm: 10, currentLength: 1 },
  { label: '중간', actualLengthCm: 20, currentLength: 2 },
  { label: '긴 머리', actualLengthCm: 35, currentLength: 3 },
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

function render() {
  const step = state.stage + 1;
  app.innerHTML = h`<div class="workspace">
    <aside class="rail">
      <button class="brand" id="backToList" type="button" aria-label="Back to structure list">H</button>
      <nav class="stages" aria-label="Progress">${stages.map((label, index) => `<button class="stage" aria-label="${label}" aria-current="${state.stage === index}" data-stage="${index}" ${stageEnabled(index) ? '' : 'disabled'}><i></i></button>`).join('')}</nav>
      <div class="rail-count"><b>${String(step).padStart(2, '0')}</b><span>/ 06</span></div>
    </aside>
    <main class="content">
      <header class="content-head"><b>HAIRLOOM PRO</b><span>${String(step).padStart(2, '0')} / 06 · ${stages[state.stage]}</span></header>
      ${state.error ? `<div class="status-banner error" role="alert">${esc(state.error)}</div>` : currentStageStatus() ? `<div class="status-banner" role="status">${esc(currentStageStatus())}</div>` : ''}
      ${[renderSource, renderProfile, renderStructure, renderVariations, renderCompare, renderAgreement][state.stage]()}
    </main>
  </div>`;
  bind();
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
  if (Number.isInteger(setting) && setting >= 0 && setting < LENGTH_OPTIONS.length) return setting;
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

function assignBatchSourceViews(batch, purpose) {
  return assignConsultationSourceViews(batch, availableSourceViewKeys(), `${state.sourceKey}:${purpose}`);
}

function renderSource() {
  const gender = state.diagnosis.profileGender ?? 'F';
  const view = BOARD_VIEWS[state.sourceViewIndex] ?? BOARD_VIEWS[0];
  const source = sourceViewSource(view);
  const required = state.originalJpegDataUrl ? 1 : 0;
  return `<section class="source-step single-source"><div class="source-view-head"><b>VIEWS</b><span>${required} / 1 REQUIRED</span></div><div class="source-view-stage"><div class="source-view-title"><span>${String(state.sourceViewIndex + 1).padStart(2, '0')} / 06</span><b>${view.label}</b><small>${state.sourceViewIndex === 0 ? 'REQUIRED' : 'OPTIONAL'}</small></div><label class="single-view-upload ${source ? 'filled' : ''}" for="view-${view.id}">${source ? `<img src="${esc(source)}" alt="${view.label}">` : `<span>＋</span><small>ADD ${view.label}</small>`}</label><input id="view-${view.id}" data-view="${view.id}" type="file" accept="image/*" aria-label="${view.label}"><div class="source-view-nav"><button type="button" data-source-step="-1" aria-label="Previous view">←</button><nav class="source-view-dots" aria-label="Source views">${BOARD_VIEWS.map((item, index) => `<button type="button" data-source-view="${index}" class="${index === state.sourceViewIndex ? 'on' : ''} ${sourceViewComplete(item) ? 'done' : ''}" aria-label="${item.label}"><i></i></button>`).join('')}</nav><button type="button" data-source-step="1" aria-label="Next view">→</button></div></div><div class="source-footer"><div class="profile-switch" aria-label="Profile"><button data-gender="F" class="${gender === 'F' ? 'on' : ''}">FEMALE</button><button data-gender="M" class="${gender === 'M' ? 'on' : ''}">MALE</button></div><button class="next-button" id="toProfile" ${requiredSourceViewsReady() ? '' : 'disabled'}>NEXT</button></div></section>`;
}

function renderProfile() {
  return `<section class="profile-step">
    <div class="settings-grid">${currentLengthSetting()}${DIAGNOSIS_DEFINITIONS.map(rangeSetting).join('')}</div>
    <label class="mood-field" for="mood"><span>MOOD</span><textarea id="mood" placeholder="SOFT · CLEAN">${esc(state.mood)}</textarea></label>
    <details class="provider"><summary>API</summary><div class="cfg"><input id="baseURL" aria-label="API URL" placeholder="API URL" value="${esc(state.cfg.baseURL)}"><input id="model" aria-label="Model" placeholder="MODEL" value="${esc(state.cfg.model)}"><input id="size" aria-label="Size" placeholder="SIZE" value="${esc(state.cfg.size)}"><input id="apiKey" aria-label="API key" placeholder="API KEY" type="password" value="${esc(state.cfg.apiKey)}"></div></details>
    <div class="actions"><button class="next-button" id="toStructures">NEXT</button></div>
  </section>`;
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

function structureTile(slot) {
  const record = state.recordsById.get(slot.designId);
  const group = record ? state.groupsByKey.get(recordGroupKey(record)) : null;
  const source = slot.previewUrl || sourceViewPreview(slot.sourceViewKey);
  const selected = group && state.selectedGroup?.key === group.key;
  const ready = slot.status === 'done' && group;
  return `<button class="structure-tile ${slot.status} ${selected ? 'selected' : ''}" data-structure-slot="${slot.slotIndex}" ${ready ? '' : 'disabled'}><img src="${esc(source)}" alt="${ready ? esc(groupLabel(group)) : ''}"><span class="structure-meta"><b>${ready ? esc(groupLabel(group)) : String(slot.slotIndex + 1).padStart(2, '0')}</b><small>${esc((slot.sourceViewKey || 'front').toUpperCase())} · ${statusKo(slot.status)}</small></span></button>`;
}

function groupLabel(group) { return `${group.lengthKo} · ${group.baseKo} · ${group.frontKo}`; }
function groupStatus(sum) { return sum.impossible === sum.total ? 'impossible' : sum.possible > 0 ? 'possible' : 'conditional'; }
function recordGroupKey(record) { return [record.genderId, record.lengthId, record.baseKo, record.frontKo].join('|'); }
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
  const source = slot.previewUrl || sourceViewPreview(slot.sourceViewKey);
  const checked = state.shortlist.has(slot.designId) ? 'checked' : '';
  return `<div class="slot ${slot.status}" data-slot="${slot.slotIndex}"><div class="image"><img src="${esc(source)}" alt="${slot.status === 'done' ? esc(slot.designId) : ''}"></div><input type="checkbox" aria-label="후보 선택 ${slot.slotIndex + 1}" data-short="${esc(slot.designId || '')}" ${checked} ${slot.status === 'done' ? '' : 'disabled'}><div class="meta">${String(slot.slotIndex + 1).padStart(2, '0')} · ${esc((slot.sourceViewKey || 'front').toUpperCase())} · ${esc(slot.designId || '대기')} · ${statusKo(slot.status)}</div></div>`;
}

function renderAgreement() {
  const ids = [...state.shortlist].slice(0, 6);
  const exportPayload = agreementPayload(false);
  return panel('LOCK', `<div class="stats"><span class="pill">SELECT ${ids.length}/6</span><span class="pill">NO IMAGE EXPORT</span></div><div class="shortlist">${ids.map(shortCard).join('')}</div><pre class="notice">${esc(JSON.stringify(exportPayload, null, 2))}</pre><div class="actions"><button id="print">PRINT</button><button id="downloadJson" class="secondary">JSON</button><button id="handoff">DESIGN LOCK</button></div>`);
}
function shortCard(id) {
  const record = state.records.find((r) => r.id === id);
  const ev = record ? evaluateVariation(variationFromRecord(record), state.diagnosis) : { status: 'possible', reasons: [] };
  return `<article class="card"><h3>${esc(id)}</h3><div class="metrics"><span class="metric ${statusClass(ev.status)}">${statusKo(ev.status)}</span><span class="metric">${esc(record?.nameKo || '')}</span></div><div class="mini">${esc((ev.reasons || ['선택']).slice(0, 2).join(' · '))}</div></article>`;
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

function bind() {
  document.querySelector('#backToList')?.addEventListener('click', () => { state.stage = state.structureSlots.length ? 2 : 0; render(); });
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.stage); if (stageEnabled(next)) { state.stage = next; render(); } }));
  document.querySelectorAll('[data-view]').forEach((input) => input.addEventListener('change', loadBoardView));
  document.querySelectorAll('[data-source-view]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Number(button.dataset.sourceView); render(); }));
  document.querySelectorAll('[data-source-step]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Math.max(0, Math.min(BOARD_VIEWS.length - 1, state.sourceViewIndex + Number(button.dataset.sourceStep))); render(); }));
  document.querySelectorAll('[data-gender]').forEach((button) => button.addEventListener('click', () => { state.diagnosis.profileGender = button.dataset.gender; invalidateGeneratedSurfaces('profile-change'); render(); }));
  document.querySelector('#toProfile')?.addEventListener('click', () => { if (requiredSourceViewsReady()) { state.stage = 1; render(); } });
  document.querySelectorAll('.dot-range').forEach((input) => input.addEventListener('input', () => updateDiagnosisRange(input)));
  document.querySelector('#mood')?.addEventListener('input', (event) => { state.mood = event.target.value; if (state.structureSlots.length || state.batch) invalidateGeneratedSurfaces('profile-change'); });
  document.querySelector('#toStructures')?.addEventListener('click', startStructureExplore);
  document.querySelectorAll('[data-structure-slot]').forEach((button) => button.addEventListener('click', () => selectStructureSlot(Number(button.dataset.structureSlot))));
  document.querySelector('#toVariations')?.addEventListener('click', () => { hydrateVariations(); state.stage = 3; render(); });
  document.querySelector('#mood2')?.addEventListener('input', (event) => { const { selectionStart, selectionEnd } = event.target; state.mood = event.target.value; clearTimeout(moodRankTimer); moodRankTimer = setTimeout(() => { if (state.stage !== 3) return; state.ranked = rankFeasibleVariations(state.variations); state.variationPage = 0; state.selectedVariation = state.ranked.find((variation) => evaluateVariation(variation, state.diagnosis).status !== 'impossible') || null; render(); restoreTextFocus('mood2', selectionStart, selectionEnd); }, 350); });
  document.querySelector('#prevVariation')?.addEventListener('click', () => { state.variationPage = Math.max(0, state.variationPage - 1); render(); });
  document.querySelector('#nextVariation')?.addEventListener('click', () => { const pages = Math.max(1, Math.ceil(state.ranked.length / 72)); state.variationPage = Math.min(pages - 1, state.variationPage + 1); render(); });
  document.querySelectorAll('[data-var]').forEach((button) => button.addEventListener('click', () => { state.selectedVariation = state.ranked.find((variation) => String(variation.id) === button.dataset.var); render(); }));
  document.querySelector('#toCompare')?.addEventListener('click', startCompare);
  document.querySelectorAll('[data-short]').forEach((input) => input.addEventListener('change', toggleShort));
  document.querySelector('#toAgreement')?.addEventListener('click', () => { state.stage = 5; render(); });
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
  const index = Number(document.querySelector(`#${id}`)?.value ?? definition.defaultIndex);
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
    return;
  }
  const definition = DIAGNOSIS_DEFINITIONS.find((item) => item.id === input.dataset.setting);
  const serialized = definition.values[value];
  document.querySelector(`#${definition.id}Value`).textContent = definition.labels[value];
  if (definition.id === 'recentPerm') state.diagnosis.monthsSincePerm = serialized;
  else state.diagnosis[definition.id] = serialized;
}

function syncIntake() {
  const lengthOption = LENGTH_OPTIONS[Math.max(0, Math.min(LENGTH_OPTIONS.length - 1, Number(val('currentLength') || currentLengthOptionIndex())))];
  state.diagnosis = normalizeDiagnosis({ profileGender: state.diagnosis.profileGender ?? 'F', actualLengthCm: lengthOption.actualLengthCm, naturalTexture: settingValue('naturalTexture'), density: settingValue('density'), damage: settingValue('damage'), bleachCount: settingValue('bleachCount'), monthsSincePerm: settingValue('recentPerm'), extensionAllowed: settingValue('extensionAllowed') });
  state.settings = normalizeSettings({ currentLength: lengthOption.currentLength, hairThickness: densityToThickness[state.diagnosis.density] || 'normal', damageCondition: damageMap[state.diagnosis.damage] || 'medium', permAllowed: state.diagnosis.monthsSincePerm >= 3, extensionAllowed: Boolean(state.diagnosis.extensionAllowed), similarity: 2 });
  state.mood = val('mood') || state.mood;
  state.cfg = { baseURL: val('baseURL'), model: val('model'), size: val('size'), apiKey: val('apiKey') };
  saveProviderConfig(state.cfg);
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
  state.error = '';
  try {
    syncIntake();
    if (!requiredSourceViewsReady()) throw new Error('FRONT REQUIRED');
    const cfg = resolvedProviderConfig();
    if (!cfg.baseURL || !cfg.apiKey || cfg.apiKey === 'YOUR_PROXY_API_KEY') throw new Error('API REQUIRED');
    await ensureCatalog();
    state.filteredGroups = filterGroups();
    prepareGroupSummaries();
    const { designIds } = selectConsultationStructureDesignIds(state.filteredGroups, state.diagnosis);
    cancelActiveBatch('structure-refresh');
    state.selectedGroup = null;
    state.selectedVariation = null;
    state.shortlist.clear();
    state.slots = [];
    state.status = '';
    state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `structure-${Date.now()}`, designIds, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'structure' } }), 'structure');
    state.structureSlots = state.batch.slots;
    state.structureActiveLimit = state.batch.activeLimit;
    state.structureStatus = '100 PICKS';
    state.stage = 2;
    render();
    pumpQueue();
  } catch (error) {
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
    state.sourceViewMasks.delete(role);
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
  try {
    invalidateGeneratedSurfaces('source-change');
    const prepared = await prepareOriginalJpeg(file);
    state.originalFile = file;
    state.originalDataUrl = await fileToDataUrl(file);
    state.originalJpegDataUrl = prepared.dataUrl;
    state.originalJpegBlob = prepared.blob;
    state.sourceViewBlobs.front = prepared.blob;
    state.sourceViewMasks.delete('front');
    state.sourceKey = await sourcePhotoKey(new Uint8Array(await prepared.blob.arrayBuffer()), prepared.blob.type);
    state.sourceViews.front = prepared.dataUrl;
    state.shortlist.clear();
  } catch {
    state.error = 'IMAGE ERROR';
  }
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

async function hairOnlyMask(viewKey) {
  if (state.sourceViewMasks.has(viewKey)) return state.sourceViewMasks.get(viewKey);
  const sourceBlob = state.sourceViewBlobs[viewKey];
  if (!(sourceBlob instanceof Blob)) throw new Error(`Missing source view: ${viewKey}`);
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    const objectUrl = URL.createObjectURL(sourceBlob);
    element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Mask source decode failed')); };
    element.src = objectUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const editableRegions = {
    front: [[0.5, 0.13, 0.31, 0.16], [0.24, 0.29, 0.1, 0.2], [0.76, 0.29, 0.1, 0.2]],
    side: [[0.5, 0.14, 0.33, 0.17], [0.24, 0.3, 0.11, 0.22], [0.76, 0.3, 0.11, 0.22]],
    back: [[0.5, 0.25, 0.37, 0.31]],
    crown: [[0.5, 0.42, 0.38, 0.36]],
    nape: [[0.5, 0.29, 0.36, 0.34]],
    detail: [[0.5, 0.5, 0.4, 0.42]]
  };
  const protectedRegions = {
    front: [[0.5, 0.45, 0.32, 0.38], [0.5, 0.24, 0.3, 0.17]],
    side: [[0.5, 0.47, 0.36, 0.4], [0.5, 0.25, 0.32, 0.18]],
    back: [[0.5, 0.67, 0.17, 0.24]],
    nape: [[0.5, 0.68, 0.18, 0.25]]
  };
  const paintRegions = (regions, operation, feather) => {
    context.save();
    context.globalCompositeOperation = operation;
    context.fillStyle = '#000';
    context.filter = feather ? `blur(${Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * feather))}px)` : 'none';
    for (const [x, y, rx, ry] of regions) {
      context.beginPath();
      context.ellipse(canvas.width * x, canvas.height * y, canvas.width * rx, canvas.height * ry, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };
  paintRegions(editableRegions[viewKey] ?? editableRegions.front, 'destination-out', 0.012);
  paintRegions(protectedRegions[viewKey] ?? [], 'source-over', 0.008);
  const mask = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Mask encode failed')), 'image/png'));
  state.sourceViewMasks.set(viewKey, mask);
  return mask;
}

async function compositeHairOnlyResult(resultUrl, sourceBlob, maskBlob, signal) {
  const response = await fetch(resultUrl, { signal });
  if (!response.ok) throw new Error('Generated image fetch failed');
  const generatedBlob = await response.blob();
  const loadImage = (blob) => new Promise((resolve, reject) => {
    const element = new Image();
    const objectUrl = URL.createObjectURL(blob);
    element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Composite image decode failed')); };
    element.src = objectUrl;
  });
  const [source, generated, mask] = await Promise.all([loadImage(sourceBlob), loadImage(generatedBlob), loadImage(maskBlob)]);
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const edited = document.createElement('canvas');
  edited.width = canvas.width;
  edited.height = canvas.height;
  const editedContext = edited.getContext('2d');
  editedContext.drawImage(generated, 0, 0, edited.width, edited.height);
  editedContext.globalCompositeOperation = 'destination-out';
  editedContext.drawImage(mask, 0, 0, edited.width, edited.height);
  context.drawImage(edited, 0, 0);
  const safeBlob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Composite encode failed')), 'image/png'));
  return { url: await blobToDataUrl(safeBlob), bytes: safeBlob.size, mimeType: 'image/png' };
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
  cancelActiveBatch('new-batch');
  const selected = selectConsultationDesignIds(state.records, state.settings, { seedInput: `${state.sourceKey}:${state.mood}`, centerDesignId: state.selectedVariation?.designId, diagnosis: state.diagnosis, mood: state.selectedVariation?.mood, intensity: state.selectedVariation?.intensity });
  state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `consult-${Date.now()}`, designIds: selected.designIds, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'compare', selectedVariationId: state.selectedVariation?.id } }), 'compare');
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

function consultationPrompt(record, viewKey) {
  const selected = state.selectedVariation;
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
    'OUTPUT CONTRACT: exactly ONE full-frame image and ONE person.',
    'PIXEL LOCK: every non-hair pixel must remain unchanged. Do not redraw, regenerate, beautify, retouch or reinterpret the face, facial shape, skin, eyes, eyebrows, nose, lips, jaw, ears, body, clothing, background, lighting or camera geometry.',
    'FACE LOCK: preserve exact identity, proportions, expression, gaze, skin texture and pixel alignment. No face slimming, eye enlargement, skin smoothing or symmetry correction.',
    'HAIRLINE LOCK: preserve the exact forehead, temples and visible hairline boundary. Never generate hair across protected skin.',
    'FACIAL HAIR LOCK: beard, mustache, sideburn boundary and eyebrows are not hairstyle edit targets and must remain exact source pixels.',
    'MASK CONTRACT: modify transparent mask pixels only. Opaque mask pixels are immutable source pixels.',
    viewRule,
    'PRESERVE SOURCE FRAME: no crop, zoom, enlargement, reframing, collage, split screen, duplicate person, inset or border.',
    `DESIGN ID: ${record.id}`,
    `STYLE: ${record.promptAtoms?.titleKo || record.nameKo}`,
    `STRUCTURE: ${record.promptAtoms?.structureKo || record.baseKo}`,
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
  const viewKey = item.sourceViewKey || 'front';
  const record = state.recordsById.get(designId);
  const sourceBlob = state.sourceViewBlobs[viewKey];
  if (!cfg.baseURL || !cfg.apiKey || !record || !(sourceBlob instanceof Blob)) return { ok: false, errorType: 'config', statusCode: 0 };
  const mask = await hairOnlyMask(viewKey);
  const form = new FormData();
  form.append('model', cfg.model);
  form.append('prompt', consultationPrompt(record, viewKey));
  form.append('size', cfg.size);
  form.append('quality', 'low');
  form.append('output_format', 'jpeg');
  form.append('output_compression', '70');
  form.append('image', sourceBlob, `${designId}-${viewKey}.jpg`);
  form.append('mask', mask, `${designId}-${viewKey}-hair-mask.png`);
  const response = await fetch(cfg.baseURL.replace(/\/+$/, '') + '/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}` }, body: form, signal });
  if (!response.ok) return { ok: false, errorType: 'http', statusCode: response.status };
  let payload;
  try { payload = await response.json(); } catch { return { ok: false, errorType: 'provider-shape', statusCode: response.status }; }
  const datum = payload?.data?.[0];
  const normalized = normalizeProviderResult(datum ? { ...datum, providerStatus: response.status } : null, { designId, batchId: state.batch?.batchId, slotIndex: item.slotIndex });
  if (!normalized.ok) return { ok: false, errorType: normalized.errorCode, statusCode: normalized.providerStatus || response.status };
  try {
    const safe = await compositeHairOnlyResult(normalized.url, sourceBlob, mask, signal);
    return { ...normalized, ...safe, providerKind: `${normalized.providerKind}-hair-mask-composite` };
  } catch (error) {
    return { ok: false, errorType: error?.name === 'AbortError' ? 'aborted' : 'composite', statusCode: 0 };
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
function agreementPayload(includeOriginal) { return { ...(includeOriginal ? { originalFrontDataUrl: state.originalJpegDataUrl, sourceViews: { ...state.sourceViews, front: state.originalJpegDataUrl } } : {}), currentDesignIds: [...state.shortlist].slice(0, 6), settings: state.settings, diagnosis: state.diagnosis, decision: { mood: state.mood, selectedGroup: state.selectedGroup?.key, selectedVariation: state.selectedVariation?.id }, catalogVersion, promptVersion }; }
function downloadJson() { const blob = new Blob([JSON.stringify(agreementPayload(false), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hairloom-consultation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function handoff() { const payload = buildConsultationHandoff(agreementPayload(true)); sessionStorage.setItem(CONSULTATION_HANDOFF_STORAGE_KEY, JSON.stringify(payload)); location.href = CONSULTATION_HANDOFF_QUERY_TRIGGER; }
function loadProviderConfig() { try { const cfg = JSON.parse(localStorage.getItem('HAIR_IMAGEN_CFG') || '{}'); return { baseURL: cfg.baseURL || '', model: cfg.model || 'gpt-image-2', size: cfg.size || '1024x1024', apiKey: sessionStorage.getItem('HAIR_IMAGEN_KEY') || '' }; } catch { localStorage.removeItem('HAIR_IMAGEN_CFG'); return { baseURL: '', model: 'gpt-image-2', size: '1024x1024', apiKey: '' }; } }
function saveProviderConfig(cfg) { localStorage.setItem('HAIR_IMAGEN_CFG', JSON.stringify({ baseURL: cfg.baseURL, model: cfg.model, size: cfg.size })); if (cfg.apiKey) sessionStorage.setItem('HAIR_IMAGEN_KEY', cfg.apiKey); else sessionStorage.removeItem('HAIR_IMAGEN_KEY'); }

render();
(globalThis.requestIdleCallback || ((callback) => setTimeout(callback, 120)))(() => ensureCatalog().catch(() => {}));
