'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

test('slope and Bank20 use blue LOW-end and red HIGH-end lines instead of LOW/HIGH text', () => {
  assert.match(app, /low: '#1976ff'/);
  assert.match(app, /high: '#ff3131'/);
  assert.match(app, /function drawElevationEndMarkers\(/);
  assert.doesNotMatch(app, /text: 'LOW'/);
  assert.doesNotMatch(app, /text: 'HIGH'/);
  assert.doesNotMatch(app, /drawElevationEndLabels/);
});

test('slope end colours are derived from endpoint elevation', () => {
  const start = app.indexOf('function elevationEndMarkerEntries');
  const end = app.indexOf('function drawElevationEndMarkers', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(def\.slope\)/);
  assert.match(block, /endpoints\[0\]\?\.zMm/);
  assert.match(block, /endpoints\[1\]\?\.zMm/);
  assert.match(block, /kind: 'low'/);
  assert.match(block, /kind: 'high'/);
});

test('Bank20 end colours follow the smaller and larger bank angles', () => {
  const start = app.indexOf('function elevationEndMarkerEntries');
  const end = app.indexOf('function drawElevationEndMarkers', start);
  const block = app.slice(start, end);
  assert.match(block, /Math\.abs\(Number\(endpoints\[0\]\?\.connectionState\?\.bankAngle/);
  assert.match(block, /Math\.abs\(Number\(endpoints\[1\]\?\.connectionState\?\.bankAngle/);
});

test('end markers are drawn after the part transform is restored and use the projected Bank20 face', () => {
  const start = app.indexOf('function drawPart(c, part');
  const end = app.indexOf('function drawPartConnectionFaces', start);
  const block = app.slice(start, end);
  const restore = block.lastIndexOf('c.restore();');
  const markers = block.indexOf('drawElevationEndMarkers(c, part, def, opts);');
  assert.ok(restore >= 0);
  assert.ok(markers > restore);

  const markerStart = app.indexOf('function drawElevationEndMarkers');
  const markerEnd = app.indexOf('function drawPart(c, part', markerStart);
  const markerBlock = app.slice(markerStart, markerEnd);
  assert.match(markerBlock, /bankFaceProjection\(part, def, angle, widthMm\)/);
  assert.match(markerBlock, /projection\.centerOffsetCm/);
  assert.match(markerBlock, /projection\.projectedWidthMm/);
});

test('palette and visual-only QA previews suppress elevation markers', () => {
  assert.match(app, /suppressElevationMarkers: true/);
  assert.match(app, /suppressElevationMarkers:!!visualOnly/);
  assert.match(app, /if \(opts\.suppressElevationMarkers\) return;/);
});

test('Bank20 removes tiny angle text and adds stronger wedge guides instead', () => {
  const start = app.indexOf('function drawBankGraphic');
  const end = app.indexOf('function drawJumpGraphic', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /fillText\(/);
  assert.match(block, /for \(const t of \[1 \/ 3, 2 \/ 3\]\)/);
  assert.match(block, /rgba\(255,255,255,\.62\)/);
});
