'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('./index.html', 'utf8');
const app = fs.readFileSync('./app.js', 'utf8');
const styles = fs.readFileSync('./styles.css', 'utf8');

test('straight color behavior selector exposes the requested two modes with slope conversion as default', () => {
  assert.match(index, /id="straightColorBehaviorSelect"/);
  assert.match(index, /<option value="slope-by-color" selected>デフォルト（赤=上り／青=下り）<\/option>/);
  assert.match(index, /<option value="color-only">カラーでのパーツ変更なし<\/option>/);
  assert.doesNotMatch(index, /id="colorPanel" class="panel compact-panel"/);
});

test('straight color behavior runtime is loaded before app captures it', () => {
  const behaviorIndex = index.indexOf('<script src="straight-color-behavior.js"></script>');
  const appIndex = index.indexOf('<script src="app.js"></script>');
  assert.ok(behaviorIndex >= 0, 'behavior runtime script must be present');
  assert.ok(appIndex > behaviorIndex, 'behavior runtime must load before app.js');
  assert.match(app, /const STRAIGHT_COLOR_BEHAVIOR = window\.M4WD_STRAIGHT_COLOR_BEHAVIOR/);
});

test('color panel uses direct selectable palette buttons so blue remains reachable in conversion mode', () => {
  assert.match(app, /data-color-key="\$\{color\.key\}"/);
  assert.match(app, /function setPaintColor\(colorKey/);
  assert.match(app, /els\.colorLegend\?\.addEventListener\('click'/);
  assert.match(styles, /\.color-chip\.active/);
});

test('color mode applies the selected exact color instead of depending on a cycle through red first', () => {
  const pointerSection = app.slice(app.indexOf("} else if (state.mode === 'color') {"), app.indexOf('function onPointerMove'));
  assert.match(pointerSection, /applyExactColor\(ids, state\.paintColorKey\)/);
  assert.doesNotMatch(pointerSection, /cyclePartsColor\(ids\)/);

  const keySection = app.slice(app.indexOf('function onKeyDown'), app.indexOf('function clearSnapTargetChoice'));
  assert.match(keySection, /applyExactColor\(state\.selectedIds, state\.paintColorKey\)/);
});

test('behavior preference is app-local and does not change layout JSON schema', () => {
  assert.match(app, /mini4wd-straight-color-behavior-v1/);
  assert.match(app, /window\.localStorage\?\.setItem\(STRAIGHT_COLOR_BEHAVIOR_STORAGE_KEY/);
  const serialize = app.slice(app.indexOf('function serializeState()'), app.indexOf('function migratedPartType'));
  assert.doesNotMatch(serialize, /straightColorBehavior|paintColorKey/);
});

test('UI command applies the pure conversion result before recalculating bank and collision state', () => {
  const section = app.slice(app.indexOf('function applyColorRequestsToLayout'), app.indexOf('function applyExactColor'));
  assert.match(section, /STRAIGHT_COLOR_BEHAVIOR\.applyColorRequests/);
  assert.match(section, /state\.parts = result\.parts/);
  assert.match(section, /state\.connections = result\.edges/);
  assert.ok(section.indexOf('state.parts = result.parts') < section.indexOf('recalculateBankStates()'));
  assert.ok(section.indexOf('recalculateBankStates()') < section.indexOf('recalculateLayoutWarnings()'));
  assert.match(section, /snapshot\(\)/);
  assert.match(section, /persistLocal\(\); updateUI\(\); render\(\)/);
});

test('debug bridge exposes behavior controls for browser regression without changing persistence schema', () => {
  assert.match(app, /setStraightColorBehavior: value => setStraightColorBehavior\(value\)/);
  assert.match(app, /setPaintColor: value => setPaintColor\(value, \{ applySelection: false \}\)/);
  assert.match(app, /applyColorToSelection: colorKey => applyExactColor\(state\.selectedIds, colorKey\)/);
});
