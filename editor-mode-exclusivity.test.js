'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end));
}

test('editor mode cleanup clears ephemeral placement, selection, drag, and snap state without creating Undo history', () => {
  const cleanup = section('function cleanupEditorModeState', 'function enterSubEditMode');
  [
    /cancelCadDrag\(\)/,
    /state\.obstaclePlacement = null/,
    /cancelObstacleDrag\(\)/,
    /state\.cad\.selectedCutoutId = null/,
    /clearSelection\(false\)/,
    /resetFastPathSession\(\)/,
    /clearSnapTargetChoice\(\)/,
    /state\.ghostProposal = null/,
    /state\.ghostProposalKey = null/,
    /resetPointerInteraction\(\)/
  ].forEach(pattern => assert.match(cleanup, pattern));
  assert.doesNotMatch(cleanup, /snapshot\(|persistLocal\(/);
});

test('finishing either sub-editor returns to neutral editing and hides the mode bar', () => {
  const exit = section('function exitSubEditMode', 'function cleanupEditorModeState');
  assert.match(exit, /cleanupEditorModeState\(\)/);
  assert.match(exit, /state\.subEditMode = null/);
  assert.match(exit, /state\.mode = 'move'/);
  assert.match(exit, /setNewLayoutModalTab\(NEW_LAYOUT_TABS\.DEFAULT_TAB\)/);
  assert.doesNotMatch(exit, /snapshot\(/);
  const update = section('function updateUI', 'function updateStatusOnly');
  assert.match(update, /els\.subEditModeBar\.hidden = !subEditorActive/);
  assert.match(update, /const subEditorActive = Boolean\(state\.subEditMode\)/);
  assert.match(update, /els\.statusBar\.hidden = subEditorActive/);
  assert.match(html, /id="statusBar" class="statusbar"/);
});

test('the bottom status bar is absent only while a sub-editor is active and its canvas size is refreshed', () => {
  const update = section('function updateUI', 'function updateStatusOnly');
  assert.match(update, /statusVisibilityChanged = els\.statusBar\.hidden !== subEditorActive/);
  assert.match(update, /if \(statusVisibilityChanged\) resizeCanvas\(\)/);
  assert.match(update, /Boolean\(state\.subEditMode\)/);
  assert.match(html, /<footer id="statusBar" class="statusbar">/);
});

test('part placement leaves a sub-editor and manual Start placement uses the shared entry path', () => {
  const selectPart = section('function selectPartType', 'function snapshotSerialized');
  assert.match(selectPart, /leaveSubEditModeForPlacement\(\)/);
  assert.match(selectPart, /beginStartPlacement\(\)/);
  assert.match(selectPart, /state\.mode = 'place'/);
});

test('automatic Start placement after a new layout uses the same cleanup path', () => {
  const applySetup = section('function applySetup', 'function setMode');
  assert.match(applySetup, /if \(reset\) \{\s*beginStartPlacement\(\)/);
  const start = section('function beginStartPlacement', 'function applySetup');
  assert.match(start, /cleanupEditorModeState\(\)/);
  assert.match(start, /state\.subEditMode = null/);
  assert.match(start, /state\.mode = 'start'/);
});

test('Escape Start recovery also uses the shared Start entry path', () => {
  const keyDown = section('function onKeyDown', 'function clearSnapTargetChoice');
  assert.match(keyDown, /else \{\s*beginStartPlacement\(\);\s*\}/);
});

test('the unified venue sub-editor starts through the shared exclusive entry path', () => {
  const venueStart = section('function beginVenueSetup', 'function openVenueAreaCreator');
  const obstacleStart = section('function startObstaclePlacement', 'function cancelObstaclePlacement');
  assert.match(venueStart, /enterSubEditMode\('interference', 'move'\)/);
  assert.match(obstacleStart, /enterSubEditMode\('interference', 'obstacle-edit'\)/);
});

test('resetting pointer interaction also clears pending obstacle placement', () => {
  const resetPointer = section('function resetPointerInteraction', 'function toggleGrid');
  assert.match(resetPointer, /state\.pointer\.pendingObstaclePlacement = false/);
});

test('the visible release candidate label is RC3', () => {
  assert.match(html, /v1\.1 RC3/);
  assert.doesNotMatch(html, /v1\.1 RC2/);
});
