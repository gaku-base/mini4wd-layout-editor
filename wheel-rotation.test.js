const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  classifyWheelInput,
  canonicalSelectionIds,
  createWheelRotationAccumulator
} = require('./wheel-rotation.js');

const WHEEL_SOURCE = fs.readFileSync(require.resolve('./wheel-rotation.js'), 'utf8');
const BOOTSTRAP_SOURCE = fs.readFileSync(require.resolve('./editor-extensions-bootstrap.js'), 'utf8');

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

test('temporary selection identity compatibility bridge stays small and explicit', () => {
  assert.match(WHEEL_SOURCE, /function prepareEditorExtensionBridge/);
  assert.match(WHEEL_SOURCE, /const snapshot = originalGetState\(context\);/);
  assert.match(WHEEL_SOURCE, /canonicalize\(snapshot\?\.selectedIds\)/);
  assert.match(WHEEL_SOURCE, /getElementById\('simpleUiSelectionIdentity'\)/);
  assert.match(WHEEL_SOURCE, /marker\.dataset\.selectedIds = identity/);
  assert.match(WHEEL_SOURCE, /editor-extensions-bootstrap\.js\?v=v1\.1-rc6-health1/);
  assert.doesNotMatch(WHEEL_SOURCE, /function integrateModeHelpIntoToolbar/);
  assert.doesNotMatch(WHEEL_SOURCE, /const loadPresentationMode/);
  assert.doesNotMatch(WHEEL_SOURCE, /presentation-mode\.css/);
});

test('extension bootstrap owns the private runtime bridge lifetime', () => {
  assert.match(WHEEL_SOURCE, /root\.__COURSE_ENABLE_DEBUG__ = true/);
  assert.match(BOOTSTRAP_SOURCE, /root\.__COURSE_ENABLE_DEBUG__ = false/);
  assert.match(BOOTSTRAP_SOURCE, /delete root\.__mini4wdCourseDebug/);
  assert.doesNotMatch(BOOTSTRAP_SOURCE, /Object\.defineProperty\(root, '__COURSE_ENABLE_DEBUG__'/);
});

test('Start replacement snap, marquee preview and presentation mode load before simple-ui', () => {
  const startSnapIndex = BOOTSTRAP_SOURCE.indexOf('start-replacement-snap.js?v=${CACHE_KEY}');
  const previewIndex = BOOTSTRAP_SOURCE.indexOf('marquee-target-preview.js?v=${CACHE_KEY}');
  const presentationIndex = BOOTSTRAP_SOURCE.indexOf('presentation-mode.js?v=${CACHE_KEY}');
  const simpleUiIndex = BOOTSTRAP_SOURCE.indexOf('simple-ui.js?v=${CACHE_KEY}');
  assert.ok(startSnapIndex >= 0, 'Start replacement snap loader must exist');
  assert.ok(previewIndex >= 0, 'marquee preview loader must exist');
  assert.ok(presentationIndex >= 0, 'presentation mode loader must exist');
  assert.ok(simpleUiIndex >= 0, 'simple-ui loader must exist');
  assert.match(BOOTSTRAP_SOURCE, /function loadStartReplacementSnap\(\)/);
  assert.match(BOOTSTRAP_SOURCE, /function loadMarqueePreview\(\)/);
  assert.match(BOOTSTRAP_SOURCE, /function loadPresentationMode\(\)/);
  assert.match(BOOTSTRAP_SOURCE, /presentation-data\.js\?v=\$\{CACHE_KEY\}/);
  assert.match(BOOTSTRAP_SOURCE, /presentation-renderer\.js\?v=\$\{CACHE_KEY\}/);
  assert.match(BOOTSTRAP_SOURCE, /presentation-export\.js\?v=\$\{CACHE_KEY\}/);
  assert.match(BOOTSTRAP_SOURCE, /script\.addEventListener\('load', continueBoot/);
  assert.match(BOOTSTRAP_SOURCE, /script\.addEventListener\('error', continueBoot/);
});

test('simplified UI keeps a single workspace column at 720px and below', () => {
  assert.match(
    BOOTSTRAP_SOURCE,
    /@media \(max-width: 720px\) \{ body\.simple-ui-enabled \.workspace-shell \{ grid-template-columns: minmax\(0, 1fr\) !important; \} \}/
  );
  assert.match(BOOTSTRAP_SOURCE, /simpleUiNarrowLayoutOverride/);
});

test('mode instruction is integrated into the canvas toolbar instead of floating over the course', () => {
  assert.match(BOOTSTRAP_SOURCE, /function integrateModeHelpIntoToolbar\(\)/);
  assert.match(BOOTSTRAP_SOURCE, /getElementById\('canvasToolbar'\)/);
  assert.match(BOOTSTRAP_SOURCE, /getElementById\('instruction'\)/);
  assert.match(BOOTSTRAP_SOURCE, /toolbar\.insertBefore\(instruction, rightGroup\)/);
  assert.match(BOOTSTRAP_SOURCE, /instruction\.classList\.add\('toolbar-mode-help'\)/);
  assert.match(BOOTSTRAP_SOURCE, /\.canvas-toolbar \.toolbar-mode-help \{[\s\S]*position:\s*static !important;/);
  assert.match(BOOTSTRAP_SOURCE, /background:\s*transparent !important;/);
  assert.match(BOOTSTRAP_SOURCE, /box-shadow:\s*none !important;/);
  assert.match(BOOTSTRAP_SOURCE, /flex-direction:\s*row;/);
  assert.match(BOOTSTRAP_SOURCE, /text-overflow:\s*ellipsis;/);
  assert.match(BOOTSTRAP_SOURCE, /is-sub-edit-active/);
});

test('sub-edit bar suppresses the overlapping instruction card', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  assert.match(
    index,
    /#subEditModeBar:not\(\[hidden\]\) ~ \.instruction-card \{ display: none !important; \}/
  );
});

test('hidden sub-edit bar cannot be revived by the base display grid rule', () => {
  assert.match(BOOTSTRAP_SOURCE, /\.sub-edit-mode-bar\[hidden\] \{ display: none !important; \}/);
  assert.match(BOOTSTRAP_SOURCE, /hiddenGuard\.id = 'subEditHiddenGuard'/);
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
  assert.match(wheel, /if \(e\.ctrlKey\) \{[\s\S]*return;[\s\S]*if \(e\.shiftKey \|\| e\.metaKey \|\| !hasWheelRotatableTarget\(\)/);
});
