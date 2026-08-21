'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('./presentation-mode.css'), 'utf8');
const snap = fs.readFileSync(require.resolve('./snap-toggle.js'), 'utf8');
const exportSource = fs.readFileSync(require.resolve('./presentation-export.js'), 'utf8');

test('presentation shell follows the editor dark theme with racing red accents', () => {
  assert.match(css, /--pr-bg:\s*#070b10/);
  assert.match(css, /--pr-panel:\s*#0e141c/);
  assert.match(css, /--pr-red:\s*#e52f38/);
  assert.match(css, /radial-gradient/);
  assert.doesNotMatch(css, /background:\s*#eef1f4/);
});

test('presentation UI uses condensed racing typography without remote font dependencies', () => {
  assert.match(css, /Bahnschrift SemiCondensed/);
  assert.match(css, /Arial Narrow/);
  assert.doesNotMatch(css, /@import\s+url/);
  assert.doesNotMatch(css, /fonts\.googleapis/);
  assert.match(exportSource, /Bahnschrift SemiCondensed/);
});

test('cache-safe racing stylesheet is preloaded before presentation mode opens', () => {
  assert.match(snap, /presentationModeStyles/);
  assert.match(snap, /presentation-mode\.css\?v=v1\.1-rc5-20260821-racing1/);
});

test('presentation output remains print-friendly Grid White Transparent rather than dark paper', () => {
  assert.match(exportSource, /\['grid','white','transparent'\]/);
  assert.match(exportSource, /fillStyle = '#ffffff'/);
});
