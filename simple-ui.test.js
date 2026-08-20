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
