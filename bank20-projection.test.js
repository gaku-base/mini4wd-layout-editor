'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PRESENTATION_DATA = require('./presentation-data.js');

function loadCatalog() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'part-catalog.js'), 'utf8'),
    context,
    { filename: 'part-catalog.js' }
  );
  return context.window.M4WD_PART_CATALOG;
}

test('Bank20 uses the owner-approved 220mm connector span throughout runtime geometry', () => {
  const catalog = loadCatalog();
  const bank = catalog.PARTS.bank20;

  assert.equal(catalog.BANK20_PROJECTED_LENGTH_MM, 220);
  assert.equal(bank.w, 22);
  assert.equal(bank.geometry.width, 22);
  assert.equal(bank.geometry.bounds.minX, -11);
  assert.equal(bank.geometry.bounds.maxX, 11);
  assert.equal(bank.geometry.connectors[0].x, -11);
  assert.equal(bank.geometry.connectors[1].x, 11);
  assert.equal(bank.visual.canvasWidth, 22);
  assert.equal(bank.visual.originX, 11);

  assert.equal(bank.measurements.projectedLengthMm.value, 220);
  assert.equal(bank.measurements.projectedLengthMm.status, 'verified');
  assert.equal(bank.measurements.projectedLengthMm.source, 'project-owner-real-measurement-2026-09-27');
});

test('Bank20 keeps the measured transition arc separate from the 220mm connector span', () => {
  const bank = loadCatalog().PARTS.bank20;

  assert.equal(bank.measurements.transitionArcChordMm.value, 225.75);
  assert.equal(bank.measurements.transitionArcChordMm.status, 'provisional');
  assert.notEqual(bank.measurements.transitionArcChordMm.value, bank.measurements.projectedLengthMm.value);
  assert.equal(bank.bank.angleDeg, 20);
});

test('Bank20 track-length contribution remains 0.66m even though connector span is 22cm', () => {
  const bank = loadCatalog().PARTS.bank20;

  assert.equal(bank.geometry.width, 22);
  assert.equal(PRESENTATION_DATA.partLengthCm('bank20', bank), 66);
  const total = PRESENTATION_DATA.computeTrackLength({ parts: [{ type: 'bank20' }] }, { PARTS: { bank20: bank } });
  assert.equal(total.available, true);
  assert.equal(total.totalM, 0.66);
  assert.equal(total.display, '0.66 m');
});
