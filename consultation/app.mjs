import { catalogVersion, promptVersion, hydrateCatalogPayload, normalizeSettings, sourcePhotoKey, genderLineTreatmentPrompt } from '../src/exploreCore.mjs';
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
  applyConsultationCompletion,
  supersedeConsultationBatch,
  buildConsultationHandoff
} from '../src/consultationCore.mjs';
import {
  defaultHairAnalysis,
  normalizeHairAnalysis,
  hairAnalysisToDiagnosis,
  hairAnalysisToExploreSettings,
  hairAnalysisToColorProfile
} from '../src/hairAnalysis.mjs';
import {
  providerStatus,
  configureProvider,
  clearProvider,
  createPreparedSource,
  deletePreparedSource,
  readPreparedSource,
  runNativeAnalysis,
  createNativeBatch,
  nativeBatchStatus,
  cancelNativeBatch,
  readNativeOutput,
  deleteAllCustomerData,
  onNativeBatchEvent
} from '../src/mobileProviderBridge.mjs';

const app = document.querySelector('#app');
const imageLightbox = document.querySelector('#imageLightbox');
const imageLightboxImage = document.querySelector('#imageLightboxImage');
const stageLabels = Object.freeze({ 0: 'SOURCE', 2: 'RESULTS', 5: 'LOCK' });
const visibleStages = Object.freeze([
  { label: 'SOURCE', stateIndex: 0 },
  { label: 'RESULTS', stateIndex: 2 },
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
  localProfile: null,
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
  nativeBatchId: '',
  nativeSources: new Map(),
  provider: { available: false, configured: false, provider: 'native-required', model: '', loading: true },
  settingsOpen: false,
  shortlist: new Set(),
  error: ''
};

function h(strings, ...values) {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
}
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const statusKo = (status) => status === 'possible' ? 'OK' : status === 'conditional' ? 'CHECK' : status === 'impossible' ? 'NO' : status === 'done' ? 'DONE' : status === 'failed' ? 'FAIL' : status === 'active' ? 'RUN' : status === 'retryable' ? 'RETRY' : 'WAIT';
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
  { id: 'front', label: '이미지 1' },
  { id: 'side', label: '이미지 2' },
  { id: 'back', label: '이미지 3' },
  { id: 'crown', label: '이미지 4' },
  { id: 'nape', label: '이미지 5' },
  { id: 'detail', label: '이미지 6' }
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
  const stageMarkup = ({ 0: renderSource, 2: renderStructure, 5: renderAgreement }[state.stage] || renderSource)();
  app.innerHTML = h`<div class="workspace">
    <aside class="rail">
      ${state.stage === 5 ? '<button class="brand" id="backToList" type="button" aria-label="Back to results">H</button>' : '<span class="brand" aria-hidden="true">H</span>'}
      <nav class="stages" aria-label="Progress">${visibleStages.filter(({ stateIndex }) => stageEnabled(stateIndex)).map(({ label, stateIndex }) => state.stage === stateIndex ? `<span class="stage" aria-label="${label}" aria-current="true"><i></i></span>` : `<button class="stage" aria-label="${label}" data-stage="${stateIndex}"><i></i></button>`).join('')}</nav>
    </aside>
    <main class="content" data-stage="${state.stage}">
      <header class="content-head"><b>HAIRLOOM</b><div><span>${currentStageLabel()}</span><button type="button" class="settings-trigger" id="openMobileSettings" aria-label="설정 열기" aria-expanded="${state.settingsOpen ? 'true' : 'false'}">설정</button></div></header>
      ${state.settingsOpen ? mobileSettingsPanel() : ''}
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

function mobileSettingsPanel() {
  if (!state.provider.available) return '<section class="mobile-settings-panel" aria-labelledby="mobileSettingsTitle"><div class="mobile-settings-head"><div><small>SETTINGS</small><b id="mobileSettingsTitle">API 설정</b></div><button type="button" id="closeMobileSettings" aria-label="설정 닫기">닫기</button></div><div class="mobile-settings-status unavailable"><i></i><div><b>모바일 앱에서 설정</b><span>API 키 입력은 Android·iOS 네이티브 앱에서만 열립니다. 브라우저에는 키를 입력하거나 저장하지 않습니다.</span></div></div></section>';
  const status = state.provider.configured
    ? `<div class="mobile-settings-status connected"><i></i><div><b>연결됨</b><span>${esc(state.provider.provider)} · ${esc(state.provider.model)}</span></div></div><button type="button" class="settings-primary" id="configureNativeProvider">API 키 변경</button><button type="button" class="settings-danger" id="clearNativeProvider">연결 삭제</button>`
    : '<div class="mobile-settings-status"><i></i><div><b>연결 안 됨</b><span>개인 OpenAI API 키를 기기의 보안 저장소에 등록하세요.</span></div></div><button type="button" class="settings-primary" id="configureNativeProvider">API 키 입력</button>';
  return `<section class="mobile-settings-panel" aria-labelledby="mobileSettingsTitle"><div class="mobile-settings-head"><div><small>SETTINGS</small><b id="mobileSettingsTitle">API 설정</b></div><button type="button" id="closeMobileSettings" aria-label="설정 닫기">닫기</button></div>${status}<p class="mobile-settings-note">키는 네이티브 보안 입력창에서만 처리되며 WebView·브라우저 저장소·로그에 전달되지 않습니다. ChatGPT 구독과 API 사용료는 별개입니다.</p><div class="mobile-settings-separator"></div><button type="button" class="settings-data" id="deleteNativeCustomerData">모든 고객 데이터 삭제</button><small class="mobile-settings-data-note">사진·생성 결과·대기열 기록을 삭제합니다. API 연결 삭제와는 별도입니다.</small></section>`;
}


function providerConnectionCard() {
  if (state.provider.loading) return '<div class="native-provider-card loading"><b>API 설정 확인 중</b><span>기기의 보안 연결 상태를 확인하고 있습니다.</span></div>';
  if (!state.provider.available) return '<div class="native-provider-card unavailable"><b>모바일 앱 필요</b><span>실제 분석·생성은 모바일 앱에서만 사용할 수 있습니다. 브라우저에는 API 키를 입력하지 않습니다.</span></div>';
  const status = state.provider.configured ? '<span class="provider-status-dot connected"></span><b>API 연결됨</b>' : '<span class="provider-status-dot"></span><b>API 연결 필요</b>';
  const description = state.provider.configured ? `${esc(state.provider.provider)} · ${esc(state.provider.model)}` : '설정에서 개인 OpenAI API 키를 안전하게 입력하세요.';
  return `<div class="native-provider-card ${state.provider.configured ? 'connected' : ''}"><div class="provider-card-status">${status}</div><span>${description}</span><button type="button" class="provider-settings-link" id="openProviderSettings">${state.provider.configured ? '설정 열기' : 'API 설정하기'}</button></div>`;
}


function renderSource() {
  const view = BOARD_VIEWS[state.sourceViewIndex] ?? BOARD_VIEWS[0];
  const source = sourceViewSource(view);
  const required = state.originalJpegDataUrl ? 1 : 0;
  const processing = state.sourceProcessing && view.id === 'front';
  const ready = requiredSourceViewsReady() && state.provider.configured && !state.sourceProcessing && !state.structurePreparing;
  const uploadContent = source ? `<img src="${esc(source)}" alt="${view.label}">` : processing ? '<span class="source-processing-mark">···</span><small>PREPARING PHOTO</small>' : `<span>＋</span><small>ADD ${view.label}</small>`;
  const galleryInputId = `view-${view.id}-gallery`;
  const cameraInput = view.id === 'front' ? '<input id="view-front-camera" data-view="front" type="file" accept="image/*" capture="user" aria-label="카메라로 정면 사진 촬영">' : '';
  const intakeActions = view.id === 'front'
    ? `<div class="source-intake-actions"><button type="button" data-upload-input="view-front-camera">카메라로 바로 촬영</button><button type="button" data-upload-input="${galleryInputId}">갤러리에서 선택</button></div>`
    : `<div class="source-intake-actions one"><button type="button" data-upload-input="${galleryInputId}">사진 선택</button></div>`;
  const previousButton = state.sourceViewIndex > 0 ? '<button type="button" data-source-step="-1" aria-label="Previous view">←</button>' : '<span></span>';
  const nextButton = state.sourceViewIndex < BOARD_VIEWS.length - 1 ? '<button type="button" data-source-step="1" aria-label="Next view">→</button>' : '<span></span>';
  const continueButton = ready ? '<button class="next-button source-photo-next" id="toStructures">NEXT</button>' : '';
  return `<section class="source-step single-source"><div class="source-view-head"><b>PHOTO + REQUEST</b><span>${required} / 1 REQUIRED</span></div><div class="source-intake-layout"><div class="source-view-stage"><div class="source-view-title"><span>${String(state.sourceViewIndex + 1).padStart(2, '0')} / 06</span><b>${view.label}</b><small>${state.sourceViewIndex === 0 ? 'REQUIRED' : 'OPTIONAL'}</small></div><button class="single-view-upload ${source ? 'filled' : ''}" type="button" data-upload-input="${galleryInputId}" aria-label="${source ? 'Replace' : 'Add'} ${view.label} photo" aria-busy="${processing ? 'true' : 'false'}">${uploadContent}</button>${cameraInput}<input id="${galleryInputId}" data-view="${view.id}" type="file" accept="image/*" aria-label="${view.label} 갤러리 사진 선택">${intakeActions}${continueButton}<div class="source-view-nav">${previousButton}<nav class="source-view-dots" aria-label="Source views">${BOARD_VIEWS.map((item, index) => index === state.sourceViewIndex ? `<span class="on ${sourceViewComplete(item) ? 'done' : ''}" aria-label="${item.label}" aria-current="true"><i></i></span>` : `<button type="button" data-source-view="${index}" class="${sourceViewComplete(item) ? 'done' : ''}" aria-label="${item.label}"><i></i></button>`).join('')}</nav>${nextButton}</div></div><div class="source-intent"><label for="freePrompt"><b>REQUEST</b></label><div class="request-card"><div class="request-tags" aria-hidden="true"><span>헤어스타일</span><span>색상</span><span>시술 이력</span></div><textarea id="freePrompt" maxlength="500" placeholder="원하는 내용을 자유롭게 적어주세요">${esc(state.freePrompt)}</textarea></div>${providerConnectionCard()}</div></div></section>`;
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
  const counts = slots.reduce((result, slot) => {
    result[slot.status] = (result[slot.status] || 0) + 1;
    return result;
  }, {});
  const progress = state.batch ? `<span class="pill">DONE ${counts.done || 0}</span><span class="pill">RUN ${counts.active || 0}</span><span class="pill">WAIT ${counts.queued || 0}</span><span class="pill retry-count">RETRY ${counts.retryable || 0}</span><span class="pill">FAIL ${counts.failed || 0}</span>` : '<span class="pill">100 PICKS</span><span class="pill">RANDOM FILL</span>';
  return panel('RESULTS', `<div class="toolbar"><div class="stats"><span class="pill">ALL 500</span><span class="pill">MATCH ${state.filteredGroups.length}</span>${progress}<span class="pill">SELECT ${state.shortlist.size}/6</span></div>${state.shortlist.size ? '<button class="next-button" id="toAgreement">LOCK</button>' : ''}</div><div class="structure-board">${slots.map(structureTile).join('')}</div>`);
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
  return `<article class="structure-tile ${mosaicTileClass(slot)} ${slot.status} ${selected ? 'selected' : ''}" data-structure-tile="${slot.slotIndex}"><button type="button" class="tile-image-button" data-preview-image aria-label="${number}번 이미지 크게 보기"><img src="${esc(source)}" alt="${ready ? esc(groupLabel(group)) : ''}"></button>${ready ? `<input type="checkbox" aria-label="후보 선택 ${slot.slotIndex + 1}" data-short="${esc(slot.designId || '')}" ${selected ? 'checked' : ''}>` : ''}<span class="structure-meta"><b>${number}</b></span></article>`;
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
  for (const [key, source] of state.nativeSources) {
    if (viewKey && !key.startsWith(`${viewKey}:`)) continue;
    state.nativeSources.delete(key);
    deletePreparedSource(source.sourceId).catch(() => {});
  }
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

async function refreshProviderConnection() {
  state.provider = { ...state.provider, loading: true };
  render();
  try {
    state.provider = { ...(await providerStatus()), loading: false };
  } catch {
    state.provider = { available: false, configured: false, provider: 'native-required', model: '', loading: false };
  }
  render();
}

function setMobileSettings(open) {
  state.settingsOpen = Boolean(open);
  render();
}

async function openProviderConnection() {
  state.error = '';
  try {
    await configureProvider();
  } catch (error) {
    if (error?.message !== 'cancelled' && error?.code !== 'cancelled') state.error = error?.message || 'API 설정을 확인해주세요.';
  }
  await refreshProviderConnection();
}

async function removeProviderConnection() {
  await clearProvider().catch(() => {});
  if (state.batch) {
    state.batch = {
      ...state.batch,
      slots: state.batch.slots.map((slot) => ['queued', 'active'].includes(slot.status) ? { ...slot, status: 'retryable' } : slot)
    };
    syncBatchSurface();
  }
  await refreshProviderConnection();
}

async function removeAllCustomerData() {
  if (!globalThis.confirm('준비된 원본, 생성 결과, 대기열 기록을 이 기기에서 모두 삭제할까요?')) return;
  state.error = '';
  try {
    await deleteAllCustomerData();
    localStorage.removeItem('HAIRLOOM_NATIVE_BATCH_ID');
    globalThis.location.reload();
  } catch (error) {
    state.error = error?.message || '고객 데이터를 삭제하지 못했습니다.';
    render();
  }
}

function bind() {
  document.querySelector('#openMobileSettings')?.addEventListener('click', () => setMobileSettings(!state.settingsOpen));
  document.querySelector('#openProviderSettings')?.addEventListener('click', () => setMobileSettings(true));
  document.querySelector('#closeMobileSettings')?.addEventListener('click', () => setMobileSettings(false));
  document.querySelector('#backToList')?.addEventListener('click', () => { state.stage = state.structureSlots.length ? 2 : 0; render(); });
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.stage); if (stageEnabled(next)) { state.stage = next; render(); } }));
  document.querySelectorAll('[data-view]').forEach((input) => input.addEventListener('change', loadBoardView));
  document.querySelectorAll('[data-upload-input]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.uploadInput}`)?.click()));
  document.querySelectorAll('[data-source-view]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Number(button.dataset.sourceView); render(); }));
  document.querySelectorAll('[data-source-step]').forEach((button) => button.addEventListener('click', () => { state.sourceViewIndex = Math.max(0, Math.min(BOARD_VIEWS.length - 1, state.sourceViewIndex + Number(button.dataset.sourceStep))); render(); }));
  document.querySelector('#configureNativeProvider')?.addEventListener('click', openProviderConnection);
  document.querySelector('#clearNativeProvider')?.addEventListener('click', removeProviderConnection);
  document.querySelector('#deleteNativeCustomerData')?.addEventListener('click', removeAllCustomerData);
  document.querySelector('#freePrompt')?.addEventListener('input', (event) => {
    state.freePrompt = event.target.value;
    state.mood = state.freePrompt;
    applyLocalProfile(state.hairColorDetection.toneId);
    invalidateGeneratedSurfaces('prompt-change');
  });
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

function applyLocalProfile(currentToneId = state.hairColorDetection.toneId) {
  const profile = normalizeHairAnalysis(defaultHairAnalysis({ currentToneId, promptIntent: state.freePrompt }), { freePrompt: state.freePrompt, source: 'fallback' });
  state.localProfile = profile;
  state.diagnosis = normalizeDiagnosis(hairAnalysisToDiagnosis(profile));
  state.settings = normalizeSettings(hairAnalysisToExploreSettings(profile));
  state.hairColorProfile = normalizeHairColorProfile(hairAnalysisToColorProfile(profile));
  state.mood = state.freePrompt;
  reconcileHairColorProfile();
  return profile;
}

function applyProviderProfile(raw, currentToneId = state.hairColorDetection.toneId) {
  const profile = normalizeHairAnalysis({
    ...raw,
    currentToneId: currentToneId && currentToneId !== 'unknown' ? currentToneId : raw?.currentToneId,
    promptIntent: state.freePrompt
  }, { freePrompt: state.freePrompt, source: 'provider' });
  state.localProfile = profile;
  state.diagnosis = normalizeDiagnosis(hairAnalysisToDiagnosis(profile));
  state.settings = normalizeSettings(hairAnalysisToExploreSettings(profile));
  state.hairColorProfile = normalizeHairColorProfile(hairAnalysisToColorProfile(profile));
  state.mood = state.freePrompt;
  reconcileHairColorProfile();
  return profile;
}

async function analyzePreparedFront() {
  const source = await ensureNativeSource({ sourceViewKey: 'front', generationAxes: { sourceViewKey: 'front', mirrored: false } });
  const raw = await runNativeAnalysis({ sourceId: source.sourceId, sourceHash: source.sourceHash, freePrompt: state.freePrompt });
  return applyProviderProfile(raw);
}


async function startStructureExplore() {
  if (state.structurePreparing) return;
  state.error = '';
  try {
    syncIntake();
    if (!requiredSourceViewsReady()) throw new Error('FRONT REQUIRED · FRONT 사진을 먼저 추가하세요.');
    applyLocalProfile();
    if (!state.provider.configured) throw new Error('이미지 생성 연결을 먼저 완료해주세요.');
    state.structurePreparing = true;
    render();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try { await analyzePreparedFront(); } catch { /* Conservative local profile remains the fail-closed fallback. */ }
    await ensureCatalog();
    state.filteredGroups = filterGroups();
    prepareGroupSummaries();
    const selection = selectConsultationStructureDesignIds(state.filteredGroups, state.diagnosis, {
      sourceViewKeys: availableSourceViewKeys(),
      hairColorProfile: state.hairColorProfile,
      mood: state.mood,
      preferences: { mood: state.mood, maintenance: 'medium' },
      seedInput: `${state.sourceKey}:structure:${state.freePrompt}:${state.localProfile?.summaryKo || ''}`
    });
    cancelActiveBatch('structure-refresh');
    state.shortlist.clear();
    state.batch = assignBatchSourceViews(createConsultationBatch({ batchId: `structure-${Date.now()}`, designIds: selection.designIds, generationAxes: selection.generationAxes, sourcePhotoKey: state.sourceKey, settings: state.settings, metadata: { purpose: 'structure', diversityRelaxations: selection.diversityRelaxations } }), 'structure');
    state.structureSlots = state.batch.slots;
    state.stage = 2;
    render();
    await launchNativeBatch();
    state.structurePreparing = false;
    render();
  } catch (error) {
    cancelActiveBatch('launch-failed');
    state.stage = 0;
    state.structurePreparing = false;
    state.error = error?.message || 'RESULTS ERROR';
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
  state.localProfile = null;
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
    let localToneId = 'unknown';
    try {
      const detection = await detectCurrentHairTone('front');
      if (detection.toneId !== 'unknown') localToneId = detection.toneId;
    } catch {
      state.hairColorDetection = { status: 'failed', source: 'auto', toneId: 'unknown', confidence: 0 };
    }
    if (loadVersion !== sourceLoadVersion) return;
    applyLocalProfile(localToneId);
    state.sourceProcessing = false;
    render();
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

async function blobBase64(blob) {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function ensureNativeSource(item) {
  const viewKey = item.sourceViewKey || item.generationAxes?.sourceViewKey || 'front';
  const mirrored = Boolean(item.generationAxes?.mirrored);
  const key = `${viewKey}:${mirrored ? 1 : 0}`;
  if (state.nativeSources.has(key)) return state.nativeSources.get(key);
  const { sourceBlob } = await providerInputsForItem(item);
  const descriptor = await sourcePhotoKey(await sourceBlob.arrayBuffer(), sourceBlob.type || 'image/jpeg');
  const sourceHash = descriptor.split(':')[0];
  const created = await createPreparedSource({
    viewKey,
    sourceHash,
    mimeType: sourceBlob.type || 'image/jpeg',
    base64: await blobBase64(sourceBlob)
  });
  const value = { sourceId: created.sourceId, sourceHash, viewKey, mirrored };
  state.nativeSources.set(key, value);
  return value;
}

function cancelActiveBatch(reason) {
  const nativeBatchId = state.nativeBatchId;
  state.nativeBatchId = '';
  localStorage.removeItem('HAIRLOOM_NATIVE_BATCH_ID');
  if (nativeBatchId) cancelNativeBatch(nativeBatchId).catch(() => {});
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

function activeBatchForNativeEvent(event) {
  if (!state.batch || state.batch.batchId !== event.batchId || state.nativeBatchId !== event.batchId) return null;
  const slot = state.batch.slots[Number(event.slotIndex)];
  const eventId = Number(event.eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= Number(slot?.nativeEventId || 0)) return null;
  if (!slot || slot.designId !== event.designId || slot.generation !== Number(event.generation) || slot.nativeSourceHash !== event.sourceHash || ['done', 'failed', 'aborted'].includes(slot.status)) return null;
  return {
    ...state.batch,
    slots: state.batch.slots.map((item) => item.slotIndex === slot.slotIndex
      ? { ...item, status: 'active', nativeEventId: eventId, attempts: Math.max(item.attempts || 0, Number(event.attempts) || 0) }
      : { ...item })
  };
}

async function handleNativeBatchEvent(event) {
  const batch = activeBatchForNativeEvent(event);
  if (!batch) return;
  const item = batch.slots[Number(event.slotIndex)];
  if (event.status === 'queued' || event.status === 'retryable' || event.status === 'running') {
    state.batch = {
      ...batch,
      slots: batch.slots.map((slot) => slot.slotIndex === item.slotIndex ? { ...slot, status: event.status === 'running' ? 'active' : event.status } : slot)
    };
    syncBatchSurface();
    renderActiveBatchSurface();
    return;
  }
  let ok = event.status === 'done';
  let previewUrl = '';
  let errorType = event.errorType || 'native-provider';
  if (ok) {
    try {
      const output = await readNativeOutput(event.outputId);
      const restored = await restoreGeneratedOrientation(output.dataUrl, undefined, Boolean(item.generationAxes?.mirrored));
      previewUrl = restored.url;
    } catch {
      ok = false;
      errorType = 'output-read';
    }
  }
  const applied = applyConsultationCompletion(batch, {
    ok,
    batchId: event.batchId,
    sourcePhotoKey: batch.sourcePhotoKey,
    slotIndex: item.slotIndex,
    designId: item.designId,
    generation: item.generation,
    sourceViewKey: item.sourceViewKey,
    mirrored: item.generationAxes?.mirrored,
    colorToneId: item.generationAxes?.colorToneId,
    errorType,
    statusCode: Number(event.statusCode) || 0
  });
  if (!applied.accepted) return;
  state.batch = ok ? withPreview(applied.batch, item.slotIndex, previewUrl) : applied.batch;
  syncBatchSurface();
  if (state.batch.slots.every((slot) => ['done', 'failed', 'aborted'].includes(slot.status))) {
    localStorage.removeItem('HAIRLOOM_NATIVE_BATCH_ID');
  }
  renderActiveBatchSurface();
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
    `HAIR DESIGN: ${familiarStyleName(record.promptAtoms?.structureKo || record.baseKo)}`,
    record.promptAtoms?.frontKo ? `FRONT DESIGN: ${record.promptAtoms.frontKo}` : '',
    record.promptAtoms?.finishKo ? `FINISH: ${record.promptAtoms.finishKo}` : '',
    `CURRENT HAIR: ${state.diagnosis.naturalTexture}, damage ${state.diagnosis.damage}.`,
    state.freePrompt ? `USER REQUEST: ${state.freePrompt}` : '',
    'No text, logo, watermark or decorative graphic.'
  ].filter(Boolean).join('\n');
}

async function launchNativeBatch() {
  const batch = state.batch;
  if (!batch) throw new Error('RESULTS ERROR');
  const nativeSlots = [];
  const preparedSlots = [];
  for (const slot of batch.slots) {
    const record = state.recordsById.get(slot.designId);
    if (!record) throw new Error(`Unknown design: ${slot.designId}`);
    const source = await ensureNativeSource(slot);
    const generation = 1;
    preparedSlots.push({ ...slot, status: 'queued', attempts: 0, generation, nativeEventId: 0, nativeSourceId: source.sourceId, nativeSourceHash: source.sourceHash });
    nativeSlots.push({
      slotIndex: slot.slotIndex,
      designId: slot.designId,
      generation,
      sourceId: source.sourceId,
      sourceHash: source.sourceHash,
      sourceViewKey: slot.sourceViewKey || slot.generationAxes?.sourceViewKey || 'front',
      mirrored: Boolean(slot.generationAxes?.mirrored),
      prompt: consultationPrompt(record, slot)
    });
  }
  state.batch = { ...batch, slots: preparedSlots };
  state.nativeBatchId = batch.batchId;
  localStorage.setItem('HAIRLOOM_NATIVE_BATCH_ID', batch.batchId);
  syncBatchSurface();
  try {
    await createNativeBatch({
      batchId: batch.batchId,
      sourcePhotoKey: `source_${state.sourceKey.split(':')[0]}`,
      context: {
        freePrompt: state.freePrompt,
        settings: state.settings,
        diagnosis: state.diagnosis,
        hairColorProfile: state.hairColorProfile,
        localProfile: state.localProfile,
        generationAxes: preparedSlots.map((slot) => slot.generationAxes)
      },
      slots: nativeSlots
    });
  } catch (error) {
    state.nativeBatchId = '';
    localStorage.removeItem('HAIRLOOM_NATIVE_BATCH_ID');
    throw error;
  }
}

async function restoreNativeBatchSession() {
  const batchId = localStorage.getItem('HAIRLOOM_NATIVE_BATCH_ID');
  if (!batchId || !state.provider.available) return;
  try {
    const snapshot = await nativeBatchStatus(batchId);
    if (snapshot.cancelled || !Array.isArray(snapshot.slots) || snapshot.slots.length !== 100) throw new Error('batch-unavailable');
    await ensureCatalog();
    const context = snapshot.context && typeof snapshot.context === 'object' ? snapshot.context : {};
    state.freePrompt = String(context.freePrompt || '');
    state.mood = state.freePrompt;
    state.settings = normalizeSettings(context.settings || {});
    state.diagnosis = normalizeDiagnosis(context.diagnosis || { profileGender: 'U' });
    state.hairColorProfile = normalizeHairColorProfile(context.hairColorProfile || {});
    state.localProfile = normalizeHairAnalysis(context.localProfile || defaultHairAnalysis({ currentToneId: state.hairColorProfile.currentToneId, promptIntent: state.freePrompt }), { freePrompt: state.freePrompt, source: context.localProfile?.source === 'provider' ? 'provider' : 'fallback' });
    const axes = Array.isArray(context.generationAxes) && context.generationAxes.length === 100 ? context.generationAxes : [];
    const originals = new Map();
    for (const slot of snapshot.slots) {
      const key = `${slot.sourceViewKey}:${slot.mirrored ? 1 : 0}`;
      state.nativeSources.set(key, { sourceId: slot.sourceId, sourceHash: slot.sourceHash, viewKey: slot.sourceViewKey, mirrored: Boolean(slot.mirrored) });
      if (!slot.mirrored && !originals.has(slot.sourceViewKey)) originals.set(slot.sourceViewKey, slot.sourceId);
    }
    for (const [viewKey, sourceId] of originals) {
      const source = await readPreparedSource(sourceId);
      const response = await fetch(source.dataUrl);
      const blob = await response.blob();
      state.sourceViews[viewKey] = source.dataUrl;
      state.sourceViewBlobs[viewKey] = blob;
      state.providerInputCache.set(`${viewKey}:0`, { sourceBlob: blob });
      if (viewKey === 'front') {
        state.originalDataUrl = source.dataUrl;
        state.originalJpegDataUrl = source.dataUrl;
        state.originalJpegBlob = blob;
        state.sourceKey = await sourcePhotoKey(new Uint8Array(await blob.arrayBuffer()), blob.type);
      }
    }
    if (!state.originalJpegBlob || !state.sourceKey) throw new Error('front-source-unavailable');
    const slots = [];
    for (const slot of snapshot.slots) {
      const generationAxes = axes[slot.slotIndex] || {
        version: CONSULTATION_GENERATION_AXES_VERSION,
        sourceTransformVersion: CONSULTATION_SOURCE_TRANSFORM_VERSION,
        sourceViewKey: slot.sourceViewKey,
        mirrored: Boolean(slot.mirrored),
        colorToneId: state.hairColorProfile.currentToneId,
        colorIntensity: state.hairColorProfile.intensity
      };
      let status = slot.status === 'running' ? 'active' : slot.status === 'cancelled' ? 'aborted' : slot.status;
      let previewUrl = '';
      if (status === 'done' && slot.outputId) {
        try {
          const output = await readNativeOutput(slot.outputId);
          previewUrl = (await restoreGeneratedOrientation(output.dataUrl, undefined, Boolean(slot.mirrored))).url;
        } catch {
          status = 'failed';
        }
      }
      slots.push({
        slotIndex: slot.slotIndex,
        designId: slot.designId,
        generation: Number(slot.generation) || 1,
        attempts: Number(slot.attempts) || 0,
        sourceViewKey: slot.sourceViewKey,
        generationAxes,
        nativeSourceId: slot.sourceId,
        nativeSourceHash: slot.sourceHash,
        nativeEventId: Number(slot.lastEventId) || 0,
        status,
        previewUrl,
        result: status === 'done' ? { ok: true } : null,
        errorCode: slot.errorType || null
      });
    }
    state.batch = {
      batchId,
      sourcePhotoKey: state.sourceKey,
      settings: state.settings,
      metadata: { purpose: 'structure', restored: true, originalPhotoLineage: 'prepared-original-source-views' },
      slots,
      activeLimit: 4,
      successWindow: 0,
      pressureWindow: 0
    };
    state.nativeBatchId = batchId;
    state.filteredGroups = filterGroups();
    prepareGroupSummaries();
    state.structureSlots = slots;
    state.stage = 2;
    render();
  } catch {
    localStorage.removeItem('HAIRLOOM_NATIVE_BATCH_ID');
    state.nativeBatchId = '';
  }
}

async function initializeNativeSession() {
  await refreshProviderConnection();
  await restoreNativeBatchSession();
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

document.querySelector('#imageLightboxClose')?.addEventListener('click', closeImageLightbox);
imageLightbox?.addEventListener('click', (event) => { if (event.target === imageLightbox) closeImageLightbox(); });
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (state.settingsOpen) setMobileSettings(false);
  else if (!imageLightbox.hidden) closeImageLightbox();
});
onNativeBatchEvent(handleNativeBatchEvent).catch(() => {});
initializeNativeSession().catch(() => {});
render();
(globalThis.requestIdleCallback || ((callback) => setTimeout(callback, 120)))(() => ensureCatalog().catch(() => {}));
