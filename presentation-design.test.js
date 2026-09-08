'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync(require.resolve('./presentation-mode.css'), 'utf8');
const bootstrap = fs.readFileSync(require.resolve('./editor-extensions-bootstrap.js'), 'utf8');
const exportSource = fs.readFileSync(require.resolve('./presentation-export.js'), 'utf8');

test('presentation shell keeps the dark editor theme with orange racing accents', () => {
  assert.match(css, /--pr-bg:\s*#070b10/);
  assert.match(css, /--pr-panel:\s*#0e141c/);
  assert.match(css, /--pr-orange:\s*#ff8a00/);
  assert.match(css, /--pr-on-orange:\s*#101318/);
  assert.match(css, /radial-gradient/);
  assert.doesNotMatch(css, /background:\s*#eef1f4/);
});

test('primary output controls use orange surfaces with dark readable text', () => {
  assert.match(css, /\.presentation-entry-btn\s*\{[\s\S]*background:[\s\S]*#ffa126[\s\S]*color:\s*#101318\s*!important/);
  assert.match(css, /\.presentation-primary\s*\{[\s\S]*background:[\s\S]*var\(--pr-orange-bright\)[\s\S]*color:\s*var\(--pr-on-orange\)/);
  assert.match(css, /\.presentation-choice\.is-active\s*\{[\s\S]*color:\s*var\(--pr-on-orange\)[\s\S]*var\(--pr-orange-bright\)/);
  assert.doesNotMatch(css, /\.presentation-primary\s*\{[\s\S]*?color:\s*#fff/);
});

test('presentation UI uses condensed racing typography without remote font dependencies', () => {
  assert.match(css, /Bahnschrift SemiCondensed/);
  assert.match(css, /Arial Narrow/);
  assert.doesNotMatch(css, /@import\s+url/);
  assert.doesNotMatch(css, /fonts\.googleapis/);
  assert.match(exportSource, /Bahnschrift SemiCondensed/);
});

test('cache-safe racing stylesheet is preloaded by the editor extension bootstrap', () => {
  assert.match(bootstrap, /presentationModeStyles/);
  assert.match(bootstrap, /presentation-mode\.css\?v=\$\{CACHE_KEY\}/);
  assert.match(bootstrap, /const CACHE_KEY = 'v1\.1-rc6-health1'/);
});

test('presentation output remains print-friendly Grid White Transparent rather than dark paper', () => {
  assert.match(exportSource, /\['grid','white','transparent'\]/);
  assert.match(exportSource, /fillStyle = '#ffffff'/);
});
