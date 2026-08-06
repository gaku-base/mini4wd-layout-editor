'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const FIELD_BOUNDARY = require('./field-boundary.js');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('initial setup contains only dimensions, grid, and space creation', () => {
  assert.match(html, /id="fieldWidthInput"/);
  assert.match(html, /id="fieldHeightInput"/);
  assert.match(html, /id="gridInput"/);
  assert.match(html, /id="wizardNextLayoutBtn"[^>]*>スペースを作成</);
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
  const exit = section('function exitSubEditMode', 'function prepareNewInitialSetupDraft');
  const finalize = section('function finalizeInitialSetup', 'function cancelInitialSetup');
  assert.match(exit, /if \(state\.wizard\.active\)[\s\S]*finalizeInitialSetup\(\)/);
  assert.match(finalize, /endInitialSetupSubEditor\(\)/);
  assert.match(finalize, /persistLocal\(\);[\s\S]*if \(wizard\.isNew\) beginStartPlacement\(\)/);
  assert.match(finalize, /if \(wizard\.isNew\) fitView\(\)/);
});

test('new-layout metric inputs retain exact square and rectangle ratios and reset the view', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  const fit = section('function fitView', 'function drawFrame');
  assert.match(advance, /widthCm: widthM \* 100/);
  assert.match(advance, /heightCm: heightM \* 100/);
  assert.match(advance, /if \(state\.wizard\.isNew\) fitView\(\)/);
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
  assert.match(html, /id="addObstacleFromBarBtn"[^>]*>設置不可エリアを追加</);
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
  assert.match(wheel, /!!state\.obstaclePlacement \|\| !!selectedObstacle\(\)/);
});

test('new setup draft stays independent and cancellation restores the baseline', () => {
  const open = section('function openSetup', 'function ensureSetupDialogOpen');
  const fresh = section('function prepareNewInitialSetupDraft', 'function endInitialSetupSubEditor');
  const cancel = section('function cancelInitialSetup', 'function applySetup');
  assert.match(open, /baseline: JSON\.stringify\(serializeState\(\)\)/);
  assert.match(open, /if \(reset\) prepareNewInitialSetupDraft\(\)/);
  assert.match(fresh, /state\.roomCutouts = \[\]/);
  assert.match(fresh, /state\.obstacles = \[\]/);
  assert.match(cancel, /applySerialized\(JSON\.parse\(wizard\.baseline\), false, \{ persist: false \}\)/);
  assert.doesNotMatch(cancel, /snapshot\(/);
});

test('Start placement clears venue-area transient state and the RC3 label remains', () => {
  const start = section('function beginStartPlacement', 'function applySetup');
  assert.match(start, /state\.subEditMode = null/);
  assert.match(start, /state\.obstaclePlacement = null/);
  assert.match(start, /state\.selectedObstacleId = null/);
  assert.match(start, /state\.pointer\.pendingObstaclePlacement = false/);
  assert.match(start, /state\.mode = 'start'/);
  assert.match(html, /v1\.1 RC3/);
});
