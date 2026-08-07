'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const app = fs.readFileSync('./app.js', 'utf8');
const html = fs.readFileSync('./index.html', 'utf8');
const testHtml = fs.readFileSync('./test-index.html', 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('saved-space and transform modules load before the application in production and QA pages', () => {
  for (const source of [html, testHtml]) {
    assert.ok(source.indexOf('src="saved-spaces.js"') < source.indexOf('src="app.js'));
    assert.ok(source.indexOf('src="unavailable-area-transform.js"') < source.indexOf('src="app.js'));
  }
});

test('saved-space library has empty state, cards, and all management actions', () => {
  assert.match(html, /id="savedSpaceCards"/);
  assert.match(html, /id="savedSpaceEmpty"[^>]*>保存済みスペースはまだありません</);
  const cards = section('function renderSavedSpaceCards', 'function savedSpaceAreasFromCurrentDraft');
  for (const label of ['このスペースを使う', '編集', '複製', '名前変更', '削除']) {
    assert.match(cards, new RegExp(label));
  }
  assert.match(cards, /savedSpacePreview\(space\)/);
  assert.match(cards, /space\.unavailableAreas\.length/);
});

test('saved-space preview renders only field and unavailable areas', () => {
  const preview = section('function savedSpacePreview', 'function renderSavedSpaceCards');
  assert.match(preview, /space\.field\.widthCm/);
  assert.match(preview, /space\.unavailableAreas\.filter/);
  assert.match(preview, /rotate\(\$\{area\.rotation\}\)/);
  assert.doesNotMatch(preview, /state\.parts|state\.start|drawStartLane|drawPart/);
});

test('using a saved space deep-copies it and immediately enters Start placement', () => {
  const apply = section('function applySavedSpaceDraft', 'function useSavedSpace');
  const use = section('function useSavedSpace', 'function editSavedSpace');
  assert.match(apply, /SAVED_SPACES\.deepClone\(space\.field\)/);
  assert.match(apply, /SAVED_SPACES\.deepClone\(space\.unavailableAreas\)/);
  assert.match(apply, /state\.roomCutouts = \[\]/);
  assert.match(use, /state\.wizard = \{ active: false/);
  assert.match(use, /fitView\(\);[\s\S]*beginStartPlacement\(\)/);
});

test('saved-space editing restores the active course before returning to the library', () => {
  const advance = section('function advanceWizardFromLayoutSpace', 'function continueInitialSetupAfter');
  assert.match(advance, /state\.wizard\.isNew \|\| state\.wizard\.editingSavedSpaceId/);
  const save = section('function saveCurrentSpaceAndContinue', 'function ensureSetupDialogOpen');
  assert.match(save, /savedSpaceStore\.update\(editingId, values\)/);
  assert.match(save, /restoreWizardBaselineForLibrary\(\)/);
  assert.match(save, /showSavedSpaceLibrary\(\)/);
  const persistence = section('function persistLocal', 'function restoreLocal');
  assert.match(persistence, /if \(state\.wizard\.active\) return \{ status: 'deferred-wizard' \}/);
});

test('STEP 1 defaults, presets, validation, and real-ratio preview are present', () => {
  assert.match(html, /id="fieldWidthInput"[^>]*min="1"[^>]*max="50"[^>]*value="5\.0"/);
  assert.match(html, /id="fieldHeightInput"[^>]*min="1"[^>]*max="50"[^>]*value="5\.0"/);
  for (const preset of ['5,5', '6,4', '8,5', '10,6', '12,8']) assert.match(html, new RegExp(`data-preset="${preset}"`));
  assert.doesNotMatch(html, /Prototype|prototype/);
  const preview = section('function updateLayoutSpacePreview', 'function svgElement');
  assert.match(preview, /Math\.min\(maxWidth \/ width, maxHeight \/ height\)/);
  assert.match(preview, /width >= 1 && width <= 50/);
  assert.match(preview, /height >= 1 && height <= 50/);
});

test('STEP 2 exposes save and skip paths without adding a creation-name or rotation field', () => {
  assert.match(html, /id="savedSpaceNameInput"/);
  assert.match(html, /id="saveSpaceAndStartBtn"/);
  assert.match(html, /id="skipSpaceSaveBtn"/);
  const createPanel = html.slice(html.indexOf('id="venueAreaCreatePanel"'), html.indexOf('id="courseCanvas"'));
  assert.doesNotMatch(createPanel, /newObstacleNameInput|newObstacleRotationInput/);
});

test('selected unavailable areas integrate grid move, Shift precision, resize, and direct dimensions', () => {
  const move = section('function onPointerMove', 'function onPointerUp');
  assert.match(move, /UNAVAILABLE_AREA_TRANSFORM\.moveTo\([\s\S]*state\.field\.gridCm, e\.shiftKey\s*\)/);
  assert.match(move, /UNAVAILABLE_AREA_TRANSFORM\.resizeFromCorner/);
  const direct = section('function editObstacleDimension', 'function beginUnavailableAreaDraw');
  assert.match(direct, /UNAVAILABLE_AREA_TRANSFORM\.resizeAroundCenter/);
  const selected = section('function drawObstacleSelectionGeometry', 'function drawObstacleAngleLabel');
  assert.match(selected, /cornerPoints\(obstacle\)/);
  assert.match(selected, /edgeGeometry\(obstacle/);
});

test('selected unavailable areas accept integer 0-359 rotation and reject duplicate names', () => {
  const apply = section('function applyObstacleEditorInputs', 'function duplicateSelectedObstacle');
  assert.match(apply, /normalizeIntegerRotation/);
  assert.match(apply, /SAVED_SPACES\.sameName/);
  assert.match(apply, /unavailable-area-renamed/);
  assert.match(html, /id="obstacleRotationInput"[^>]*min="0"[^>]*max="360"[^>]*step="1"/);
});

test('Start placement rejects field overflow and both unavailable-area models before snapshot', () => {
  const validity = section('function startPlacementValidity', 'function startPlacementMessage');
  const placement = section('function placeStartLane', 'function localEndpoints');
  assert.match(validity, /startInsideField/);
  assert.match(validity, /courseObstacleWarnings\(\[candidate\]\)/);
  assert.match(validity, /courseCutoutWarnings\(\[candidate\]\)/);
  assert.ok(placement.indexOf('if (!validity.valid)') < placement.indexOf('snapshot();'));
  assert.match(placement, /start-placement-blocked/);
  assert.match(placement, /start-placement-completed/);
});

test('course serialization remains RC3 and contains no saved-space library payload', () => {
  const serialize = section('function serializeState', 'function migratedPartType');
  for (const key of ['field', 'siteBoundary', 'roomCutouts', 'obstacles', 'parts', 'start', 'connections']) {
    assert.match(serialize, new RegExp(`${key}:`));
  }
  assert.doesNotMatch(serialize, /savedSpace|unavailableAreas/);
  assert.match(app, /const VERSION = '1\.1\.0-RC3'/);
});
