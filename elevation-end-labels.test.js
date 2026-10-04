'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

test('Slope keeps low=blue and high=red while Bank20 uses entry=blue and exit=red', () => {
  assert.match(app, /low: '#1976ff'/);
  assert.match(app, /high: '#ff3131'/);
  assert.match(app, /entry: '#1976ff'/);
  assert.match(app, /exit: '#ff3131'/);
  assert.match(app, /function drawElevationEndMarkers\(/);
  assert.doesNotMatch(app, /text: 'LOW'/);
  assert.doesNotMatch(app, /text: 'HIGH'/);
});

test('Slope end colours are still derived from endpoint elevation', () => {
  const start = app.indexOf('function elevationEndMarkerEntries');
  const end = app.indexOf('function drawElevationEndMarkers', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(def\.slope\)/);
  assert.match(block, /const z0 = Number\(endpoints\[0\]\?\.zMm\)/);
  assert.match(block, /const z1 = Number\(endpoints\[1\]\?\.zMm\)/);
  assert.match(block, /kind: 'low'/);
  assert.match(block, /kind: 'high'/);
});

test('Bank20 marker colour is defined by semantic bankRole instead of bank height', () => {
  const start = app.indexOf('function elevationEndMarkerEntries');
  const end = app.indexOf('function drawElevationEndMarkers', start);
  const block = app.slice(start, end);
  assert.match(block, /let role = part\.bankRole/);
  assert.match(block, /role !== 'entry' && role !== 'exit'/);
  assert.match(block, /color: BANK_SECTION_MARKER_COLORS\[role\]/);
  assert.doesNotMatch(block, /kind: 'low'.*def\.bank20/s);
  assert.doesNotMatch(block, /kind: 'high'.*def\.bank20/s);
});

test('Bank20 marker sits on the flatter transition endpoint but keeps full plan width', () => {
  const start = app.indexOf('function elevationEndMarkerEntries');
  const end = app.indexOf('function drawElevationEndMarkers', start);
  const block = app.slice(start, end);
  assert.match(block, /const boundaryIndex = angles\[0\] <= angles\[1\] \? 0 : 1/);

  const markerStart = app.indexOf('function drawElevationEndMarkers');
  const markerEnd = app.indexOf('function drawPart(c, part', markerStart);
  const markerBlock = app.slice(markerStart, markerEnd);
  assert.match(markerBlock, /def\.bank20[\s\S]*def\.geometry\?\.height/);
  assert.doesNotMatch(markerBlock, /bankFaceProjection|projectedWidthMm|centerOffsetCm/);
});

test('palette and visual-only QA previews suppress elevation markers', () => {
  assert.match(app, /suppressElevationMarkers: true/);
  assert.match(app, /suppressElevationMarkers:!!visualOnly/);
  assert.match(app, /if \(opts\.suppressElevationMarkers\) return;/);
});

test('Bank20 fallback does not add angle labels or artificial wedge guides', () => {
  const start = app.indexOf('function drawBankGraphic');
  const end = app.indexOf('function drawJumpGraphic', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /fillText\(/);
  assert.doesNotMatch(block, /for \(const t of \[1 \/ 3, 2 \/ 3\]\)/);
  assert.doesNotMatch(block, /projectY|pivotY/);
});
