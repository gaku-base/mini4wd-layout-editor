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

test('drawer remains closed until manually requested', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: false, contextSuppressed: false }),
    { open: false, contextOnly: false }
  );
});

test('selection context does not auto-open drawer', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: true, contextSuppressed: false }),
    { open: false, contextOnly: false }
  );
});

test('obstacle context does not auto-open drawer', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: false, contextActive: true, contextSuppressed: true }),
    { open: false, contextOnly: false }
  );
});

test('manual drawer open exposes details even while context is active', () => {
  assert.deepEqual(
    UI.computeDrawerState({ manualOpen: true, contextActive: true, contextSuppressed: false }),
    { open: true, contextOnly: false }
  );
});

test('pointInsideElement uses viewport coordinates for toolbar trash hit testing', () => {
  const element = { getBoundingClientRect: () => ({ left: 10, right: 50, top: 20, bottom: 60 }) };
  assert.equal(UI.pointInsideElement({ clientX: 30, clientY: 40 }, element), true);
  assert.equal(UI.pointInsideElement({ clientX: 9, clientY: 40 }, element), false);
});

test('trash drag preserves a multi-selection when pointerdown collapses to one selected member', () => {
  assert.deepEqual(UI.resolveTrashDragIds(['start', 'part-a', 'part-b'], ['part-a']), ['start', 'part-a', 'part-b']);
  assert.deepEqual(UI.resolveTrashDragIds(['start', 'part-a', 'part-b'], ['outside']), ['outside']);
  assert.deepEqual(UI.resolveTrashDragIds(['part-a'], ['part-a']), ['part-a']);
  assert.deepEqual(UI.resolveTrashDragIds([], ['part-a']), ['part-a']);
});

test('trash drag ID resolution normalizes duplicates and empty values safely', () => {
  assert.deepEqual(UI.resolveTrashDragIds([' part-a ', 'part-a', '', null], ['part-a']), ['part-a']);
  assert.deepEqual(UI.resolveTrashDragIds(['part-a', 'part-b'], [' part-b ']), ['part-a', 'part-b']);
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

test('drag trash is a compact always-visible toolbar target', () => {
  const block = SOURCE.match(/body\.simple-ui-enabled \.drag-trash \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /position:\s*static !important;/);
  assert.match(block, /width:\s*38px;/);
  assert.match(block, /height:\s*32px;/);
  assert.match(block, /min-height:\s*32px !important;/);
  assert.match(block, /margin:\s*0 !important;/);
  assert.match(block, /opacity:\s*1;/);
  assert.match(SOURCE, /rightToolbarGroup\.append\(dragTrash\)/);
  assert.match(SOURCE, /dragTrash\.title = 'パーツをドラッグして削除'/);
});

test('course-part trash bridge rolls back an in-progress move before one-step delete', () => {
  assert.match(SOURCE, /function installCoursePartTrashBridge/);
  assert.match(SOURCE, /documentRef\.addEventListener\('pointerup',[\s\S]*true\);/);
  assert.match(SOURCE, /historyLength:\s*Number\(runtime\.historyLength\) \|\| 0/);
  assert.match(SOURCE, /selectedIdsBefore:\s*Array\.isArray\(runtime\.selectedIds\)/);
  assert.match(SOURCE, /resolveTrashDragIds\(pendingDrag\.selectedIdsBefore, after\?\.selectedIds\)/);
  assert.match(SOURCE, /new rootRef\.KeyboardEvent\('keydown',[\s\S]*ctrlKey:\s*true/);
  assert.match(SOURCE, /debug\.setSelectedIds\(drag\.ids\)/);
  assert.match(SOURCE, /debug\.deleteParts\(drag\.ids\)/);
  assert.match(SOURCE, /event\.stopImmediatePropagation\(\)/);
  assert.match(SOURCE, /new rootRef\.PointerEvent\('pointercancel'/);
});

test('overflow controls render in a fixed body portal outside the toolbar scrollport', () => {
  const block = SOURCE.match(/body\.simple-ui-enabled \.simple-toolbar-more-menu \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(block, /position:\s*fixed;/);
  assert.match(SOURCE, /documentRef\.body\.appendChild\(toolbarMoreMenu\)/);
  assert.doesNotMatch(SOURCE, /rightToolbarGroup\.append\([^\n]*toolbarMoreMenu/);
});

test('canvas selection completion can refresh presentation without forcing drawer open', () => {
  assert.match(SOURCE, /courseCanvas\?\.addEventListener\?\.\('pointerup', scheduleContextRefresh\)/);
  assert.match(SOURCE, /setTimeout\(\(\) => renderDrawer\(\), 0\)/);
  assert.match(SOURCE, /const state = computeDrawerState\(\{ manualOpen \}\)/);
});

test('selection identity is stored outside selectionInfo and observed directly', () => {
  assert.match(SOURCE, /getElementById\('simpleUiSelectionIdentity'\)/);
  assert.match(SOURCE, /selectionIdentityMarker\.id = 'simpleUiSelectionIdentity'/);
  assert.match(SOURCE, /body\.appendChild\(selectionIdentityMarker\)/);
  assert.match(SOURCE, /selectionIdentityMarker\?\.dataset\?\.selectedIds/);
  assert.match(SOURCE, /contextObserver\.observe\(selectionIdentityMarker, \{ attributes: true, attributeFilter: \['data-selected-ids'\] \}\)/);
});
