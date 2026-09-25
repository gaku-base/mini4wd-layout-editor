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

test('ordinary banked parts are visually projected before SVG or Canvas rendering', () => {
  assert.match(app, /const bankProjection = applyBankVisualProjection\(c, part, def\)/);
  assert.match(app, /bankProjectionTransform\(def, angle\)/);
});

test('Bank20 uses a tapered transition that matches the bank angle at each connector', () => {
  assert.match(app, /const leftScale = LAYOUT_GRAPH\.bankProjectionScale\(leftAngle\)/);
  assert.match(app, /const rightScale = LAYOUT_GRAPH\.bankProjectionScale\(rightAngle\)/);
  assert.match(app, /c\.moveTo\(x0, -half \* leftScale\)/);
  assert.match(app, /c\.lineTo\(x1, -half \* rightScale\)/);
});

test('banked seam widths use the same projected width as the visible course', () => {
  assert.match(app, /projectedWidthMm[\s\S]*bankProjectionScale/);
  assert.match(app, /seam\.bankAngleDeg[\s\S]*bankProjectionScale/);
});
