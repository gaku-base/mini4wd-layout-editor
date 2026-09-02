'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('Bank20 uses the owner-approved 240mm projected length throughout runtime geometry', () => {
  const catalog = loadCatalog();
  const bank = catalog.PARTS.bank20;

  assert.equal(catalog.BANK20_PROJECTED_LENGTH_MM, 240);
  assert.equal(bank.w, 24);
  assert.equal(bank.geometry.width, 24);
  assert.equal(bank.geometry.bounds.minX, -12);
  assert.equal(bank.geometry.bounds.maxX, 12);
  assert.equal(bank.geometry.connectors[0].x, -12);
  assert.equal(bank.geometry.connectors[1].x, 12);
  assert.equal(bank.visual.canvasWidth, 24);
  assert.equal(bank.visual.originX, 12);

  assert.equal(bank.measurements.projectedLengthMm.value, 240);
  assert.equal(bank.measurements.projectedLengthMm.status, 'verified');
  assert.equal(bank.measurements.projectedLengthMm.source, 'project-owner-approved-2026-09-02');
});

test('Bank20 keeps the measured transition arc separate from the 240mm projection', () => {
  const bank = loadCatalog().PARTS.bank20;

  assert.equal(bank.measurements.transitionArcChordMm.value, 225.75);
  assert.equal(bank.measurements.transitionArcChordMm.status, 'provisional');
  assert.ok(bank.measurements.transitionArcChordMm.value < bank.measurements.projectedLengthMm.value);
  assert.equal(bank.bank.angleDeg, 20);
});
