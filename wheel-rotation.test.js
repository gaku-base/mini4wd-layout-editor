const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { classifyWheelInput, createWheelRotationAccumulator } = require('./wheel-rotation.js');

test('line and page wheel events rotate immediately as physical notches', () => {
  const wheel = createWheelRotationAccumulator();
  assert.equal(classifyWheelInput({ deltaY: 1, deltaMode: 1 }), 'notched-wheel');
  assert.equal(classifyWheelInput({ deltaY: -1, deltaMode: 2 }), 'notched-wheel');
  assert.equal(wheel.push({ deltaY: 1, deltaMode: 1 }, 1000), 1);
  assert.equal(wheel.push({ deltaY: -1, deltaMode: 2 }, 1001), -1);
});

test('large pixel deltas rotate once immediately without inferring extra notches', () => {
  const wheel = createWheelRotationAccumulator();
  assert.equal(classifyWheelInput({ deltaY: 20, deltaMode: 0 }), 'notched-wheel');
  assert.equal(wheel.push({ deltaY: 20, deltaMode: 0 }, 1000), 1);
  assert.equal(wheel.push({ deltaY: -240, deltaMode: 0 }, 1001), -1);
  assert.equal(wheel.pending(), 0);
});

test('three rapid physical notches produce three turns without the trackpad cooldown', () => {
  const wheel = createWheelRotationAccumulator();
  assert.equal(wheel.push({ deltaY: 20, deltaMode: 0 }, 1000), 1);
  assert.equal(wheel.push({ deltaY: 20, deltaMode: 0 }, 1010), 1);
  assert.equal(wheel.push({ deltaY: 20, deltaMode: 0 }, 1020), 1);
});

test('fine pixel trackpad input accumulates while inertia remains suppressed', () => {
  const wheel = createWheelRotationAccumulator(30, 100);
  assert.equal(classifyWheelInput({ deltaY: 8, deltaMode: 0 }), 'continuous-trackpad');
  assert.equal(wheel.push({ deltaY: 8, deltaMode: 0 }, 1000), 0);
  assert.equal(wheel.push({ deltaY: 12, deltaMode: 0 }, 1010), 0);
  assert.equal(wheel.push({ deltaY: 10, deltaMode: 0 }, 1020), 1);
  assert.equal(wheel.push({ deltaY: 8, deltaMode: 0 }, 1050), 0);
  assert.equal(wheel.push({ deltaY: 8, deltaMode: 0 }, 1120), 0);
});

test('wheel direction uses the same 45 degree steps as Z and X', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const wheel = app.slice(app.indexOf('function onWheel'), app.indexOf('function onKeyDown'));
  assert.match(wheel, /rotateCurrent\(direction < 0 \? -45 : 45\);/);
  assert.match(app, /if \(key === 'z'\) \{ e\.preventDefault\(\); rotateCurrent\(-45\); return; \}/);
  assert.match(app, /if \(key === 'x'\) \{ e\.preventDefault\(\); rotateCurrent\(45\); return; \}/);
  assert.match(wheel, /if \(e\.ctrlKey\) \{[\s\S]*return;[\s\S]*if \(e\.shiftKey \|\| e\.metaKey \|\| !hasWheelRotatableTarget\(\)\)/);
});
