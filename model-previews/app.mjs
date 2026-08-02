import {
  MODEL_PREVIEW_MAX_BYTES,
  deleteModelPreview,
  listModelPreviews,
  saveModelPreview
} from '/src/modelPreviewRegistry.mjs';

const form = document.querySelector('#previewForm');
const status = document.querySelector('#status');
const list = document.querySelector('#previewList');
const count = document.querySelector('#count');
const sourceKind = document.querySelector('#sourceKind');
const fileField = document.querySelector('#fileField');
const urlField = document.querySelector('#urlField');
const imageFile = document.querySelector('#imageFile');
const imageUrl = document.querySelector('#imageUrl');
const objectUrls = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[match]);
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = kind;
}

function releaseObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

function previewUrl(record) {
  if (!objectUrls.has(record.id)) objectUrls.set(record.id, URL.createObjectURL(record.blob));
  return objectUrls.get(record.id);
}

function tags(record) {
  const gender = { U: '전체', F: '여성', M: '남성' }[record.genderId];
  const lengths = record.lengthIds.length ? record.lengthIds.join('/') : '전체 기장';
  const textures = record.textureBuckets.length ? record.textureBuckets.map((value) => ['직모', '웨이브', '컬', '코일'][value]).join('/') : '전체 질감';
  return `${gender} · ${lengths} · ${textures}`;
}

async function renderLibrary() {
  releaseObjectUrls();
  const records = await listModelPreviews();
  count.textContent = String(records.length);
  list.innerHTML = records.length ? records.map((record) => `<article class="preview-card"><img src="${esc(previewUrl(record))}" alt="${esc(record.title)}"><div class="preview-meta"><b>${esc(record.title)}</b><small>${esc(tags(record))}</small><small>${esc(record.attribution)}</small><button type="button" data-delete="${esc(record.id)}">삭제</button></div></article>`).join('') : '<div class="empty">등록된 모델 사진이 없습니다.<br>살롱 촬영물 또는 사용 권리가 확인된 사진을 등록하세요.</div>';
  list.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    await deleteModelPreview(button.dataset.delete);
    setStatus('등록 사진을 삭제했습니다.', 'ok');
    await renderLibrary();
  }));
}

async function fetchWebImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('올바른 HTTPS 이미지 URL을 입력하세요.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('자격 증명이 없는 HTTPS URL만 사용할 수 있습니다.');
  const response = await fetch(parsed.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`인터넷 이미지를 가져오지 못했습니다. HTTP ${response.status}`);
  const blob = await response.blob();
  return { blob, sourceUrl: parsed.href };
}

function normalizeImageBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (image.naturalWidth < 200 || image.naturalHeight < 200) return reject(new Error('모델 사진은 가로·세로 각각 200px 이상이어야 합니다.'));
      if (Math.max(image.naturalWidth, image.naturalHeight) > 8192) return reject(new Error('모델 사진의 최대 변은 8192px 이하여야 합니다.'));
      const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#120d0b';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((normalized) => normalized ? resolve(normalized) : reject(new Error('모델 사진을 저장 형식으로 변환하지 못했습니다.')), 'image/jpeg', 0.86);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('이미지 파일을 해석할 수 없습니다.')); };
    image.src = objectUrl;
  });
}

document.querySelectorAll('[data-source-tab]').forEach((button) => button.addEventListener('click', () => {
  const kind = button.dataset.sourceTab;
  sourceKind.value = kind;
  document.querySelectorAll('[data-source-tab]').forEach((item) => item.classList.toggle('on', item === button));
  fileField.hidden = kind !== 'salon';
  urlField.hidden = kind !== 'web';
  imageFile.required = kind === 'salon';
  imageUrl.required = kind === 'web';
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('.save');
  submit.disabled = true;
  setStatus('사진을 확인하고 이 브라우저에 저장하는 중입니다.');
  try {
    let blob;
    let sourceUrl = '';
    if (sourceKind.value === 'web') {
      ({ blob, sourceUrl } = await fetchWebImage(imageUrl.value.trim()));
    } else {
      blob = imageFile.files?.[0];
      if (!blob) throw new Error('살롱 모델 사진 파일을 선택하세요.');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('JPEG, PNG, WebP 사진만 등록할 수 있습니다.');
    if (!blob.size || blob.size > MODEL_PREVIEW_MAX_BYTES) throw new Error('사진은 8MB 이하여야 합니다.');
    blob = await normalizeImageBlob(blob);
    await saveModelPreview({
      title: document.querySelector('#title').value,
      genderId: document.querySelector('#gender').value,
      lengthIds: document.querySelector('#length').value ? [document.querySelector('#length').value] : [],
      textureBuckets: document.querySelector('#texture').value === '' ? [] : [Number(document.querySelector('#texture').value)],
      sourceKind: sourceKind.value,
      rightsBasis: document.querySelector('#rights').value,
      attribution: document.querySelector('#attribution').value,
      sourceUrl,
      consentConfirmed: document.querySelector('#consent').checked,
      enabled: true
    }, blob);
    form.reset();
    sourceKind.value = 'salon';
    fileField.hidden = false;
    urlField.hidden = true;
    imageFile.required = true;
    imageUrl.required = false;
    document.querySelectorAll('[data-source-tab]').forEach((item) => item.classList.toggle('on', item.dataset.sourceTab === 'salon'));
    setStatus('등록했습니다. Explore와 PRO의 생성 대기 카드에 자동으로 표시됩니다.', 'ok');
    await renderLibrary();
  } catch (error) {
    setStatus(error?.message || '등록하지 못했습니다.', 'error');
  } finally {
    submit.disabled = false;
  }
});

renderLibrary().catch((error) => setStatus(error?.message || '등록 라이브러리를 열지 못했습니다.', 'error'));
window.addEventListener('pagehide', releaseObjectUrls);
