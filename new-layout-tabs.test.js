'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NEW_LAYOUT_TABS = require('./new-layout-tabs.js');

const indexHtml = fs.readFileSync('./index.html', 'utf8');
const appSource = fs.readFileSync('./app.js', 'utf8');

test('new layout dialog keeps the required three tabs and layout-space default', () => {
  assert.deepEqual(NEW_LAYOUT_TABS.TABS.map(tab => tab.id), ['layout-space', 'space-adjustment', 'interference']);
  assert.equal(NEW_LAYOUT_TABS.DEFAULT_TAB, 'layout-space');
  assert.match(indexHtml, /role="tablist"/);
  assert.match(indexHtml, /data-setup-tab="layout-space"/);
  assert.match(indexHtml, /id="fieldWidthInput"/);
  assert.match(indexHtml, /id="fieldHeightInput"/);
  assert.match(indexHtml, /id="gridInput"/);
  assert.match(indexHtml, /四角形スペース/);
  assert.equal(NEW_LAYOUT_TABS.TABS[0].label, '四角形スペース');
  assert.equal(NEW_LAYOUT_TABS.TABS[1].label, '部屋形状調整');
});

test('tab movement wraps and space adjustment remains guarded', () => {
  assert.equal(NEW_LAYOUT_TABS.moveTab('interference', 1), 'layout-space');
  assert.equal(NEW_LAYOUT_TABS.moveTab('layout-space', -1), 'interference');
  assert.equal(NEW_LAYOUT_TABS.canStartSpaceAdjustment({ setupStarted: false }), false);
  assert.equal(NEW_LAYOUT_TABS.canStartSpaceAdjustment({ setupStarted: true }), true);
  assert.match(indexHtml, /id="startSpaceAdjustmentBtn"[\s\S]*disabled/);
  assert.match(appSource, /setMode\('cutout'\)/);
});

test('interference tab collects name, dimensions, and rotation before placement', () => {
  const interferencePanel = indexHtml.match(/<section id="interferencePanel"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(interferencePanel, /id="newObstacleNameInput"/);
  assert.match(interferencePanel, /id="newObstacleWidthInput"/);
  assert.match(interferencePanel, /id="newObstacleDepthInput"/);
  assert.match(interferencePanel, /id="newObstacleRotationInput"/);
  assert.match(interferencePanel, /id="startObstaclePlacementBtn"/);
  assert.doesNotMatch(interferencePanel, /newObstacle(?:X|Y|Visible|Locked)Input/);
  assert.match(indexHtml, /id="obstacleList"/);
  assert.match(indexHtml, /id="obstacleEditorPanel"/);
});

test('obstacle placement is implemented without left-toolbar obstacle modes', () => {
  assert.match(appSource, /function startObstaclePlacement/);
  assert.match(appSource, /function placeObstacleAtCursor/);
  assert.match(appSource, /function obstacleHitTest/);
  assert.match(appSource, /function drawObstacles/);
  assert.doesNotMatch(indexHtml, /data-mode="(?:obstacle|layout-space|space-adjustment)"/);
});

test('tab state remains transient and resets when the modal opens', () => {
  assert.match(appSource, /newLayoutModalTab: NEW_LAYOUT_TABS\.DEFAULT_TAB/);
  assert.match(appSource, /setNewLayoutModalTab\(NEW_LAYOUT_TABS\.DEFAULT_TAB\)/);
  assert.doesNotMatch(appSource, /newLayoutModalTab[\s\S]{0,200}serializeState/);
});
