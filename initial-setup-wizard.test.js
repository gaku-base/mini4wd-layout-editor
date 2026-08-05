'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const FIELD_BOUNDARY = require('./field-boundary.js');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('initial setup exposes four sequential wizard stages and does not start placement from space confirmation', () => {
  assert.match(html, /id="wizardProgress"/);
  assert.match(html, /id="setupConfirmPanel"/);
  assert.match(html, /id="wizardCreateBtn"/);
  const advance = section('function advanceWizardFromLayoutSpace', 'function finalizeInitialSetup');
  assert.match(advance, /state\.wizard\.step = 'space-adjustment'/);
  assert.match(advance, /enterSubEditMode\('space-adjustment', 'cutout'\)/);
  assert.doesNotMatch(advance, /beginStartPlacement\(/);
  const tabs = section('function setNewLayoutModalTab', 'function exitSubEditMode');
  assert.match(tabs, /tabButton\.disabled = state\.wizard\.active/);
});

test('only final confirmation begins Start placement and it reuses the exclusive Start entry', () => {
  const finalize = section('function finalizeInitialSetup', 'function cancelInitialSetup');
  assert.match(finalize, /endInitialSetupSubEditor\(\)/);
  assert.match(finalize, /persistLocal\(\);\s*if \(wizard\.isNew\) beginStartPlacement\(\);\s*else state\.mode = 'move';\s*updateUI\(\);/);
  assert.match(finalize, /if \(wizard\.isNew\) fitView\(\)/);
  assert.match(finalize, /state\.wizard = \{ active: false/);
});

test('new-layout metric inputs retain their exact field ratio and reset the view from those values', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function finalizeInitialSetup');
  const fit = section('function fitView', 'function drawFrame');
  assert.match(advance, /widthCm: widthM \* 100/);
  assert.match(advance, /heightCm: heightM \* 100/);
  assert.match(advance, /if \(state\.wizard\.isNew\) fitView\(\)/);
  assert.match(fit, /state\.field\.widthCm/);
  assert.match(fit, /state\.field\.heightCm/);
  assert.match(fit, /Math\.min\(sx, sy\)/);

  const ratio = (widthM, heightM) => {
    const field = FIELD_BOUNDARY.fieldBounds({ widthCm: widthM * 100, heightCm: heightM * 100, gridCm: 10 });
    const scale = Math.min((960 - 84) / field.w, (640 - 84) / field.h);
    return (field.w * scale) / (field.h * scale);
  };
  assert.ok(Math.abs(ratio(10, 6) - 10 / 6) < 1e-12);
  assert.ok(Math.abs(ratio(6, 10) - 6 / 10) < 1e-12);
});

test('entering final confirmation ends the interference sub-editor and hides its bar', () => {
  const exit = section('function exitSubEditMode', 'function endInitialSetupSubEditor');
  const end = section('function endInitialSetupSubEditor', 'function advanceWizardFromLayoutSpace');
  assert.match(exit, /if \(state\.wizard\.active\) endInitialSetupSubEditor\(\)/);
  assert.match(exit, /state\.wizard\.step = tab === 'space-adjustment' \? 'interference' : 'confirm'/);
  assert.match(end, /state\.subEditMode = null/);
  assert.match(end, /els\.subEditModeBar\.hidden = true/);
  assert.match(end, /cleanupEditorModeState\(\)/);
});

test('Start placement explicitly clears obstacle placement state before status and instruction rendering', () => {
  const start = section('function beginStartPlacement', 'function applySetup');
  [
    /state\.subEditMode = null/,
    /state\.obstaclePlacement = null/,
    /state\.selectedObstacleId = null/,
    /state\.obstacleDrag = null/,
    /state\.cad\.selectedCutoutId = null/,
    /state\.pointer\.pendingObstaclePlacement = false/,
    /state\.pointer\.pendingPlacement = false/,
    /state\.mode = 'start'/
  ].forEach(pattern => assert.match(start, pattern));
  const ui = section('function updateUI', 'function updateStatusOnly');
  assert.match(ui, /state\.mode === 'start'[\s\S]{0,100}?'スタート配置'/);
  assert.match(ui, /else if \(state\.mode === 'start'\) \{[\s\S]{0,140}?スタートレーンを配置/);
});

test('initial setup edits are transient until confirmation and cancellation restores the baseline without Undo', () => {
  const open = section('function openSetup', 'function setNewLayoutModalTab');
  assert.match(open, /baseline: JSON\.stringify\(serializeState\(\)\)/);
  const persist = section('function persistLocal', 'function saveJson');
  assert.match(persist, /state\.wizard\.active/);
  assert.match(persist, /deferred-wizard/);
  const cancel = section('function cancelInitialSetup', 'function applySetup');
  assert.match(cancel, /applySerialized\(JSON\.parse\(wizard\.baseline\), false, \{ persist: false \}\)/);
  assert.doesNotMatch(cancel, /snapshot\(/);
});

test('a new setup creates an empty independent cutout and obstacle draft, while editing keeps the current draft', () => {
  const open = section('function openSetup', 'function setNewLayoutModalTab');
  const freshDraft = section('function prepareNewInitialSetupDraft', 'function endInitialSetupSubEditor');
  assert.match(open, /if \(reset\) prepareNewInitialSetupDraft\(\)/);
  assert.match(freshDraft, /state\.roomCutouts = \[\]/);
  assert.match(freshDraft, /state\.obstacles = \[\]/);
  assert.match(freshDraft, /state\.selectedObstacleId = null/);
  assert.match(freshDraft, /state\.cad = \{ selectedCutoutId: null/);
  assert.match(freshDraft, /cleanupEditorModeState\(\)/);
  assert.doesNotMatch(open, /if \(!reset\) prepareNewInitialSetupDraft/);
});

test('initial setup blocks normal part modes and maintains the RC3 label', () => {
  const setMode = section('function setMode', 'function selectPartType');
  const selectPart = section('function selectPartType', 'function snapshotSerialized');
  assert.match(setMode, /if \(state\.wizard\.active\) return/);
  assert.match(selectPart, /if \(state\.wizard\.active\) return/);
  assert.match(html, /初期設定を編集/);
  assert.match(html, /v1\.1 RC3/);
});

test('cutout and obstacle changes contribute non-destructive layout warnings', () => {
  assert.match(app, /function courseCutoutWarnings/);
  const warnings = section('function recalculateLayoutWarnings', 'function endpointsConnect');
  assert.match(warnings, /cutoutInterference/);
  assert.match(warnings, /field-overflow/);
  const exportSection = section('function drawExport', 'function dateStamp');
  assert.doesNotMatch(exportSection, /drawLayoutWarnings/);
});
