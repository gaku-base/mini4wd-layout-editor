'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const UI = require('./simple-ui.js');

const SOURCE = fs.readFileSync(require.resolve('./simple-ui.js'), 'utf8');

test('parseSelectionCount accepts positive integer text and fails closed otherwise', () => {
  assert.equal(UI.parseSelectionCount('2'), 2);
  assert.equal(UI.parseSelectionCount(' 12 '), 12);
  assert.equal(UI.parseSelectionCount('0'), 0);
  assert.equal(UI.parseSelectionCount('-3'), 0);
  assert.equal(UI.parseSelectionCount('選択なし'), 0);
  assert.equal(UI.parseSelectionCount(null), 0);
});

test('context signature changes when selection identity changes at the same count', () => {
  const first = UI.buildContextSignature({ selectionCount: 1, selectionIdentity: '["part-a","part-b"]' });
  const second = UI.buildContextSignature({ selectionCount: 1, selectionIdentity: '["part-a","part-c"]' });
  assert.notEqual(first, second);
});

test('context signature changes when switching directly between obstacles', () => {
  const first = UI.buildContextSignature({ obstacleActive: true, obstacleIdentity: '柱 1' });
  const second = UI.buildContextSignature({ obstacleActive: true, obstacleIdentity: '柱 2' });
  assert.notEqual(first, second);
});

test('context identity normalization ignores presentation-only whitespace', () => {
  assert.equal(UI.normalizeContextIdentity('  Straight\n  A  '), 'Straight A');
});

test('drawer remains closed without manual request or active context', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: false, contextSuppressed: false }),
    { open: false, contextOnly: false }
  );
});

test('selection context auto-opens drawer in context-only mode', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: true, contextSuppressed: false }),
    { open: true, contextOnly: true }
  );
});

test('manual drawer open exposes all details even while context is active', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: true, contextActive: true, contextSuppressed: false }),
    { open: true, contextOnly: false }
  );
});

test('explicitly dismissed context does not force drawer back open until context changes', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: true, contextSuppressed: true }),
    { open: false, contextOnly: false }
  );
});

test('compact status keeps diagnostic values available as secondary detail fields', () => {
  const ids = UI.SECONDARY_STATUS_IDS.map(([id]) => id);
  assert.deepEqual(ids, [
    'statusConnection',
    'statusCursor',
    'statusSelected',
    'statusCount',
    'statusAssets',
    'statusOverflow',
    'statusZoom'
  ]);
  assert.equal(ids.includes('statusMode'), false);
  assert.equal(ids.includes('statusPart'), false);
  assert.equal(ids.includes('statusRotation'), false);
  assert.equal(ids.includes('statusWarnings'), false);
});

test('less-used canvas display controls are grouped in overflow instead of removed', () => {
  assert.deepEqual(UI.SECONDARY_TOOLBAR_IDS, [
    'gridBtn',
    'manualFitBtn',
    'topLeftFitBtn',
    'autoFitFieldBtn'
  ]);
});

test('simplified drawer overrides the legacy responsive display-none rule', () => {
  assert.match(
    SOURCE,
    /body\.simple-ui-enabled \.right-sidebar \{[\s\S]*?display:\s*block !important;/
  );
});

test('drag trash is an overlay with a stable footprint instead of reflowing the canvas', () => {
  const block = SOURCE.match(/body\.simple-ui-enabled \.drag-trash \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /position:\s*absolute !important;/);
  assert.match(block, /height:\s*42px;/);
  assert.match(block, /min-height:\s*42px !important;/);
  assert.match(block, /margin:\s*0 !important;/);
  const activeBlock = SOURCE.match(/body\.simple-ui-enabled \.drag-trash\.is-dragging,[\s\S]*?\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.doesNotMatch(activeBlock, /height|margin|min-height|max-height|top|left|right/);
  assert.match(activeBlock, /opacity:\s*1;/);
});

test('overflow controls render in a fixed body portal outside the toolbar scrollport', () => {
  const block = SOURCE.match(/body\.simple-ui-enabled \.simple-toolbar-more-menu \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /position:\s*fixed;/);
  assert.match(SOURCE, /documentRef\.body\.appendChild\(toolbarMoreMenu\)/);
  assert.doesNotMatch(SOURCE, /rightToolbarGroup\.append\([^\n]*toolbarMoreMenu/);
});

test('canvas selection completion schedules a post-handler context refresh', () => {
  assert.match(SOURCE, /courseCanvas\?\.addEventListener\?\.\('pointerup', scheduleContextRefresh\)/);
  assert.match(SOURCE, /setTimeout\(\(\) => renderDrawer\(\), 0\)/);
});

test('selection identity is stored outside selectionInfo and observed directly', () => {
  assert.match(SOURCE, /getElementById\('simpleUiSelectionIdentity'\)/);
  assert.match(SOURCE, /selectionIdentityMarker\.id = 'simpleUiSelectionIdentity'/);
  assert.match(SOURCE, /body\.appendChild\(selectionIdentityMarker\)/);
  assert.match(SOURCE, /selectionIdentityMarker\?\.dataset\?\.selectedIds/);
  assert.match(SOURCE, /contextObserver\.observe\(selectionIdentityMarker, \{ attributes: true, attributeFilter: \['data-selected-ids'\] \}\)/);
});
