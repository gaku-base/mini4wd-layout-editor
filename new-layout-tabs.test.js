'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NEW_LAYOUT_TABS = require('./new-layout-tabs.js');

const indexHtml = fs.readFileSync('./index.html', 'utf8');
const appSource = fs.readFileSync('./app.js', 'utf8');

test('new layout dialog exposes only the square-space input step', () => {
  assert.deepEqual(NEW_LAYOUT_TABS.TABS.map(tab => tab.id), ['layout-space']);
  assert.equal(NEW_LAYOUT_TABS.DEFAULT_TAB, 'layout-space');
  assert.doesNotMatch(indexHtml, /role="tablist"/);
  assert.match(indexHtml, /id="fieldWidthInput"/);
  assert.match(indexHtml, /id="fieldHeightInput"/);
  assert.match(indexHtml, /id="gridInput"/);
  assert.match(indexHtml, /id="wizardNextLayoutBtn"[^>]*>スペースを作成</);
  assert.doesNotMatch(indexHtml, /configureObstaclesInput|adjustRoomShapeInput/);
});

test('the internal setup view remains stable for existing callers', () => {
  assert.equal(NEW_LAYOUT_TABS.normalizeTab('interference'), 'layout-space');
  assert.equal(NEW_LAYOUT_TABS.moveTab('layout-space', -1), 'layout-space');
});

test('non-modal venue-area input collects only dimensions and uses an automatic name', () => {
  const panel = indexHtml.match(/<section id="venueAreaCreatePanel"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(panel, /寸法指定/);
  assert.match(indexHtml, /柱・机・壁の凹みなど、コースを置けない場所を追加します/);
  assert.doesNotMatch(panel, /id="newObstacleNameInput"/);
  assert.match(panel, /id="newObstacleWidthInput"/);
  assert.match(panel, /id="newObstacleDepthInput"/);
  assert.doesNotMatch(panel, /newObstacleRotationInput|回転（°）/);
  assert.match(panel, /id="startObstaclePlacementBtn"/);
  assert.match(appSource, /const name = INITIAL_LAYOUT_FLOW\.nextObstacleName\(state\.obstacles\)/);
  assert.doesNotMatch(indexHtml, /id="obstacleRotationInput"/);
});

test('venue-area placement remains implemented without left-toolbar obstacle modes', () => {
  assert.match(appSource, /function startObstaclePlacement/);
  assert.match(appSource, /function placeObstacleAtCursor/);
  assert.match(appSource, /function obstacleHitTest/);
  assert.match(appSource, /function drawObstacles/);
  assert.doesNotMatch(indexHtml, /data-mode="(?:obstacle|layout-space|space-adjustment)"/);
});

test('setup state remains transient and resets when the modal opens', () => {
  assert.match(appSource, /newLayoutModalTab: NEW_LAYOUT_TABS\.DEFAULT_TAB/);
  assert.match(appSource, /setNewLayoutModalTab\(NEW_LAYOUT_TABS\.DEFAULT_TAB\)/);
  assert.doesNotMatch(appSource, /newLayoutModalTab[\s\S]{0,200}serializeState/);
});
