'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');
const POLICY = require('./slope-underpass-pair-policy.js');

function loadCatalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = loadCatalog();
const PARTS = CATALOG.PARTS;
const toMm = polygon => polygon.map(point => ({ x: point.x * 10, y: point.y * 10 }));
const part = (id, type, x, y, rotation = 0, zMm = 0) => ({ id, type, x, y, rotation, zMm });
const polygonMm = value => toMm(GRAPH.occupancyPolygon(value, PARTS[value.type]));

function classify(slope, lower) {
  return POLICY.classifyApprovedSlopeUnderpassPair({
    slopePart: slope,
    lowerPart: lower,
    slopeDefinition: PARTS.slope,
    lowerDefinition: PARTS[lower.type],
    slopeFootprintPolygonMm: polygonMm(slope),
    lowerCoursePolygonMm: polygonMm(lower)
  });
}

test('approved flat lower-course definitions are limited to level non-special course parts', () => {
  for (const type of ['straight', 'corner-45-right', 'corner-45-left', 'lanechange', 'wave', 'start']) {
    assert.equal(POLICY.isApprovedFlatLowerDefinition(PARTS[type]), true, `${type} should be approved flat`);
  }
  for (const type of ['slope', 'bank20', 'lcjump', 'burning']) {
    assert.equal(POLICY.isApprovedFlatLowerDefinition(PARTS[type]), false, `${type} must stay outside approved flat policy`);
  }
});

test('same-base flat course on high side is eligible for clear-underpass', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  const lower = part('lower', 'straight', 20, 0, 90, 0);
  const result = classify(slope, lower);
  assert.equal(result.status, 'clear-underpass');
  assert.equal(result.reasonCode, 'same-level-flat-course-beyond-272mm');
  assert.equal(result.level.status, 'same-base-level');
  assert.equal(result.xy.status, 'clear-by-approved-rule');
});

test('same-base flat course entering low-side zone stays blocked', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  const lower = part('lower', 'straight', 0, 0, 90, 0);
  const result = classify(slope, lower);
  assert.equal(result.status, 'blocked-underpass');
  assert.equal(result.reasonCode, 'same-level-flat-course-enters-272mm-zone');
  assert.equal(result.xy.status, 'blocked-by-underpass-zone');
});

test('different base level is conservatively not applicable instead of being auto-cleared', () => {
  const slope = part('s', 'slope', 0, 0, 0, 115);
  const lower = part('lower', 'straight', 20, 0, 90, 0);
  const result = classify(slope, lower);
  assert.equal(result.status, 'not-applicable');
  assert.equal(result.reasonCode, 'base-level-differs');
  assert.equal(result.level.slopeBaseZMm, 115);
  assert.equal(result.level.lowerBaseZMm, 0);
});

test('bank, another slope, LC jump and burning are never auto-cleared by the flat-course rule', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  for (const type of ['bank20', 'slope', 'lcjump', 'burning']) {
    const lower = part(`lower-${type}`, type, 20, 0, 90, 0);
    const result = classify(slope, lower);
    assert.equal(result.status, 'not-applicable', type);
    assert.equal(result.reasonCode, 'lower-part-not-approved-flat-course', type);
  }
});

test('diagonal same-base flat course uses polygon result through the pair policy', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  const blocked = part('blocked', 'straight', 30, 0, 45, 0);
  const clear = part('clear', 'straight', 35, 0, 45, 0);
  assert.equal(classify(slope, blocked).status, 'blocked-underpass');
  assert.equal(classify(slope, clear).status, 'clear-underpass');
});

test('missing or string-valued Z stays indeterminate', () => {
  const slope = part('s', 'slope', 0, 0, 0, 0);
  const lower = part('lower', 'straight', 20, 0, 90, 0);
  lower.zMm = '0';
  const result = classify(slope, lower);
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reasonCode, 'base-level-unknown');
});

test('non-slope upper part does not enter the slope policy', () => {
  const upper = part('upper', 'straight', 0, 0, 0, 0);
  const lower = part('lower', 'straight', 20, 0, 90, 0);
  const result = POLICY.classifyApprovedSlopeUnderpassPair({
    slopePart: upper,
    lowerPart: lower,
    slopeDefinition: PARTS.straight,
    lowerDefinition: PARTS.straight,
    slopeFootprintPolygonMm: polygonMm(upper),
    lowerCoursePolygonMm: polygonMm(lower)
  });
  assert.equal(result.status, 'not-applicable');
  assert.equal(result.reasonCode, 'upper-part-is-not-slope');
});
