'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const NEW_LAYOUT_TABS = require('./new-layout-tabs.js');

const indexHtml = fs.readFileSync('./index.html', 'utf8');
const appSource = fs.readFileSync('./app.js', 'utf8');

test('new layout dialog defines the three tabs in the required order', () => {
  assert.deepEqual(NEW_LAYOUT_TABS.TABS.map(tab => tab.id), ['layout-space', 'space-adjustment', 'interference']);
  assert.deepEqual(NEW_LAYOUT_TABS.TABS.map(tab => tab.label), ['レイアウトスペース', 'スペース修正', '干渉物設定']);
});

test('layout space is the initial tab and unknown tabs fall back to it', () => {
  assert.equal(NEW_LAYOUT_TABS.DEFAULT_TAB, 'layout-space');
  assert.equal(NEW_LAYOUT_TABS.normalizeTab('unknown'), 'layout-space');
});

test('tab movement wraps in both directions for keyboard navigation', () => {
  assert.equal(NEW_LAYOUT_TABS.moveTab('layout-space', 1), 'space-adjustment');
  assert.equal(NEW_LAYOUT_TABS.moveTab('interference', 1), 'layout-space');
  assert.equal(NEW_LAYOUT_TABS.moveTab('layout-space', -1), 'interference');
});

test('panel view identifies exactly one selected tab', () => {
  const view = NEW_LAYOUT_TABS.panelView('space-adjustment', { setupStarted: true });
  assert.equal(view.selected, 'space-adjustment');
  assert.deepEqual(view.tabs.filter(tab => tab.selected).map(tab => tab.id), ['space-adjustment']);
});

test('space adjustment is unavailable until a layout space exists', () => {
  assert.equal(NEW_LAYOUT_TABS.canStartSpaceAdjustment({ setupStarted: false }), false);
  assert.equal(NEW_LAYOUT_TABS.panelView('space-adjustment', { setupStarted: false }).canAdjustSpace, false);
});

test('space adjustment is available for an existing layout space', () => {
  assert.equal(NEW_LAYOUT_TABS.canStartSpaceAdjustment({ setupStarted: true }), true);
  assert.equal(NEW_LAYOUT_TABS.panelView('space-adjustment', { setupStarted: true }).canAdjustSpace, true);
});

test('new layout modal keeps tab semantics and the existing size controls', () => {
  assert.match(indexHtml, /role="tablist"/);
  assert.match(indexHtml, /role="tab"[\s\S]*aria-selected="true"[\s\S]*data-setup-tab="layout-space"/);
  assert.match(indexHtml, /id="fieldWidthInput"/);
  assert.match(indexHtml, /id="fieldHeightInput"/);
  assert.match(indexHtml, /id="gridInput"/);
  assert.match(indexHtml, /data-preset="6,4"/);
  assert.match(indexHtml, /サイズを決定/);
});

test('space adjustment remains a guarded route to the existing cutout mode', () => {
  assert.match(indexHtml, /id="startSpaceAdjustmentBtn"[\s\S]*disabled/);
  assert.match(appSource, /NEW_LAYOUT_TABS\.canStartSpaceAdjustment\(state\)/);
  assert.match(appSource, /setMode\('cutout'\)/);
});

test('interference tab is preparation-only and no obstacle implementation is added', () => {
  assert.match(indexHtml, /id="interferencePanel"[\s\S]*準備中/);
  assert.doesNotMatch(indexHtml, /[＋+]障害物/);
  assert.doesNotMatch(appSource, /\bobstacles?\b/i);
});

test('tab state remains transient and is reset when the modal opens', () => {
  assert.match(appSource, /newLayoutModalTab: NEW_LAYOUT_TABS\.DEFAULT_TAB/);
  assert.match(appSource, /setNewLayoutModalTab\(NEW_LAYOUT_TABS\.DEFAULT_TAB\)/);
  assert.doesNotMatch(appSource, /newLayoutModalTab[\s\S]{0,200}serializeState/);
});
