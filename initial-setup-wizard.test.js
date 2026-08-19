'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const FIELD_BOUNDARY = require('./field-boundary.js');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('new-layout entry starts with the saved-space library and the new-space step contains dimensions and grid', () => {
  assert.match(html, /id="savedSpaceLibraryPanel"/);
  assert.match(html, /保存済みスペースから開始/);
  assert.match(html, /id="createNewSpaceBtn"[^>]*>＋ 新しいスペースを作る</);
  assert.match(html, /id="fieldWidthInput"/);
  assert.match(html, /id="fieldHeightInput"/);
  assert.match(html, /id="gridInput"/);
  assert.match(html, /id="wizardNextLayoutBtn"[^>]*>次へ：設置不可エリア設定</);
  assert.doesNotMatch(html, /configureObstaclesInput|adjustRoomShapeInput/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test('creating the space enters unified canvas venue setup', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  const continuation = section('function continueInitialSetupAfter', 'function beginVenueSetup');
  const venue = section('function beginVenueSetup', 'function openVenueAreaCreator');
  assert.match(advance, /continueInitialSetupAfter\('layout-space'\)/);
  assert.match(continuation, /INITIAL_LAYOUT_FLOW\.STEPS\.VENUE_SETUP/);
  assert.match(continuation, /beginVenueSetup\(\)/);
  assert.match(venue, /ensureSetupDialogClosed\(\)/);
  assert.match(venue, /enterSubEditMode\('interference', 'move'\)/);
  assert.match(venue, /setVenueAreaCreatorVisible\(false\)/);
});

test('venue setup can finish without areas and enters exclusive Start placement', () => {
  const startLayout = section('function startLayoutFromUnavailableAreaScreen', 'function exitSubEditMode');
  const finalize = section('function finalizeInitialSetup', 'function cancelInitialSetup');
  assert.match(startLayout, /layout-start-clicked/);
  assert.match(startLayout, /finalizeInitialSetup\(\)/);
  assert.match(finalize, /endInitialSetupSubEditor\(\)/);
  assert.match(finalize, /persistLocal\(\);[\s\S]*if \(wizard\.isNew\) beginStartPlacement\(\)/);
  assert.match(finalize, /if \(wizard\.isNew\) fitView\(\)/);
});

test('the setup progress advances through STEP 2 and STEP 3 then clears after Start placement', () => {
  const ui = section('function updateUI', 'function updateBankUI');
  const finalize = section('function finalizeInitialSetup', 'function cancelInitialSetup');
  const placeStart = section('function placeStartLane', 'function localEndpoints');
  assert.match(ui, /STEP 2 \/ 3 設置不可エリア設定/);
  assert.match(html, /id="initialSetupStepBar"[^>]*>[\s\S]*STEP 3 \/ 3 Start位置設定/);
  assert.match(ui, /INITIAL_LAYOUT_FLOW\.STEPS\.START/);
  assert.match(finalize, /wizard\.isNew \? INITIAL_LAYOUT_FLOW\.STEPS\.START : 'library'/);
  assert.match(placeStart, /state\.wizard\.step = 'library'/);
});

test('new-layout metric inputs retain exact square and rectangle ratios and reset the view', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  const fit = section('function fitView', 'function drawFrame');
  assert.match(advance, /widthCm: widthM \* 100/);
  assert.match(advance, /heightCm: heightM \* 100/);
  assert.match(advance, /if \(state\.wizard\.isNew \|\| state\.wizard\.editingSavedSpaceId\) fitView\(\)/);
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

test('venue setup uses a non-modal form and repeated placement never reopens setup dialog', () => {
  assert.match(html, /id="venueAreaCreatePanel"/);
  assert.match(html, /id="repeatObstaclePlacementBtn"[^>]*>同じものをもう1個</);
  assert.match(html, /id="drawUnavailableAreaBtn"[^>]*>マウス指定</);
  assert.match(html, /id="addObstacleFromBarBtn"[^>]*>寸法指定</);
  assert.match(html, /id="obstacleList"/);
  const open = section('function openVenueAreaCreator', 'function setVenueAreaCreatorVisible');
  const repeat = section('function repeatObstaclePlacement', 'function cancelObstaclePlacement');
  const placement = section('function placeObstacleAtCursor', 'function obstacleHitTest');
  assert.match(open, /setVenueAreaCreatorVisible\(true\)/);
  assert.doesNotMatch(open, /ensureSetupDialogOpen|showModal/);
  assert.match(repeat, /\.\.\.source/);
  assert.match(repeat, /INITIAL_LAYOUT_FLOW\.nextObstacleName/);
  assert.doesNotMatch(repeat, /showModal|ensureSetupDialogOpen/);
  assert.match(placement, /state\.subEditMode === 'interference' \? 'move'/);
  assert.doesNotMatch(placement, /finalizeInitialSetup|showModal/);
});

test('only the initial setup entry can create the full-screen modal backdrop', () => {
  assert.equal((app.match(/els\.setupDialog\.showModal\(\)/g) || []).length, 1);
  const open = section('function openVenueAreaCreator', 'function finalizeInitialSetup');
  assert.doesNotMatch(open, /showModal\(|ensureSetupDialogOpen\(/);
});

test('venue-area wheel and Z/X rotation uses five-degree helpers without changing course rotation', () => {
  const wheel = section('function onWheel', 'function hasWheelRotatableTarget');
  const keys = section('function onKeyDown', 'function clearSnapTargetChoice');
  const active = section('function rotateActiveVenueArea', 'function deleteSelectedObstacle');
  assert.match(wheel, /rotateActiveVenueArea[\s\S]*INITIAL_LAYOUT_FLOW\.ROTATION_STEP/);
  assert.match(keys, /rotateActiveVenueArea\(-INITIAL_LAYOUT_FLOW\.ROTATION_STEP, 'keyboard-z'\)/);
  assert.match(keys, /rotateActiveVenueArea\(INITIAL_LAYOUT_FLOW\.ROTATION_STEP, 'keyboard-x'\)/);
  assert.match(keys, /rotateCurrent\(-45, 'keyboard-z'\)/);
  assert.match(keys, /rotateCurrent\(45, 'keyboard-x'\)/);
  assert.match(active, /INITIAL_LAYOUT_FLOW\.rotateVenueArea/);
});

test('ghost and selected venue areas draw a clamped angle label', () => {
  const shape = section('function drawObstacleShape', 'function drawObstacles');
  assert.match(shape, /options\.ghost \|\| selected/);
  assert.match(shape, /function drawObstacleAngleLabel/);
  assert.match(shape, /visible\.maxX/);
  assert.match(shape, /INTERFERENCE_OBSTACLES\.normalizeRotation/);
  assert.match(shape, /fillText\(`\$\{INTERFERENCE_OBSTACLES\.normalizeRotation\(obstacle\.rotation\)\}°`/);
});

test('plain wheel is suppressed only when a rotatable canvas target is active', () => {
  const wheel = section('function onWheel', 'function onKeyDown');
  assert.match(wheel, /!hasWheelRotatableTarget\(\)/);
  assert.match(wheel, /e\.preventDefault\(\)/);
  assert.match(wheel, /state\.obstaclePlacement \|\| selectedObstacle\(\)/);
});

test('new setup draft stays independent and cancellation restores the baseline', () => {
  const open = section('function openSetup', 'function ensureSetupDialogOpen');
  const fresh = section('function prepareNewInitialSetupDraft', 'function endInitialSetupSubEditor');
  const cancel = section('function cancelInitialSetup', 'function applySetup');
  assert.match(open, /baseline: JSON\.stringify\(serializeState\(\)\)/);
  assert.match(open, /if \(reset\) showSavedSpaceLibrary\(\)/);
  const beginNew = section('function beginNewSpaceWizard', 'function updateLayoutSpacePreview');
  assert.match(beginNew, /prepareNewInitialSetupDraft\(\)/);
  assert.match(fresh, /state\.roomCutouts = \[\]/);
  assert.match(fresh, /state\.obstacles = \[\]/);
  assert.match(fresh, /state\.parts = \[\]/);
  assert.match(fresh, /state\.start = null/);
  assert.match(fresh, /state\.history = \[\]/);
  assert.match(fresh, /state\.future = \[\]/);
  assert.match(fresh, /state\.layoutWarnings = \[\]/);
  assert.match(fresh, /state\.bankWarnings = \[\]/);
  assert.match(fresh, /state\.cornerDiagnostics = \[\]/);
  assert.match(fresh, /new-layout-state-reset/);
  assert.match(cancel, /applySerialized\(JSON\.parse\(wizard\.baseline\), false, \{ persist: false \}\)/);
  assert.match(cancel, /state\.history = \[\.\.\.wizard\.runtimeBaseline\.history\]/);
  assert.doesNotMatch(cancel, /snapshot\(/);
});

test('resizing the layout checks the validity flag returned for every existing unavailable area', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  assert.match(advance, /INITIAL_LAYOUT_FLOW\.countInvalidUnavailableAreas\(state\.obstacles, obstaclePlacementValidity\)/);
});

test('Start placement clears venue-area transient state and the RC3 label remains', () => {
  const start = section('function beginStartPlacement', 'function applySetup');
  assert.match(start, /state\.subEditMode = null/);
  assert.match(start, /state\.obstaclePlacement = null/);
  assert.match(start, /state\.unavailableAreaDraw = null/);
  assert.match(start, /state\.selectedObstacleId = null/);
  assert.match(start, /state\.pointer\.pendingObstaclePlacement = false/);
  assert.match(start, /state\.mode = 'start'/);
  assert.match(start, /toast\('スタートレーンを配置してください'\)/);
  assert.match(html, /v1\.1 RC3/);
});

test('the unavailable-area screen exposes both creation methods, list, back, and direct layout start', () => {
  const bar = html.slice(html.indexOf('id="subEditModeBar"'), html.indexOf('id="venueAreaCreatePanel"'));
  assert.match(bar, /id="drawUnavailableAreaBtn"[^>]*>マウス指定</);
  assert.match(bar, /id="addObstacleFromBarBtn"[^>]*>寸法指定</);
  assert.match(bar, /id="obstacleList"/);
  assert.match(bar, /id="returnToSetupBtn"[^>]*>戻る</);
  assert.match(bar, /id="finishSubEditBtn"[^>]*>レイアウト開始</);
  const dimensionPanel = html.slice(html.indexOf('id="venueAreaCreatePanel"'), html.indexOf('id="courseCanvas"'));
  assert.match(dimensionPanel, /id="newObstacleWidthInput"/);
  assert.match(dimensionPanel, /id="newObstacleDepthInput"/);
  assert.doesNotMatch(dimensionPanel, /rotation|回転角|newObstacleNameInput/);
});

test('screen back and re-entry keep one listener per button and restore an actionable venue screen', () => {
  const binding = section('function bindEvents', 'function openSetup');
  ['drawUnavailableAreaBtn', 'addObstacleFromBarBtn', 'returnToSetupBtn', 'finishSubEditBtn'].forEach(id => {
    assert.equal((binding.match(new RegExp(`els\\.${id}\\?\\.addEventListener`, 'g')) || []).length, 1, id);
  });
  const back = section('function returnToInitialSpaceScreen', 'function startLayoutFromUnavailableAreaScreen');
  const venue = section('function beginVenueSetup', 'function openVenueAreaCreator');
  assert.match(back, /cleanupEditorModeState\(\)/);
  assert.match(back, /state\.wizard\.step = INITIAL_LAYOUT_FLOW\.STEPS\.LAYOUT_SPACE/);
  assert.match(back, /ensureSetupDialogOpen\(\)/);
  assert.match(venue, /state\.wizard\.step = 'venue-setup'/);
  assert.match(venue, /unavailable-area-screen-opened/);
});

test('mouse and dimension methods remain mutually reusable on the same screen', () => {
  const mouse = section('function beginUnavailableAreaDraw', 'function obstacleFromCreateInputs');
  const dimensions = section('function startObstaclePlacement', 'function repeatObstaclePlacement');
  const pointerDown = section('function onPointerDown', 'function onPointerMove');
  const pointerUp = section('function onPointerUp', 'function partsInRect');
  assert.match(mouse, /unavailable-area-method-selected'[\s\S]*method: 'mouse'/);
  assert.match(mouse, /unavailableAreaFromDrag/);
  assert.match(mouse, /unavailable-area-draw-completed/);
  assert.match(pointerDown, /state\.mode === 'unavailable-draw'/);
  assert.match(pointerUp, /completeUnavailableAreaDraw\(e\)/);
  assert.match(dimensions, /unavailable-area-dimension-placement-started/);
  assert.match(dimensions, /state\.wizard\.step = INITIAL_LAYOUT_FLOW\.STEPS\.VENUE_SETUP/);
});

test('required diagnostic events cover reset, both methods, navigation, and blocked transitions', () => {
  [
    'initial-space-screen-opened', 'unavailable-area-screen-opened', 'unavailable-area-method-selected',
    'unavailable-area-draw-started', 'unavailable-area-draw-preview', 'unavailable-area-draw-completed',
    'unavailable-area-dimension-placement-started', 'unavailable-area-placement-completed',
    'unavailable-area-screen-back', 'layout-start-clicked', 'new-layout-state-reset', 'screen-transition-blocked'
  ].forEach(eventName => assert.match(app, new RegExp(`['"]${eventName}['"]`), eventName));
});
