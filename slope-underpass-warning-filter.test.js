'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');
const FILTER = require('./slope-underpass-warning-filter.js');

function loadCatalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG;
}

const PARTS = loadCatalog().PARTS;
const part = (id, type, x, y, rotation = 0, zMm = 0) => ({ id, type, x, y, rotation, zMm });
const boundsForPart = value => GRAPH.polygonBounds(GRAPH.occupancyPolygon(value, PARTS[value.type]));
const legacyWarnings = parts => GRAPH.interferenceWarnings(parts, PARTS, boundsForPart);
const filteredWarnings = (warnings, parts) => FILTER.filterApprovedSlopeUnderpassWarnings(warnings, {
  parts,
  catalog: PARTS,
  occupancyPolygon: GRAPH.occupancyPolygon
});

test('legacy warning exists for same-level high-side crossing, then approved filter removes it', () => {
  const parts = [
    part('s', 'slope', 0, 0, 0, 0),
    part('lower', 'straight', 20, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  assert.equal(legacy.length, 1, 'legacy solid-envelope warning should exist before filter');
  const filtered = filteredWarnings(legacy, parts);
  assert.equal(filtered.length, 0, 'approved high-side underpass should suppress only that warning');
});

test('low-side crossing keeps warning and attaches exact blocked polygon metadata', () => {
  const parts = [
    part('s', 'slope', 0, 0, 0, 0),
    part('lower', 'straight', 0, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  assert.equal(legacy.length, 1);
  const filtered = filteredWarnings(legacy, parts);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slopeUnderpass.status, 'blocked-underpass');
  assert.equal(filtered[0].slopeUnderpass.blockedThroughXMm, 272);
  assert.ok(filtered[0].slopeUnderpass.overlapMinXMm < 272);
  assert.ok(filtered[0].slopeUnderpass.overlapAreaMm2 > 0);
  assert.ok(filtered[0].slopeUnderpass.intersectionFragmentsMm.length > 0);
});

test('diagonal high-side crossing is removed while diagonal low-side crossing remains', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  const high = part('high', 'straight', 35, 0, 45, 0);
  const low = part('low', 'straight', 30, 0, 45, 0);

  const highLegacy = legacyWarnings([slope, high]);
  const lowLegacy = legacyWarnings([slope, low]);
  assert.equal(highLegacy.length, 1);
  assert.equal(lowLegacy.length, 1);
  assert.equal(filteredWarnings(highLegacy, [slope, high]).length, 0);
  assert.equal(filteredWarnings(lowLegacy, [slope, low]).length, 1);
});

test('different base Z remains a warning even when XY overlap is beyond 272mm', () => {
  const parts = [
    part('s', 'slope', 0, 0, 0, 10),
    part('lower', 'straight', 20, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  assert.equal(legacy.length, 1);
  const filtered = filteredWarnings(legacy, parts);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slopeUnderpass, undefined);
});

test('bank is never auto-cleared by flat-course underpass filter', () => {
  const parts = [
    part('s', 'slope', 0, 0, 0, 0),
    part('bank', 'bank20', 20, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  assert.equal(legacy.length, 1);
  const filtered = filteredWarnings(legacy, parts);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slopeUnderpass, undefined);
});

test('non-slope interference warnings pass through unchanged', () => {
  const parts = [
    part('a', 'straight', 0, 0, 0, 0),
    part('b', 'straight', 0, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  assert.equal(legacy.length, 1);
  const before = JSON.stringify(legacy);
  const filtered = filteredWarnings(legacy, parts);
  assert.equal(filtered.length, 1);
  assert.equal(JSON.stringify(filtered), before);
  assert.equal(JSON.stringify(legacy), before, 'source warnings must not be mutated');
});

test('missing occupancy function fails closed and leaves warnings untouched', () => {
  const parts = [
    part('s', 'slope', 0, 0, 0, 0),
    part('lower', 'straight', 20, 0, 90, 0)
  ];
  const legacy = legacyWarnings(parts);
  const filtered = FILTER.filterApprovedSlopeUnderpassWarnings(legacy, { parts, catalog: PARTS });
  assert.deepEqual(filtered, legacy);
});
