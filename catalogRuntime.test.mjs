import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import {
  catalogVersion,
  hydrateCatalogIndexPayload,
  hydrateCatalogPayload,
  passesHardFeasibility,
  promptVersion,
  selectDiverse100,
  selectNeighbor100,
  validateCatalogIndex
} from './src/exploreCore.mjs';

const catalogPayload = JSON.parse(await readFile(new URL('./docs/hair-design-master/catalog.json', import.meta.url), 'utf8'));
const indexPayload = JSON.parse(await readFile(new URL('./docs/hair-design-master/catalog-index.json', import.meta.url), 'utf8'));
const catalog = hydrateCatalogPayload(catalogPayload);
const index = hydrateCatalogIndexPayload(indexPayload);
const catalogBytes = (await stat(new URL('./docs/hair-design-master/catalog.json', import.meta.url))).size;
const indexBytes = (await stat(new URL('./docs/hair-design-master/catalog-index.json', import.meta.url))).size;

test('compact catalog hydrates the validated 6500 runtime records', () => {
  assert.equal(catalog.catalogVersion, catalogVersion);
  assert.equal(catalog.promptVersion, promptVersion);
  assert.equal(catalog.records.length, 6500);
  assert.equal(index.records.length, 6500);
  assert.equal(new Set(catalog.records.map((record) => record.id)).size, 6500);
  assert.equal(new Set(catalog.records.map((record) => record.nameKo)).size, 6500);
  assert.ok(catalog.records.every((record) => record.nameKo !== record.id));
  validateCatalogIndex(index, { schemaVersion: 1, catalogVersion, promptVersion, total: 6500 });
});

test('compact catalog files stay within transport budgets', () => {
  assert.ok(catalogBytes <= 2_500_000, `catalog.json is ${catalogBytes} bytes`);
  assert.ok(indexBytes <= 900_000, `catalog-index.json is ${indexBytes} bytes`);
  assert.equal(catalogPayload.generatedAtPolicy, 'deterministic-no-timestamp');
  assert.equal(indexPayload.generatedAtPolicy, 'deterministic-no-timestamp');
});

test('catalog excludes color and face-proxy dimensions', () => {
  const serialized = JSON.stringify(catalogPayload);
  assert.doesNotMatch(serialized, /faceRatio|faceShape|jawRatio|foreheadRatio|cheekboneRatio|tolerance|colour/i);
  assert.doesNotMatch(serialized, /블랙|브라운|블론드|레드|핑크|블루|그린|퍼플|애쉬|코퍼|염색 컬러/);
});

test('full catalog damage sets are monotonic for supported setting combinations', () => {
  for (const currentLength of [0, 2, 4]) {
    for (const hairThickness of ['fine', 'normal', 'thick']) {
      for (const permAllowed of [false, true]) {
        for (const extensionAllowed of [false, true]) {
          const base = { currentLength, hairThickness, permAllowed, extensionAllowed, similarity: 2 };
          const low = new Set(index.records.filter((record) => passesHardFeasibility(record, { ...base, damageCondition: 'low' })).map((record) => record.id));
          const medium = new Set(index.records.filter((record) => passesHardFeasibility(record, { ...base, damageCondition: 'medium' })).map((record) => record.id));
          const high = new Set(index.records.filter((record) => passesHardFeasibility(record, { ...base, damageCondition: 'high' })).map((record) => record.id));
          for (const id of medium) assert.ok(low.has(id), `${id} medium must remain inside low`);
          for (const id of high) assert.ok(medium.has(id), `${id} high must remain inside medium`);
        }
      }
    }
  }
});

test('high damage still yields 100 low-stress designs without perm or extensions', () => {
  const settings = { currentLength: 2, hairThickness: 'normal', damageCondition: 'high', permAllowed: true, extensionAllowed: true, similarity: 2 };
  const selection = selectDiverse100(index.records, settings, 'high-damage-source');
  assert.equal(selection.designIds.length, 100);
  assert.equal(selection.underflow, false);
  assert.ok(selection.records.every((record) => record.feasibility.damageCeiling === 'low'));
  assert.ok(selection.records.every((record) => !record.feasibility.requiresPerm && !record.feasibility.requiresExtensionOrPiece && !record.feasibility.hardDenyWhenExtensionsDenied));
});

test('default and neighbor selections return deterministic unique 100-design batches', () => {
  const settings = { currentLength: 2, hairThickness: 'normal', damageCondition: 'medium', permAllowed: true, extensionAllowed: false, similarity: 2 };
  const first = selectDiverse100(index.records, settings, 'source-photo-key');
  const second = selectDiverse100(index.records, settings, 'source-photo-key');
  assert.equal(first.underflow, false);
  assert.equal(first.designIds.length, 100);
  assert.deepEqual(first.designIds, second.designIds);
  assert.equal(new Set(first.designIds).size, 100);
  const neighbors = selectNeighbor100(index.records, settings, first.designIds[0], 'source-photo-key');
  assert.equal(neighbors.designIds.length, 100);
  assert.equal(neighbors.designIds[0], first.designIds[0]);
  assert.equal(new Set(neighbors.designIds).size, 100);
});
