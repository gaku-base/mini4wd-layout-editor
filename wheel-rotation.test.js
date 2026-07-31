const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createWheelRotationAccumulator } = require('./wheel-rotation.js');

test('wheel rotation consumes one direction at the threshold and does not multiply a large event', () => {
  const wheel = createWheelRotationAccumulator(40);
  assert.equal(wheel.push(120, 1000), 1);
  assert.equal(wheel.pending(), 0);
  assert.equal(wheel.push(-120, 1100), -1);
  assert.equal(wheel.pending(), 0);
});

test('small trackpad deltas accumulate into one rotation only', () => {
  const wheel = createWheelRotationAccumulator(40);
  assert.equal(wheel.push(10), 0);
  assert.equal(wheel.push(15), 0);
  assert.equal(wheel.push(14), 0);
  assert.equal(wheel.push(2), 1);
  assert.equal(wheel.push(1), 0);
});

test('rapid wheel events cannot rotate repeatedly during one scroll gesture', () => {
  const wheel = createWheelRotationAccumulator(40, 100);
  assert.equal(wheel.push(120, 1000), 1);
  assert.equal(wheel.push(120, 1050), 0);
  assert.equal(wheel.push(-120, 1099), 0);
  assert.equal(wheel.push(-120, 1100), -1);
});

test('wheel direction uses the same 45 degree steps as Z and X', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const wheel = app.slice(app.indexOf('function onWheel'), app.indexOf('function onKeyDown'));
  assert.match(wheel, /rotateCurrent\(direction < 0 \? -45 : 45\);/);
  assert.match(app, /if \(key === 'z'\) \{ e\.preventDefault\(\); rotateCurrent\(-45\); return; \}/);
  assert.match(app, /if \(key === 'x'\) \{ e\.preventDefault\(\); rotateCurrent\(45\); return; \}/);
  assert.match(wheel, /if \(e\.ctrlKey\) \{[\s\S]*return;[\s\S]*if \(e\.shiftKey \|\| e\.metaKey \|\| !hasWheelRotatableTarget\(\)\)/);
});
