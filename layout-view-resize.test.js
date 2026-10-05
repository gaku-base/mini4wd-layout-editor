'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('app.js','utf8');

test('canvas resize preserves the current world centre by half the CSS size delta', () => {
  assert.match(source, /const previousWidth = Number\.parseFloat\(els\.courseCanvas\.style\.width\)/);
  assert.match(source, /state\.view\.offsetX \+= \(nextWidth - previousWidth\) \/ 2/);
  assert.match(source, /state\.view\.offsetY \+= \(nextHeight - previousHeight\) \/ 2/);
});

test('explicit fitView suppresses resize centre compensation for that frame', () => {
  assert.match(source, /let skipCanvasCenterPreservationOnce = false/);
  assert.match(source, /function fitView\(\) \{[\s\S]*?skipCanvasCenterPreservationOnce = true;/);
  assert.match(source, /if \(!skipCanvasCenterPreservationOnce[\s\S]*?state\.view\.offsetX/);
  assert.match(source, /skipCanvasCenterPreservationOnce = false;[\s\S]*?dpr = frame\.dpr/);
});
