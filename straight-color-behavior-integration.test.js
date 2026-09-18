'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('./index.html', 'utf8');
const app = fs.readFileSync('./app.js', 'utf8');
const persistence = fs.readFileSync('./persistence.js', 'utf8');

test('straight color behavior engine loads before app.js', () => {
  const behavior = index.indexOf('<script src="straight-color-behavior.js"></script>');
  const appScript = index.indexOf('<script src="app.js"></script>');
  assert.ok(behavior >= 0, 'straight-color-behavior.js must be loaded');
  assert.ok(appScript > behavior, 'behavior engine must load before app.js captures it');
});

test('selection panel exposes both requested straight color behaviors with slope mode first/default', () => {
  assert.match(index, /id="straightColorBehaviorSelect"/);
  const slopeOption = index.indexOf('<option value="slope-by-color">デフォルト（赤=上り \/ 青=下り）<\/option>');
  const colorOnlyOption = index.indexOf('<option value="color-only">カラーのみ（パーツ変更なし）<\/option>');
  assert.ok(slopeOption >= 0);
  assert.ok(colorOnlyOption > slopeOption);
});

test('app defaults to slope-by-color and routes color changes through the pure behavior engine', () => {
  assert.match(app, /straightColorBehavior:\s*STRAIGHT_COLOR_BEHAVIOR\.MODE_SLOPE_BY_COLOR/);
  assert.match(app, /STRAIGHT_COLOR_BEHAVIOR\.applyColorChange\(\{/);
  assert.match(app, /mode:\s*state\.straightColorBehavior/);
  assert.match(app, /state\.straightColorBehavior = STRAIGHT_COLOR_BEHAVIOR\.normalizeMode\(els\.straightColorBehaviorSelect\.value\)/);
});

test('behavior selector is runtime-only and does not change the existing layout persistence schema', () => {
  const serializeStart = app.indexOf('function serializeState');
  const serializeEnd = app.indexOf('function migratedPartType', serializeStart);
  const serialize = app.slice(serializeStart, serializeEnd);
  assert.doesNotMatch(serialize, /straightColorBehavior|colorSlopeRole/);
  assert.doesNotMatch(app, /STRAIGHT_COLOR_BEHAVIOR_STORAGE_KEY/);
  assert.doesNotMatch(app, /colorSlopeRole/);
  assert.doesNotMatch(persistence, /colorSlopeRole|straightColorBehavior/);
});

test('blocked semantic conversion does not consume an undo snapshot', () => {
  const start = app.indexOf('function cyclePartsColor');
  const end = app.indexOf('function rotateCurrent', start);
  const section = app.slice(start, end);
  assert.match(section, /let snapshotTaken = false/);
  assert.match(section, /if \(result\.status === 'blocked'\)[\s\S]*continue/);
  assert.doesNotMatch(section, /if \(!changedCount\)[\s\S]*state\.history\.pop/);
});
