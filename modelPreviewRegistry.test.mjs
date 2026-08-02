import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MODEL_PREVIEW_MAX_BYTES,
  MODEL_PREVIEW_MAX_RECORDS,
  MODEL_PREVIEW_MAX_TOTAL_BYTES,
  modelPreviewDescriptor,
  modelPreviewMatchScore,
  normalizeModelPreviewMetadata,
  selectModelPreview
} from './src/modelPreviewRegistry.mjs';

function preview(overrides = {}) {
  return normalizeModelPreviewMetadata({
    id: 'HLM-MP-1234ABCD',
    title: '강남점 미디엄 웨이브',
    genderId: 'F',
    lengthIds: ['MD'],
    textureBuckets: [1],
    sourceKind: 'salon',
    rightsBasis: 'model-consented',
    attribution: 'Hairloom Salon · model release 2026-08',
    sourceUrl: '',
    consentConfirmed: true,
    imageMime: 'image/jpeg',
    imageBytes: 1024,
    createdAt: '2026-08-02T00:00:00.000Z',
    displayOnly: true,
    enabled: true,
    ...overrides
  });
}

const femaleMediumWave = {
  id: 'HLM-C-F-MD-01-NH-NW',
  genderId: 'F',
  lengthId: 'MD',
  vector: { gender: 1, length: 2, textureBucket: 1 }
};

test('model preview metadata requires explicit rights, consent, and safe local image metadata', () => {
  const normalized = preview();
  assert.equal(normalized.displayOnly, true);
  assert.equal(normalized.genderId, 'F');
  assert.deepEqual(normalized.lengthIds, ['MD']);
  assert.deepEqual(normalized.textureBuckets, [1]);
  assert.throws(() => preview({ consentConfirmed: false }), /rights and model consent/);
  assert.throws(() => preview({ sourceKind: 'web', sourceUrl: 'http://example.test/model.jpg' }), /HTTPS URL/);
  assert.throws(() => preview({ sourceKind: 'web', sourceUrl: 'https://user:secret@example.test/model.jpg' }), /credential-free/);
  assert.throws(() => preview({ imageMime: 'image/svg+xml' }), /JPEG, PNG, or WebP/);
  assert.throws(() => preview({ imageBytes: MODEL_PREVIEW_MAX_BYTES + 1 }), /image must be/);
  assert.equal(MODEL_PREVIEW_MAX_RECORDS, 80);
  assert.equal(MODEL_PREVIEW_MAX_TOTAL_BYTES, 160 * 1024 * 1024);
  assert.throws(() => preview({ displayOnly: false }), /display-only/);
  assert.throws(() => preview({ unknownField: true }), /Unknown model preview field/);
});

test('registered model selection is deterministic and prefers exact hair descriptors', () => {
  const generic = preview({ id: 'HLM-MP-00000001', genderId: 'U', lengthIds: [], textureBuckets: [] });
  const exact = preview({ id: 'HLM-MP-00000002' });
  const wrongGender = preview({ id: 'HLM-MP-00000003', genderId: 'M' });
  assert.deepEqual(modelPreviewDescriptor(femaleMediumWave), { id: femaleMediumWave.id, genderId: 'F', lengthId: 'MD', textureBucket: 1 });
  assert.ok(modelPreviewMatchScore(exact, femaleMediumWave) > modelPreviewMatchScore(generic, femaleMediumWave));
  assert.equal(modelPreviewMatchScore(wrongGender, femaleMediumWave), Number.NEGATIVE_INFINITY);
  assert.equal(selectModelPreview([generic, wrongGender, exact], femaleMediumWave, 17)?.id, exact.id);
  assert.equal(selectModelPreview([generic, wrongGender, exact], femaleMediumWave, 17)?.id, exact.id);
});

test('Explore and PRO keep registered models display-only and preserve original provider inputs', async () => {
  const [explore, pro, manager] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./consultation/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./model-previews/app.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(explore, /등록 모델 · 생성 대기/);
  assert.match(pro, /등록 모델 · 생성 대기/);
  assert.match(explore, /form\.append\('image',EX\.preparedFrontBlob/);
  assert.match(pro, /form\.append\('image', inputs\.sourceBlob/);
  assert.doesNotMatch(explore, /form\.append\('image',[^\n]*(?:modelPreview|registeredPreview)/i);
  assert.doesNotMatch(pro, /form\.append\('image',[^\n]*(?:modelPreview|registeredPreview)/i);
  assert.match(manager, /credentials: 'omit'/);
  assert.match(manager, /referrerPolicy: 'no-referrer'/);
  assert.match(manager, /blob = await normalizeImageBlob\(blob\)/);
});
