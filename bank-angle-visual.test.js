'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

test('endpoint bank state preserves cumulative angles instead of clamping to 0 or 20', () => {
  assert.match(app, /Number\.isFinite\(angle\).*bankAngle:/s);
  assert.doesNotMatch(app, /Number\(value\.bankAngle\) === 20 \? 20 : 0/);
});

test('Bank20 placement derives the next angle from its attached connector', () => {
  assert.match(app, /bankTransitionForDefinition\(PARTS\[type\], incoming\.bankAngle, attachedIndex\)/);
  assert.match(app, /outgoingAngleDeg/);
  assert.match(app, /midpointAngleDeg/);
});

test('bank recalculation still updates physical connector bankAngleDeg for downstream parts', () => {
  assert.match(app, /part\.bankAngleDeg = value\.bankAngle - \(Number\(attachedConnector\?\.bankAngleDeg\) \|\| 0\)/);
});

test('LAYOUT keeps banked parts on their true plan-view footprint', () => {
  const start = app.indexOf('function drawPart(c, part');
  const end = app.indexOf('function drawPartConnectionFaces', start);
  const block = app.slice(start, end);
  assert.match(block, /const bankProjection = null/);
  assert.doesNotMatch(block, /applyBankVisualProjection/);
  assert.doesNotMatch(app, /function drawBankedCorner45/);
  assert.doesNotMatch(app, /function bankFaceProjection/);
});

test('banked corners use the same ordinary 45-degree plan renderer as flat corners', () => {
  const start = app.indexOf('function drawCorner45');
  const end = app.indexOf('function tracePartShapePath', start);
  const block = app.slice(start, end);
  assert.match(block, /const trackWidth = g\.ro - g\.ri/);
  assert.match(block, /c\.arc\(0, 0, g\.r, g\.startAngle, g\.endAngle, false\)/);
  assert.doesNotMatch(block, /bankAngle|projectedTrackWidth|createRadialGradient/);
});

test('Bank20 fallback renderer stays rectangular in plan view', () => {
  const start = app.indexOf('function drawBankGraphic');
  const end = app.indexOf('function drawJumpGraphic', start);
  const block = app.slice(start, end);
  assert.match(block, /c\.fillRect\(vx, vy, def\.w, def\.h\)/);
  assert.match(block, /c\.strokeRect\(vx, vy, def\.w, def\.h\)/);
  assert.doesNotMatch(block, /bankProjectionScale|projectY|pivotY/);
});

test('banked connection seams use physical connector width without visual projection', () => {
  const ownedStart = app.indexOf('function drawOwnedConnectionSeams');
  const ownedEnd = app.indexOf('function drawExport', ownedStart);
  const owned = app.slice(ownedStart, ownedEnd);
  assert.match(owned, /Number\(seam\.connectionWidthMm\)/);
  assert.doesNotMatch(owned, /projection|centerOffsetCm/);

  const faceStart = app.indexOf('function drawPartConnectionFaces');
  const faceEnd = app.indexOf('function drawTileShadow', faceStart);
  const faces = app.slice(faceStart, faceEnd);
  assert.match(faces, /PART_SEAMS\.connectorFace\(endpoint/);
  assert.doesNotMatch(faces, /projectedEndpoint|bankFaceProjection/);
});
