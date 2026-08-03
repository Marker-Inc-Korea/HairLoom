import {
  MODEL_PREVIEW_MAX_BYTES,
  deleteModelPreview,
  deleteModelPreviews,
  exportModelPreviewArchive,
  importModelPreviewArchive,
  inspectModelPreviewLibrary,
  modelPreviewRightsStatus,
  saveModelPreview,
  saveModelPreviewBatch,
  setModelPreviewEnabled,
  setModelPreviewsDesignRefs,
  setModelPreviewsEnabled,
  subscribeModelPreviewChanges
} from '/src/modelPreviewRegistry.mjs';

const $ = (selector) => document.querySelector(selector);
const form = $('#previewForm');
const status = $('#status');
const list = $('#previewList');
const count = $('#count');
const sourceKind = $('#sourceKind');
const fileField = $('#fileField');
const urlField = $('#urlField');
const imageFile = $('#imageFile');
const imageUrl = $('#imageUrl');
const cropPreview = $('#cropPreview');
const cropImage = $('#cropImage');
const focalX = $('#focalX');
const focalY = $('#focalY');
const search = $('#search');
const statusFilter = $('#statusFilter');
const selectVisible = $('#selectVisible');
const selectedCount = $('#selectedCount');
const selectedIds = new Set();
let visibleIds = [];
const objectUrls = new Map();
let cropObjectUrl = '';
let records = [];
let invalidCount = 0;
let editingRecord = null;
let disposed = false;
let refreshTimer = null;

const rightsLabels = {
  'salon-owned': '살롱 소유 촬영물',
  'model-consented': '모델 사용 동의',
  'licensed-stock': '라이선스 스톡',
  'public-domain': '퍼블릭 도메인'
};
const statusLabels = { active: '사용 중', expired: '권리 만료', revoked: '사용 중지', disabled: '비활성' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match]);
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = kind;
}

function releaseObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

function releaseCropUrl() {
  if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
  cropObjectUrl = '';
}

function previewUrl(record) {
  if (!objectUrls.has(record.id)) objectUrls.set(record.id, URL.createObjectURL(record.blob));
  return objectUrls.get(record.id);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function parseDesignRefs(value) {
  return [...new Set(String(value || '').split(/[\s,]+/).map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function fileTitle(file) {
  return String(file?.name || '사진').replace(/\.[^.]+$/, '').trim() || '사진';
}

function sourceHost(record) {
  if (!record.sourceUrl) return '살롱 파일';
  try { return new URL(record.sourceUrl).hostname; } catch { return 'HTTPS 원본'; }
}

function tags(record) {
  const gender = { U: '전체', F: '여성', M: '남성' }[record.genderId];
  const lengths = record.lengthIds.length ? record.lengthIds.join('/') : '전체 기장';
  const textures = record.textureBuckets.length ? record.textureBuckets.map((value) => ['직모', '웨이브', '컬', '코일'][value]).join('/') : '전체 질감';
  return `${gender} · ${lengths} · ${textures}`;
}

function recordMatchesSearch(record) {
  const query = search.value.trim().toLowerCase();
  const state = modelPreviewRightsStatus(record);
  if (statusFilter.value !== 'all' && statusFilter.value !== state && !(statusFilter.value === 'revoked' && state === 'disabled')) return false;
  if (!query) return true;
  return [record.title, record.attribution, record.rightsReference, record.reviewedBy, record.sourceUrl, ...record.designRefs].join(' ').toLowerCase().includes(query);
}

function rightsSummary(record) {
  const parts = [rightsLabels[record.rightsBasis] || record.rightsBasis];
  if (record.rightsReference) parts.push(record.rightsReference);
  if (record.rightsExpiresAt) parts.push(`만료 ${toDateInput(record.rightsExpiresAt)}`);
  else parts.push('만료일 없음');
  return parts.join(' · ');
}

function updateBulkState() {
  const existing = new Set(records.map((record) => record.id));
  for (const id of selectedIds) if (!existing.has(id)) selectedIds.delete(id);
  const selected = selectedIds.size;
  const hasSelection = selected > 0;
  selectedCount.textContent = `${selected}개 선택`;
  for (const id of ['bulkEnable', 'bulkDisable', 'bulkDelete', 'bulkApplyDesignRefs']) $(`#${id}`).disabled = !hasSelection;
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
  selectVisible.disabled = visibleIds.length === 0;
  selectVisible.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  selectVisible.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
}

function renderFilteredLibrary() {
  releaseObjectUrls();
  const filtered = records.filter(recordMatchesSearch);
  visibleIds = filtered.map((record) => record.id);
  count.textContent = String(records.length);
  $('#libraryWarning').textContent = invalidCount ? `손상되었거나 이전 형식에서 복구할 수 없는 레코드 ${invalidCount}개를 표시에서 제외했습니다.` : '';
  list.innerHTML = filtered.length ? filtered.map((record) => {
    const rightsStatus = modelPreviewRightsStatus(record);
    const active = rightsStatus === 'active';
    const designText = record.designRefs.length ? `DESIGN ${record.designRefs.join(' · ')}` : 'DESIGN 전체';
    const reviewer = record.reviewedBy ? `검토 ${record.reviewedBy}` : '검토자 미기록';
    const selected = selectedIds.has(record.id);
    return `<article class="preview-card ${active ? '' : 'inactive'} ${selected ? 'selected' : ''}" data-record="${esc(record.id)}">
      <label class="preview-select"><input type="checkbox" data-select="${esc(record.id)}" aria-label="${esc(record.title)} 일괄 관리 선택" ${selected ? 'checked' : ''}><span>선택</span></label>
      <div class="preview-image"><img src="${esc(previewUrl(record))}" alt="${esc(record.title)}" style="object-position:${record.focalX * 100}% ${record.focalY * 100}%"><span class="display-badge">DISPLAY ONLY</span><span class="status-badge ${rightsStatus}">${esc(statusLabels[rightsStatus] || rightsStatus)}</span></div>
      <div class="preview-meta"><b>${esc(record.title)}</b><small>${esc(tags(record))}</small><small>${esc(designText)}</small><small class="rights">${esc(rightsSummary(record))}</small><small>${esc(record.attribution)}</small><small>${esc(`${reviewer} · 동의 ${toDateInput(record.consentVerifiedAt)} · ${sourceHost(record)}`)}</small>
      <div class="preview-actions"><button type="button" data-edit="${esc(record.id)}">수정</button><button type="button" data-toggle="${esc(record.id)}">${active ? '사용 중지' : rightsStatus === 'expired' ? '권리 갱신' : '재활성화'}</button><button class="danger" type="button" data-delete="${esc(record.id)}">삭제</button></div></div>
    </article>`;
  }).join('') : '<div class="empty">조건에 맞는 등록 모델 사진이 없습니다.<br>살롱 촬영물 또는 사용 권리가 확인된 사진을 등록하세요.</div>';
  updateBulkState();
}

async function refreshLibrary({ preserveStatus = true } = {}) {
  const inspection = await inspectModelPreviewLibrary();
  records = [...inspection.records];
  invalidCount = inspection.invalidCount;
  renderFilteredLibrary();
  await updateStorageStatus(inspection);
  if (!preserveStatus && !records.length) setStatus('등록된 모델 사진이 없습니다.');
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!disposed) refreshLibrary().catch((error) => setStatus(error?.message || '등록 라이브러리를 갱신하지 못했습니다.', 'error'));
  }, 40);
}

function setSourceMode(kind) {
  sourceKind.value = kind;
  document.querySelectorAll('[data-source-tab]').forEach((item) => item.classList.toggle('on', item.dataset.sourceTab === kind));
  fileField.hidden = kind !== 'salon';
  urlField.hidden = kind !== 'web';
  imageFile.required = !editingRecord && kind === 'salon';
  imageUrl.required = !editingRecord && kind === 'web';
}

function updateCropPosition() {
  cropImage.style.objectPosition = `${focalX.value}% ${focalY.value}%`;
  $('#focalXValue').textContent = `${focalX.value}%`;
  $('#focalYValue').textContent = `${focalY.value}%`;
}

function showCropBlob(blob) {
  releaseCropUrl();
  if (!blob) { cropPreview.hidden = true; cropImage.removeAttribute('src'); return; }
  cropObjectUrl = URL.createObjectURL(blob);
  cropImage.src = cropObjectUrl;
  cropPreview.hidden = false;
  updateCropPosition();
}

function resetForm() {
  form.reset();
  editingRecord = null;
  $('#editingId').value = '';
  $('#formMode').textContent = 'NEW RECORD';
  $('.form-heading h2').textContent = '모델 사진 등록';
  $('.save').textContent = '이 브라우저에 등록';
  $('#cancelEdit').hidden = true;
  $('#disableFromForm').hidden = true;
  imageFile.multiple = true;
  $('#consentVerifiedAt').value = todayInput();
  focalX.value = '50';
  focalY.value = '50';
  setSourceMode('salon');
  showCropBlob(null);
}

function beginEdit(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  editingRecord = record;
  $('#editingId').value = record.id;
  $('#formMode').textContent = 'EDIT RECORD';
  $('.form-heading h2').textContent = '모델 사진 수정';
  $('.save').textContent = '수정 내용 저장';
  $('#cancelEdit').hidden = false;
  const rightsStatus = modelPreviewRightsStatus(record);
  $('#disableFromForm').hidden = rightsStatus === 'expired';
  $('#disableFromForm').textContent = rightsStatus === 'active' ? '사용 중지' : '재활성화';
  imageFile.multiple = false;
  $('#title').value = record.title;
  $('#gender').value = record.genderId;
  $('#length').value = record.lengthIds[0] || '';
  $('#texture').value = record.textureBuckets.length ? String(record.textureBuckets[0]) : '';
  $('#designRefs').value = record.designRefs.join('\n');
  $('#rights').value = record.rightsBasis;
  $('#attribution').value = record.attribution;
  $('#rightsReference').value = record.rightsReference;
  $('#reviewedBy').value = record.reviewedBy;
  $('#consentVerifiedAt').value = toDateInput(record.consentVerifiedAt);
  $('#rightsExpiresAt').value = toDateInput(record.rightsExpiresAt);
  $('#consent').checked = true;
  imageUrl.value = record.sourceUrl;
  focalX.value = String(Math.round(record.focalX * 100));
  focalY.value = String(Math.round(record.focalY * 100));
  setSourceMode(record.sourceKind);
  showCropBlob(record.blob);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function metadataFromForm(title, overrides = {}) {
  return {
    ...(editingRecord ? (() => { const { blob, contentHash, imageMime, imageBytes, updatedAt, ...metadata } = editingRecord; return metadata; })() : {}),
    title,
    genderId: $('#gender').value,
    lengthIds: $('#length').value ? [$('#length').value] : [],
    textureBuckets: $('#texture').value === '' ? [] : [Number($('#texture').value)],
    designRefs: parseDesignRefs($('#designRefs').value),
    sourceKind: sourceKind.value,
    rightsBasis: $('#rights').value,
    attribution: $('#attribution').value,
    sourceUrl: overrides.sourceUrl ?? (sourceKind.value === 'web' ? imageUrl.value.trim() : ''),
    consentConfirmed: $('#consent').checked,
    consentVerifiedAt: $('#consentVerifiedAt').value,
    rightsExpiresAt: $('#rightsExpiresAt').value,
    rightsReference: $('#rightsReference').value,
    reviewedBy: $('#reviewedBy').value,
    focalX: Number(focalX.value) / 100,
    focalY: Number(focalY.value) / 100,
    enabled: overrides.enabled ?? editingRecord?.enabled ?? true,
    revokedAt: overrides.revokedAt ?? editingRecord?.revokedAt ?? ''
  };
}

async function fetchWebImage(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('올바른 HTTPS 이미지 URL을 입력하세요.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('자격 증명이 없는 HTTPS URL만 사용할 수 있습니다.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(parsed.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw new Error(`인터넷 이미지를 가져오지 못했습니다. HTTP ${response.status}`);
    return { blob: await response.blob(), sourceUrl: parsed.href };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('인터넷 이미지 가져오기가 20초 안에 완료되지 않았습니다.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImageBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      callback();
    };
    const timeout = setTimeout(() => finish(() => reject(new Error('이미지 파일 해석이 15초 안에 완료되지 않았습니다.'))), 15000);
    image.onload = () => finish(() => {
      if (image.naturalWidth < 200 || image.naturalHeight < 200) return reject(new Error('모델 사진은 가로·세로 각각 200px 이상이어야 합니다.'));
      if (Math.max(image.naturalWidth, image.naturalHeight) > 8192) return reject(new Error('모델 사진의 최대 변은 8192px 이하여야 합니다.'));
      const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('브라우저가 모델 사진 변환을 지원하지 않습니다.'));
      context.fillStyle = '#120d0b';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((normalized) => normalized ? resolve(normalized) : reject(new Error('모델 사진을 저장 형식으로 변환하지 못했습니다.')), 'image/jpeg', 0.86);
    });
    image.onerror = () => finish(() => reject(new Error('이미지 파일을 해석할 수 없습니다.')));
    image.src = objectUrl;
  });
}

async function normalizedInputBlob(blob) {
  if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('JPEG, PNG, WebP 사진만 등록할 수 있습니다.');
  if (!blob.size || blob.size > MODEL_PREVIEW_MAX_BYTES) throw new Error('사진은 8MB 이하여야 합니다.');
  return normalizeImageBlob(blob);
}

async function submitRecords() {
  const baseTitle = $('#title').value.trim();
  if (editingRecord) {
    const selectedFile = imageFile.files?.[0];
    const urlChanged = sourceKind.value === 'web' && imageUrl.value.trim() !== editingRecord.sourceUrl;
    const sourceChanged = sourceKind.value !== editingRecord.sourceKind;
    if (sourceChanged && !selectedFile && !urlChanged) throw new Error('사진 출처를 변경하려면 새 파일 또는 URL을 입력하세요.');
    let blob = editingRecord.blob;
    let sourceUrl = editingRecord.sourceUrl;
    if (selectedFile) { blob = await normalizedInputBlob(selectedFile); sourceUrl = ''; }
    else if (urlChanged) { const fetched = await fetchWebImage(imageUrl.value.trim()); blob = await normalizedInputBlob(fetched.blob); sourceUrl = fetched.sourceUrl; }
    await saveModelPreview({ ...metadataFromForm(baseTitle, { sourceUrl }), id: editingRecord.id }, blob);
    return 1;
  }
  if (sourceKind.value === 'web') {
    const fetched = await fetchWebImage(imageUrl.value.trim());
    const blob = await normalizedInputBlob(fetched.blob);
    await saveModelPreview(metadataFromForm(baseTitle, { sourceUrl: fetched.sourceUrl }), blob);
    return 1;
  }
  const files = [...(imageFile.files || [])];
  if (!files.length) throw new Error('살롱 모델 사진 파일을 선택하세요.');
  const prepared = [];
  for (const file of files) {
    const blob = await normalizedInputBlob(file);
    const title = files.length > 1 ? `${baseTitle} · ${fileTitle(file)}`.slice(0, 80) : baseTitle;
    prepared.push({ metadata: metadataFromForm(title, { sourceUrl: '' }), blob });
  }
  await saveModelPreviewBatch(prepared);
  return prepared.length;
}

async function updateStorageStatus(inspection = null) {
  const local = inspection || await inspectModelPreviewLibrary();
  let browserText = '';
  let persisted = false;
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      browserText = quota ? ` · 브라우저 전체 ${(used / 1048576).toFixed(1)}MB / ${(quota / 1048576).toFixed(1)}MB` : '';
    }
    persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  } catch {
    browserText = ' · 브라우저 전체 용량 확인 불가';
  }
  $('#storageStatus').textContent = `모델 ${local.count}/${local.maxRecords}장 · ${(local.totalBytes / 1048576).toFixed(1)}MB / ${(local.maxTotalBytes / 1048576).toFixed(0)}MB${browserText} · 영구 저장 ${persisted ? '허용됨' : '미허용'}`;
  $('#persistStorage').disabled = persisted || !navigator.storage?.persist;
}

document.querySelectorAll('[data-source-tab]').forEach((button) => button.addEventListener('click', () => setSourceMode(button.dataset.sourceTab)));
focalX.addEventListener('input', updateCropPosition);
focalY.addEventListener('input', updateCropPosition);
imageFile.addEventListener('change', () => showCropBlob(imageFile.files?.[0] || editingRecord?.blob));
search.addEventListener('input', renderFilteredLibrary);
statusFilter.addEventListener('change', renderFilteredLibrary);
$('#cancelEdit').addEventListener('click', resetForm);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('.save');
  submit.disabled = true;
  setStatus('사진과 권리 정보를 확인해 저장하는 중입니다.');
  try {
    const saved = await submitRecords();
    const message = editingRecord ? '수정 내용을 저장했습니다.' : `${saved}장의 모델 사진을 등록했습니다.`;
    resetForm();
    setStatus(`${message} Explore와 PRO의 생성 대기 카드에 반영됩니다.`, 'ok');
    await refreshLibrary();
  } catch (error) {
    setStatus(error?.message || '등록하지 못했습니다.', 'error');
  } finally {
    submit.disabled = false;
  }
});

$('#disableFromForm').addEventListener('click', async () => {
  if (!editingRecord) return;
  try {
    const enable = modelPreviewRightsStatus(editingRecord) !== 'active';
    await setModelPreviewEnabled(editingRecord.id, enable);
    setStatus(enable ? '모델 사진을 다시 활성화했습니다.' : '모델 사진 사용을 중지했습니다.', 'ok');
    resetForm();
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '상태를 변경하지 못했습니다.', 'error'); }
});

list.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.edit) return beginEdit(button.dataset.edit);
  if (button.dataset.toggle) {
    const record = records.find((item) => item.id === button.dataset.toggle);
    if (!record) return;
    if (modelPreviewRightsStatus(record) === 'expired') {
      beginEdit(record.id);
      setStatus('만료일을 갱신하고 동의 확인일을 검토한 뒤 저장하세요.');
      return;
    }
    try {
      const enable = modelPreviewRightsStatus(record) !== 'active';
      await setModelPreviewEnabled(record.id, enable);
      setStatus(enable ? '모델 사진을 다시 활성화했습니다.' : '모델 사진 사용을 중지했습니다.', 'ok');
      await refreshLibrary();
    } catch (error) { setStatus(error?.message || '상태를 변경하지 못했습니다.', 'error'); }
    return;
  }
  if (button.dataset.delete) {
    const record = records.find((item) => item.id === button.dataset.delete);
    if (!record || !confirm(`“${record.title}” 모델 사진을 이 브라우저에서 삭제할까요?`)) return;
    try {
      await deleteModelPreview(record.id);
      if (editingRecord?.id === record.id) resetForm();
      setStatus('등록 모델 사진을 삭제했습니다.', 'ok');
      await refreshLibrary();
    } catch (error) { setStatus(error?.message || '삭제하지 못했습니다.', 'error'); }
  }
});

list.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-select]');
  if (!checkbox) return;
  if (checkbox.checked) selectedIds.add(checkbox.dataset.select);
  else selectedIds.delete(checkbox.dataset.select);
  checkbox.closest('.preview-card')?.classList.toggle('selected', checkbox.checked);
  updateBulkState();
});

selectVisible.addEventListener('change', () => {
  for (const id of visibleIds) {
    if (selectVisible.checked) selectedIds.add(id);
    else selectedIds.delete(id);
  }
  renderFilteredLibrary();
});

function selectedRecords() {
  return records.filter((record) => selectedIds.has(record.id));
}

$('#bulkDisable').addEventListener('click', async () => {
  const ids = selectedRecords().map((record) => record.id);
  if (!ids.length) return;
  try {
    await setModelPreviewsEnabled(ids, false);
    setStatus(`${ids.length}장의 모델 사진 사용을 중지했습니다. 열린 Explore와 PRO에도 즉시 반영됩니다.`, 'ok');
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '선택 모델 상태를 변경하지 못했습니다.', 'error'); }
});

$('#bulkEnable').addEventListener('click', async () => {
  const selected = selectedRecords();
  const eligible = selected.filter((record) => modelPreviewRightsStatus(record) !== 'expired');
  const expired = selected.length - eligible.length;
  if (!eligible.length) return setStatus('선택한 모델은 모두 만료되었습니다. 각 레코드의 권리 만료일을 먼저 갱신하세요.', 'error');
  try {
    await setModelPreviewsEnabled(eligible.map((record) => record.id), true);
    setStatus(`${eligible.length}장의 모델 사진을 재활성화했습니다.${expired ? ` 만료 ${expired}장은 권리 갱신이 필요합니다.` : ''}`, 'ok');
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '선택 모델 상태를 변경하지 못했습니다.', 'error'); }
});

$('#bulkApplyDesignRefs').addEventListener('click', async () => {
  const ids = selectedRecords().map((record) => record.id);
  if (!ids.length) return;
  try {
    const refs = parseDesignRefs($('#bulkDesignRefs').value);
    await setModelPreviewsDesignRefs(ids, refs);
    setStatus(`${ids.length}장의 디자인 태그를 ${refs.length ? '일괄 설정' : '해제'}했습니다.`, 'ok');
    $('#bulkDesignRefs').value = '';
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '디자인 태그를 적용하지 못했습니다.', 'error'); }
});

$('#bulkDelete').addEventListener('click', async () => {
  const ids = selectedRecords().map((record) => record.id);
  if (!ids.length || !confirm(`선택한 등록 모델 ${ids.length}장을 이 브라우저에서 삭제할까요?`)) return;
  try {
    const deleted = await deleteModelPreviews(ids);
    for (const id of ids) selectedIds.delete(id);
    if (editingRecord && ids.includes(editingRecord.id)) resetForm();
    setStatus(`${deleted}장의 등록 모델 사진을 삭제했습니다.`, 'ok');
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '선택 모델을 삭제하지 못했습니다.', 'error'); }
});

$('#persistStorage').addEventListener('click', async () => {
  try {
    const granted = await navigator.storage?.persist?.();
    setStatus(granted ? '브라우저 영구 저장을 허용했습니다.' : '브라우저가 영구 저장 요청을 허용하지 않았습니다.', granted ? 'ok' : 'error');
    await updateStorageStatus();
  } catch (error) { setStatus(error?.message || '영구 저장을 요청하지 못했습니다.', 'error'); }
});

$('#exportArchive').addEventListener('click', async () => {
  const passphrase = $('#archivePassphrase').value;
  try {
    const archive = await exportModelPreviewArchive(passphrase);
    const url = URL.createObjectURL(archive);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hairloom-model-library-${todayInput()}.hairloom.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    $('#archivePassphrase').value = '';
    setStatus('암호화 보관 파일을 만들었습니다. 암호와 파일을 분리해 보관하세요.', 'ok');
  } catch (error) { setStatus(error?.message || '보관 파일을 만들지 못했습니다.', 'error'); }
});

$('#importArchive').addEventListener('change', async () => {
  const file = $('#importArchive').files?.[0];
  if (!file) return;
  try {
    const result = await importModelPreviewArchive(file, $('#archivePassphrase').value);
    $('#archivePassphrase').value = '';
    $('#importArchive').value = '';
    setStatus(`${result.imported}장 가져오기 완료 · 중복 ${result.skipped}장 건너뜀`, 'ok');
    await refreshLibrary();
  } catch (error) { setStatus(error?.message || '보관 파일을 가져오지 못했습니다.', 'error'); }
});

const unsubscribe = subscribeModelPreviewChanges(scheduleRefresh);
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  clearTimeout(refreshTimer);
  unsubscribe();
  releaseObjectUrls();
  releaseCropUrl();
});

resetForm();
refreshLibrary({ preserveStatus: false }).catch((error) => setStatus(error?.message || '등록 라이브러리를 열지 못했습니다.', 'error'));
