'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

test('slope and Bank20 layout overlays use English LOW/HIGH labels', () => {
  assert.match(app, /\{ text: 'LOW', endpoint: endpoints\[lowIndex\], kind: 'low' \}/);
  assert.match(app, /\{ text: 'HIGH', endpoint: endpoints\[highIndex\], kind: 'high' \}/);
  assert.match(app, /function drawElevationEndLabels\(/);
});

test('slope LOW/HIGH is derived from endpoint elevation', () => {
  const start = app.indexOf('function elevationEndLabelEntries');
  const end = app.indexOf('function drawElevationEndLabels', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(def\.slope\)/);
  assert.match(block, /endpoints\[0\]\?\.zMm/);
  assert.match(block, /endpoints\[1\]\?\.zMm/);
});

test('Bank20 LOW/HIGH follows the smaller and larger bank angles', () => {
  const start = app.indexOf('function elevationEndLabelEntries');
  const end = app.indexOf('function drawElevationEndLabels', start);
  const block = app.slice(start, end);
  assert.match(block, /Math\.abs\(Number\(endpoints\[0\]\?\.connectionState\?\.bankAngle/);
  assert.match(block, /Math\.abs\(Number\(endpoints\[1\]\?\.connectionState\?\.bankAngle/);
});

test('LOW/HIGH overlays are drawn after the part transform is restored so text stays screen-readable', () => {
  const start = app.indexOf('function drawPart(c, part');
  const end = app.indexOf('function drawPartConnectionFaces', start);
  const block = app.slice(start, end);
  const restore = block.lastIndexOf('c.restore();');
  const labels = block.indexOf('drawElevationEndLabels(c, part, def, opts);');
  assert.ok(restore >= 0);
  assert.ok(labels > restore);
});

test('palette previews suppress LOW/HIGH labels while layout/export rendering keeps them available', () => {
  assert.match(app, /suppressElevationLabels: true/);
  assert.match(app, /if \(opts\.suppressElevationLabels\) return;/);
});
