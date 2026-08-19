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

test('save and skip transitions share the final unavailable-area boundary guard', () => {
  const validator = section('function validateUnavailableAreasForTransition', 'function saveCurrentSpaceAndContinue');
  const save = section('function saveCurrentSpaceAndContinue', 'function ensureSetupDialogOpen');
  const skip = section('function startLayoutFromUnavailableAreaScreen', 'function exitSubEditMode');
  assert.match(validator, /savedSpaceAreasFromCurrentDraft\(\)/);
  assert.match(validator, /SAVED_SPACES\.areaInsideField/);
  assert.match(validator, /obstaclePlacementValidity\(area\)\.valid !== true/);
  assert.match(validator, /selectObstacle\(firstObstacle\.id/);
  assert.match(validator, /unavailable-area-outside-field/);
  assert.match(save, /validateUnavailableAreasForTransition\('save-space'\)/);
  assert.match(skip, /validateUnavailableAreasForTransition\('layout-start'\)/);
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
  assert.match(apply, /parseIntegerRotationInput/);
  assert.match(apply, /SAVED_SPACES\.validateAreaName/);
  assert.match(apply, /unavailable-area-renamed/);
  assert.match(html, /id="obstacleRotationInput"[^>]*min="0"[^>]*max="360"[^>]*step="1"/);
});

test('canvas labels have dedicated hit tests and direct edit handlers', () => {
  const pointer = section('function onPointerDown', 'function onPointerMove');
  const labels = section('function obstacleAngleLabelHitTest', 'function beginObstacleResize');
  const direct = section('function editObstacleAngleFromCanvas', 'function cancelObstacleDrag');
  assert.ok(pointer.indexOf('obstacleAngleLabelHitTest') < pointer.indexOf('obstacleHitTest'));
  assert.ok(pointer.indexOf('obstacleNameLabelHitTest') < pointer.indexOf('obstacleHitTest'));
  assert.match(labels, /obstacleAngleLabelBox/);
  assert.match(labels, /obstacleNameLabelBox/);
  assert.match(direct, /beginCanvasLabelEdit\('angle'/);
  assert.match(direct, /commitCanvasLabelEdit/);
  assert.match(direct, /parseIntegerRotationInput/);
  assert.match(direct, /obstacle\.locked/);
  assert.match(direct, /SAVED_SPACES\.validateAreaName/);
  assert.match(direct, /inputMethod: 'canvas-label'/);
});

test('canvas name editing matches sidebar lock semantics and validates empty and duplicate names', () => {
  const direct = section('function editObstacleNameFromCanvas', 'function cancelObstacleDrag');
  const entry = section('function editObstacleNameFromCanvas', 'function beginCanvasLabelEdit');
  assert.match(entry, /if \(obstacle\.locked\)/);
  assert.match(entry, /ロック中の設置不可エリアは名前変更できません/);
  assert.ok(entry.indexOf('obstacle.locked') < entry.indexOf("beginCanvasLabelEdit('name'"));
  assert.match(direct, /empty-name/);
  assert.match(direct, /duplicate-name/);
  assert.match(direct, /beginCanvasLabelEdit\('name'/);
  assert.match(direct, /updateObstacle\(obstacle, \{ name: validation\.name \}\)/);
  assert.match(direct, /snapshot\(\); replaceObstacle\(next\)/);
  assert.match(direct, /cancelCanvasLabelEdit/);
});

test('canvas name commit rejects an area locked after editing began before mutation or history', () => {
  const commit = section('function commitCanvasLabelEdit', 'function cancelObstacleDrag');
  const guard = commit.indexOf("if (edit.kind === 'name' && obstacle.locked)");
  assert.notEqual(guard, -1);
  assert.ok(guard < commit.indexOf('SAVED_SPACES.validateAreaName'));
  assert.ok(guard < commit.indexOf('snapshot(); replaceObstacle(next)'));
  const guarded = commit.slice(guard, commit.indexOf("if (edit.kind === 'angle')"));
  assert.match(guarded, /cancelCanvasLabelEdit\(\)/);
  assert.match(guarded, /名前変更できません/);
  assert.match(guarded, /return false/);
});

test('canvas label editor commits with Enter and cancels with Escape without prompt dialogs', () => {
  const binding = section('function bindEvents', 'function openSetup');
  const direct = section('function editObstacleAngleFromCanvas', 'function cancelObstacleDrag');
  assert.match(html, /id="canvasLabelEditor"/);
  assert.match(binding, /event\.key === 'Enter'/);
  assert.match(binding, /event\.key === 'Escape'/);
  assert.doesNotMatch(direct, /window\.prompt/);
});

test('area names render horizontally after the rotated obstacle context is restored', () => {
  const shape = section('function drawObstacleShape', 'function drawObstacleSelectionGeometry');
  assert.ok(shape.indexOf('c.restore();') < shape.indexOf('drawObstacleNameLabel'));
  const name = section('function drawObstacleNameLabel', 'function drawObstacleSelectionGeometry');
  assert.doesNotMatch(name, /rotate\(/);
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
