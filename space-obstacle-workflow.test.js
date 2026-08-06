'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('course-obstacle warnings are added to shared layout warnings and are not exported', () => {
  assert.match(app, /const obstacleInterference = courseObstacleWarnings\(parts\)/);
  assert.match(app, /\.\.\.obstacleInterference/);
  assert.match(app, /warning\.type === 'obstacle-interference'/);
  const exportSection = app.slice(app.indexOf('function drawExport'), app.indexOf('function dateStamp'));
  assert.doesNotMatch(exportSection, /drawLayoutWarnings/);
});

test('sub-edit mode bar has return and finish controls that clear transient editing state', () => {
  assert.match(html, /id="subEditModeBar"/);
  assert.match(html, /id="returnToSetupBtn"/);
  assert.match(html, /id="finishSubEditBtn"/);
  const exitSection = app.slice(app.indexOf('function exitSubEditMode'), app.indexOf('function applySetup'));
  assert.match(exitSection, /cleanupEditorModeState\(\)/);
  assert.match(exitSection, /state\.subEditMode = null/);
  assert.match(exitSection, /setNewLayoutModalTab\(NEW_LAYOUT_TABS\.DEFAULT_TAB\)/);
  assert.doesNotMatch(exitSection, /snapshot\(/);
  assert.match(html, /id="addObstacleFromBarBtn"/);
  assert.match(html, /id="repeatObstaclePlacementBtn"/);
  assert.doesNotMatch(html, />スペース修正へ戻る</);
  assert.match(html, />同じものをもう1個</);
  assert.match(html, />設置不可エリアを追加</);
});

test('selected cutouts and obstacles expose clear, rotate, duplicate, and delete controls', () => {
  ['rotateCutoutLeftBtn', 'rotateCutoutRightBtn', 'clearCutoutSelectionBtn', 'rotateObstacleLeftBtn', 'rotateObstacleRightBtn', 'clearObstacleSelectionBtn', 'duplicateObstacleBtn', 'deleteObstacleBtn'].forEach(id => {
    assert.match(html, new RegExp(`id="${id}"`));
  });
  assert.match(app, /function rotateSelectedCutout\(delta\)/);
  assert.match(app, /function rotateSelectedObstacle\(delta\)/);
  assert.match(app, /obstacle\.locked\) return setObstacleEditorError/);
  assert.match(app, /e\.target instanceof HTMLInputElement/);
});
