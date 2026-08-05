'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const FIELD_BOUNDARY = require('./field-boundary.js');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('initial setup presents a square-space primary action with two optional branches', () => {
  assert.match(html, /id="wizardProgress"/);
  assert.match(html, /四角形スペース/);
  assert.match(html, /id="configureObstaclesInput"/);
  assert.match(html, /id="adjustRoomShapeInput"/);
  assert.match(html, /id="wizardNextLayoutBtn"[^>]*>レイアウトを開始</);
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  assert.match(advance, /state\.wizard\.adjustRoomShape = els\.adjustRoomShapeInput/);
  assert.match(advance, /state\.wizard\.configureObstacles = els\.configureObstaclesInput/);
  assert.match(advance, /continueInitialSetupAfter\('layout-space'\)/);
  assert.doesNotMatch(advance, /enterSubEditMode\(/);
  const tabs = section('function setNewLayoutModalTab', 'function exitSubEditMode');
  assert.match(tabs, /tabButton\.disabled = state\.wizard\.active/);
});

test('the shared branch continuation can finalize directly into exclusive Start placement', () => {
  const continuation = section('function continueInitialSetupAfter', 'function beginWizardSpaceAdjustment');
  assert.match(continuation, /INITIAL_LAYOUT_FLOW\.nextStep\(completedStep, state\.wizard\)/);
  assert.match(continuation, /beginWizardSpaceAdjustment\(\)/);
  assert.match(continuation, /openWizardObstacleCreator/);
  assert.match(continuation, /openWizardConfirmation/);
  assert.match(continuation, /finalizeInitialSetup\(\)/);
  const finalize = section('function finalizeInitialSetup', 'function cancelInitialSetup');
  assert.match(finalize, /endInitialSetupSubEditor\(\)/);
  assert.match(finalize, /persistLocal\(\);\s*if \(wizard\.isNew\) beginStartPlacement\(\);\s*else state\.mode = 'move';\s*updateUI\(\);/);
  assert.match(finalize, /if \(wizard\.isNew\) fitView\(\)/);
  assert.match(finalize, /state\.wizard = \{ active: false/);
});

test('new-layout metric inputs retain exact square and rectangle ratios and reset the view', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
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
  assert.ok(Math.abs(ratio(6, 6) - 1) < 1e-12);
  assert.ok(Math.abs(ratio(10, 6) - 10 / 6) < 1e-12);
  assert.ok(Math.abs(ratio(6, 10) - 6 / 10) < 1e-12);
});

test('finishing an optional sub-editor cleans it up before selecting the next branch', () => {
  const exit = section('function exitSubEditMode', 'function endInitialSetupSubEditor');
  const end = section('function endInitialSetupSubEditor', 'function advanceWizardFromLayoutSpace');
  assert.match(exit, /if \(state\.wizard\.active\) \{\s*endInitialSetupSubEditor\(\)/);
  assert.match(exit, /continueInitialSetupAfter\(tab\)/);
  assert.match(end, /state\.subEditMode = null/);
  assert.match(end, /els\.subEditModeBar\.hidden = true/);
  assert.match(end, /cleanupEditorModeState\(\)/);
});

test('interference setup supports repeated same-size and different obstacle placement without leaving its stage', () => {
  assert.match(html, /id="subEditObstacleCount"/);
  assert.match(html, /id="repeatObstaclePlacementBtn"[^>]*>同じサイズをもう1個配置</);
  assert.match(html, /id="addObstacleFromBarBtn"[^>]*>＋干渉物を追加</);
  const repeat = section('function repeatObstaclePlacement', 'function cancelObstaclePlacement');
  assert.match(repeat, /const source = selectedObstacle\(\) \|\| state\.obstacles\.at\(-1\)/);
  assert.match(repeat, /\.\.\.source/);
  assert.match(repeat, /INITIAL_LAYOUT_FLOW\.nextObstacleName/);
  const placement = section('function placeObstacleAtCursor', 'function obstacleHitTest');
  assert.match(placement, /state\.subEditMode === 'interference' \? 'move'/);
  assert.doesNotMatch(placement, /finalizeInitialSetup/);
});

test('the interference sub-editor hides the old constant return action and shows count, add, and next', () => {
  const update = section('function updateUI', 'function updateStatusOnly');
  assert.match(update, /wizardInterference/);
  assert.match(update, /subEditObstacleCount\.textContent = `配置済み \$\{state\.obstacles\.length\}件`/);
  assert.match(update, /returnToSetupBtn\.hidden = wizardInterference/);
  assert.match(update, /'別の干渉物を追加'/);
  assert.doesNotMatch(update, /スペース修正へ戻る/);
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
  assert.match(open, /!reset && state\.roomCutouts\.length > 0/);
  assert.match(open, /!reset && state\.obstacles\.length > 0/);
  assert.match(freshDraft, /state\.roomCutouts = \[\]/);
  assert.match(freshDraft, /state\.obstacles = \[\]/);
  assert.match(freshDraft, /state\.selectedObstacleId = null/);
  assert.match(freshDraft, /state\.cad = \{ selectedCutoutId: null/);
  assert.match(freshDraft, /cleanupEditorModeState\(\)/);
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
