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

test('bank recalculation updates physical connector bankAngleDeg for downstream parts', () => {
  assert.match(app, /part\.bankAngleDeg = value\.bankAngle - \(Number\(attachedConnector\?\.bankAngleDeg\) \|\| 0\)/);
});

test('ordinary banked parts are visually projected from one course edge before rendering', () => {
  assert.match(app, /const bankProjection = applyBankVisualProjection\(c, part, def\)/);
  assert.match(app, /bankProjectionTransform\(def, angle, bankVisualPivotSign\(part, def\)\)/);
  assert.match(app, /function bankVisualPivotSign\(part, def/);
});

test('Bank20 uses a one-edge-pivot tapered transition that matches each connector angle', () => {
  assert.match(app, /const leftScale = LAYOUT_GRAPH\.bankProjectionScale\(leftAngle\)/);
  assert.match(app, /const rightScale = LAYOUT_GRAPH\.bankProjectionScale\(rightAngle\)/);
  assert.match(app, /const pivotY = half \* pivotSign/);
  assert.match(app, /const projectY = \(y, scale\) => pivotY \+ \(y - pivotY\) \* scale/);
  assert.match(app, /c\.moveTo\(x0, leftTop\)/);
  assert.match(app, /c\.lineTo\(x1, rightTop\)/);
});

test('banked seams use the projected width and the same one-edge visual offset', () => {
  assert.match(app, /projectedWidthMm[\s\S]*bankProjectionScale/);
  assert.match(app, /centerOffsetCm/);
  assert.match(app, /seam\.bankAngleDeg[\s\S]*bankFaceProjection/);
});


test('banked 45-degree corners use a local curved roll projection instead of one global affine squeeze', () => {
  assert.match(app, /const usesLocalCurvedBankProjection = !!def\.corner45/);
  assert.match(app, /mode: 'curved-local'/);
  assert.match(app, /function drawBankedCorner45\(c, def, part, g\)/);
  assert.match(app, /const projectedTrackWidth = fullTrackWidth \* scale/);
  assert.match(app, /const innerRadius = pivotSign >= 0[\s\S]*g\.ri[\s\S]*g\.ro - projectedTrackWidth/);
  assert.match(app, /const outerRadius = pivotSign >= 0[\s\S]*g\.ri \+ projectedTrackWidth[\s\S]*g\.ro/);
  assert.match(app, /drawCorner45\(c, def, exportMode, part\)/);
});

test('banked corner rendering keeps logical connectors untouched while emphasizing curved high and low edges', () => {
  const start = app.indexOf('function drawBankedCorner45');
  const end = app.indexOf('function drawCorner45', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /part\.x\s*=|part\.y\s*=|connector/);
  assert.match(block, /rgba\(255,255,255,\.62\)/);
  assert.match(block, /shadeColor\(def\.edge, -\.18\)/);
  assert.match(block, /for \(const t of \[1 \/ 3, 2 \/ 3\]\)/);
});
