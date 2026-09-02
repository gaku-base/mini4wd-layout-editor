'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');
const PROFILE = require('./slope-longitudinal-profile.js');
const UNDERPASS = require('./slope-underpass-overlap.js');

function loadCatalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = loadCatalog();
const PARTS = CATALOG.PARTS;
const toMm = polygon => polygon.map(point => ({ x: point.x * 10, y: point.y * 10 }));
const editorPart = (id, type, x, y, rotation = 0, zMm = 0) => ({ id, type, x, y, rotation, zMm });
const editorPolygonMm = part => toMm(GRAPH.occupancyPolygon(part, PARTS[part.type]));
const slopePlacementMm = part => ({
  positionMm: { x: part.x * 10, y: part.y * 10 },
  rotationDeg: part.rotation
});

function classifyEditorPair(slope, lower) {
  return UNDERPASS.classifySlopeUnderpassPolygonOverlap({
    slopePlacement: slopePlacementMm(slope),
    slopeFootprintPolygonMm: editorPolygonMm(slope),
    lowerCoursePolygonMm: editorPolygonMm(lower)
  });
}

function rect(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}

const slopeFootprintMm = rect(-270, -180, 270, 180);
const slopeAtOrigin = { positionMm: { x: 0, y: 0 }, rotationDeg: 0 };

test('uses the single approved 272mm boundary from the verified slope profile', () => {
  assert.equal(PROFILE.status, 'verified');
  assert.equal(PROFILE.floorBlockingSideWallLengthMm, 270);
  assert.equal(PROFILE.underpassSafetyMarginMm, 2);
  assert.equal(PROFILE.underpassBlockedThroughXMm, 272);

  const atBoundary = UNDERPASS.classifySlopeUnderpassPolygonOverlap({
    slopePlacement: slopeAtOrigin,
    slopeFootprintPolygonMm: slopeFootprintMm,
    lowerCoursePolygonMm: rect(2, -50, 100, 50)
  });
  assert.equal(atBoundary.overlapMinXMm, 272);
  assert.equal(atBoundary.status, 'blocked-by-underpass-zone');
  assert.equal(atBoundary.reasonCode, 'overlap-enters-272mm-blocked-zone');

  const justBeyond = UNDERPASS.classifySlopeUnderpassPolygonOverlap({
    slopePlacement: slopeAtOrigin,
    slopeFootprintPolygonMm: slopeFootprintMm,
    lowerCoursePolygonMm: rect(2.001, -50, 100, 50)
  });
  assert.ok(justBeyond.overlapMinXMm > 272);
  assert.equal(justBeyond.status, 'clear-by-approved-rule');
  assert.equal(justBeyond.reasonCode, 'overlap-entirely-beyond-272mm');
});

test('actual editor straight polygon is blocked when it crosses the low-side zone', () => {
  const slope = editorPart('s', 'slope', 0, 0, 0);
  const lower = editorPart('low', 'straight', 0, 0, 90);
  const result = classifyEditorPair(slope, lower);
  assert.equal(result.status, 'blocked-by-underpass-zone');
  assert.ok(result.overlapMinXMm < 272);
  assert.ok(result.overlapAreaMm2 > 0);
});

test('actual editor straight polygon clears when its full overlap is on the high side', () => {
  const slope = editorPart('s', 'slope', 0, 0, 0);
  const lower = editorPart('high', 'straight', 20, 0, 90);
  const result = classifyEditorPair(slope, lower);
  assert.equal(result.status, 'clear-by-approved-rule');
  assert.ok(result.overlapMinXMm > 272);
  assert.ok(result.overlapMaxXMm <= 540 + 1e-7);
});

test('actual editor straight polygon respects the 272mm edge instead of using its centre position', () => {
  const slope = editorPart('s', 'slope', 0, 0, 0);
  const boundary = editorPart('boundary', 'straight', 18.2, 0, 90);
  const beyond = editorPart('beyond', 'straight', 18.2001, 0, 90);

  const boundaryResult = classifyEditorPair(slope, boundary);
  const beyondResult = classifyEditorPair(slope, beyond);
  assert.equal(boundaryResult.status, 'blocked-by-underpass-zone');
  assert.ok(boundaryResult.overlapMinXMm <= 272 + 1e-7);
  assert.equal(beyondResult.status, 'clear-by-approved-rule');
  assert.ok(beyondResult.overlapMinXMm > 272);
});

test('diagonal crossing uses the intersecting polygon extent, not a centred 90-degree assumption', () => {
  const slope = editorPart('s', 'slope', 0, 0, 0);
  const lowSideDiagonal = editorPart('diag-low', 'straight', 30, 0, 45);
  const highSideDiagonal = editorPart('diag-high', 'straight', 35, 0, 45);

  const lowResult = classifyEditorPair(slope, lowSideDiagonal);
  const highResult = classifyEditorPair(slope, highSideDiagonal);
  assert.equal(lowResult.status, 'blocked-by-underpass-zone');
  assert.ok(lowResult.overlapMinXMm < 272);
  assert.equal(highResult.status, 'clear-by-approved-rule');
  assert.ok(highResult.overlapMinXMm > 272);
});

test('rotating the slope rotates the low-to-high axis used by the same polygon rule', () => {
  const slope = editorPart('s', 'slope', 0, 0, 90);
  const lowerHighSide = editorPart('high-y', 'straight', 0, 20, 0);
  const lowerLowSide = editorPart('low-y', 'straight', 0, 0, 0);

  const highResult = classifyEditorPair(slope, lowerHighSide);
  const lowResult = classifyEditorPair(slope, lowerLowSide);
  assert.equal(highResult.status, 'clear-by-approved-rule');
  assert.ok(highResult.overlapMinXMm > 272);
  assert.equal(lowResult.status, 'blocked-by-underpass-zone');
});

test('a lower-course polygon outside the slope footprint is not an underpass overlap', () => {
  const slope = editorPart('s', 'slope', 0, 0, 0);
  const lower = editorPart('far', 'straight', 100, 0, 90);
  const result = classifyEditorPair(slope, lower);
  assert.equal(result.status, 'no-overlap');
  assert.equal(result.overlapAreaMm2, 0);
  assert.equal(result.overlapMinXMm, null);
});

test('invalid or string-valued geometry stays indeterminate instead of being coerced', () => {
  const invalid = UNDERPASS.classifySlopeUnderpassPolygonOverlap({
    slopePlacement: { positionMm: { x: '0', y: 0 }, rotationDeg: 0 },
    slopeFootprintPolygonMm: slopeFootprintMm,
    lowerCoursePolygonMm: rect(10, -50, 100, 50)
  });
  assert.equal(invalid.status, 'indeterminate');
  assert.equal(invalid.reasonCode, 'invalid-input');
  assert.ok(invalid.missing.includes('slopePlacement.positionMm.x'));

  const invalidPolygon = UNDERPASS.classifySlopeUnderpassPolygonOverlap({
    slopePlacement: slopeAtOrigin,
    slopeFootprintPolygonMm: slopeFootprintMm,
    lowerCoursePolygonMm: [{ x: '3', y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
  });
  assert.equal(invalidPolygon.status, 'indeterminate');
  assert.ok(invalidPolygon.missing.includes('lowerCoursePolygonMm'));
});

test('polygon classification is pure and does not mutate caller geometry', () => {
  const input = {
    slopePlacement: { positionMm: { x: 12, y: -8 }, rotationDeg: 45 },
    slopeFootprintPolygonMm: rect(-270, -180, 270, 180),
    lowerCoursePolygonMm: rect(50, -100, 180, 100)
  };
  const before = JSON.stringify(input);
  UNDERPASS.classifySlopeUnderpassPolygonOverlap(input);
  assert.equal(JSON.stringify(input), before);
});
