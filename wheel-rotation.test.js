const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  classifyWheelInput,
  canonicalSelectionIds,
  createWheelRotationAccumulator
} = require('./wheel-rotation.js');

const WHEEL_SOURCE = fs.readFileSync(require.resolve('./wheel-rotation.js'), 'utf8');

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

test('selected part identity is complete, canonical, and order independent', () => {
  assert.deepEqual(canonicalSelectionIds(['part-b', 'part-a']), ['part-a', 'part-b']);
  assert.deepEqual(canonicalSelectionIds(['part-b', 'part-a', 'part-a']), ['part-a', 'part-b']);
  assert.deepEqual(canonicalSelectionIds([42, 'part-a']), ['42', 'part-a']);
  assert.deepEqual(canonicalSelectionIds(null), []);
  assert.notDeepEqual(
    canonicalSelectionIds(['part-a', 'part-b']),
    canonicalSelectionIds(['part-a', 'part-c'])
  );
});

test('simplified UI selection bridge injects complete selected IDs from diagnostic state', () => {
  assert.match(WHEEL_SOURCE, /const snapshot = originalGetState\(context\);/);
  assert.match(WHEEL_SOURCE, /canonicalize\(snapshot\?\.selectedIds\)/);
  assert.match(WHEEL_SOURCE, /data-simple-ui-selection-identity/);
  assert.match(WHEEL_SOURCE, /selection-ids:\$\{identity\}/);
});

test('simplified UI keeps a single workspace column at 720px and below', () => {
  assert.match(
    WHEEL_SOURCE,
    /@media \(max-width: 720px\) \{ body\.simple-ui-enabled \.workspace-shell \{ grid-template-columns: minmax\(0, 1fr\) !important; \} \}/
  );
  assert.match(WHEEL_SOURCE, /script\.addEventListener\('load',[\s\S]*simpleUiNarrowLayoutOverride/);
});

test('course parts keep 45 degree steps while venue areas use 5 degree wheel and Z/X rotation', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const wheel = app.slice(app.indexOf('function onWheel'), app.indexOf('function onKeyDown'));
  assert.match(wheel, /rotateCurrent\(direction < 0 \? -45 : 45, 'wheel'\);/);
  assert.match(wheel, /rotateActiveVenueArea\(direction < 0 \? -INITIAL_LAYOUT_FLOW\.ROTATION_STEP : INITIAL_LAYOUT_FLOW\.ROTATION_STEP, 'wheel'\)/);
  assert.match(app, /rotateActiveVenueArea\(-INITIAL_LAYOUT_FLOW\.ROTATION_STEP, 'keyboard-z'\)/);
  assert.match(app, /rotateActiveVenueArea\(INITIAL_LAYOUT_FLOW\.ROTATION_STEP, 'keyboard-x'\)/);
  assert.match(app, /rotateCurrent\(-45, 'keyboard-z'\)/);
  assert.match(app, /rotateCurrent\(45, 'keyboard-x'\)/);
  assert.match(wheel, /if \(e\.ctrlKey\) \{[\s\S]*return;[\s\S]*if \(e\.shiftKey \|\| e\.metaKey \|\| !hasWheelRotatableTarget\(\)\)/);
});
