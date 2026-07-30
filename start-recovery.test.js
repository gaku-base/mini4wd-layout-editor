'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('./app.js', 'utf8');
const html = fs.readFileSync('./index.html', 'utf8');

function functionSource(name, nextName) {
  const start = app.indexOf(`function ${name}`);
  const end = app.indexOf(`function ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `${name} is present`);
  return app.slice(start, end);
}

test('R restores the removed part type and rebuilds the fast-path anchor from its predecessor', () => {
  const source = functionSource('rewindLastPart', 'deleteParts');
  assert.match(source, /removedEdge/);
  assert.match(source, /const predecessor = removedEdge/);
  assert.match(source, /state\.cursor = \{ x: state\.activeConnection\.x, y: state\.activeConnection\.y \}/);
  assert.match(source, /state\.selectedType = removed\.type/);
  assert.match(source, /activateFastPathPlacement\(state\.activeConnection, removed\.type/);
  assert.match(source, /refreshFastPathGhostProposal\(\)/);
});

test('R recovery rebuilds a visible proposal without waiting for pointer movement', () => {
  const source = functionSource('rewindLastPart', 'deleteParts');
  assert.match(source, /activateFastPathPlacement\(state\.activeConnection, removed\.type, pointerScreen\)/);
  assert.match(source, /refreshFastPathGhostProposal\(\)/);
  assert.doesNotMatch(source, /state\.ghostProposal = null/);
});

test('Start participates in hit testing, selection, drag, and deletion', () => {
  assert.match(functionSource('hitTest', 'partsInRect'), /state\.start && pointInPartShape/);
  assert.match(functionSource('partsInRect', 'normalizedRect'), /matches\.push\(state\.start\)/);
  assert.match(functionSource('selectedParts', 'setSelection'), /findLayoutPartById/);
  const deleteSource = functionSource('deleteParts', 'cyclePartsColor');
  assert.match(deleteSource, /deletesStart/);
  assert.match(deleteSource, /state\.start = null/);
  assert.match(deleteSource, /開始位置が未設定/);
});

test('a missing Start produces both recovery controls and a persistent warning', () => {
  assert.match(app, /type: 'missing-start'/);
  assert.match(app, /function drawMissingStartWarning/);
  assert.match(app, /function convertStraightToStart/);
  assert.match(app, /function onCanvasContextMenu/);
  assert.match(html, /id="convertStartBtn"/);
  assert.match(html, /id="canvasContextMenu"/);
});

test('straight-to-Start conversion preserves matching connector IDs and supports undo snapshots', () => {
  const source = functionSource('convertStraightToStart', 'onCanvasContextMenu');
  assert.match(source, /snapshot\(\)/);
  assert.match(source, /state\.start = \{ \.\.\.straight, id: 'start', type: 'start'/);
  assert.match(source, /partAId: edge\.partAId === straight\.id \? 'start'/);
  assert.match(source, /partBId: edge\.partBId === straight\.id \? 'start'/);
});
