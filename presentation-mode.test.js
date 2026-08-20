'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('presentation-mode.js','utf8');
const css = fs.readFileSync('presentation-mode.css','utf8');
const printCss = fs.readFileSync('presentation-print.css','utf8');

test('presentation mode offers exactly the approved white-based backgrounds', () => {
  assert.match(source, /presentationBgGrid/);
  assert.match(source, /presentationBgWhite/);
  assert.match(source, /presentationBgTransparent/);
  assert.doesNotMatch(source, /presentationBgDark/);
});

test('tournament name has two fields and layouter remains optional', () => {
  assert.match(source, /大会名 1行目/);
  assert.match(source, /大会名 2行目/);
  assert.match(source, /レイアウター名/);
  assert.match(source, /event-name-required|大会名1行目を入力してください/);
});

test('presentation capture narrows the private editor bridge to read-only state access', () => {
  assert.match(source, /const readLayout = typeof privateDebug\?\.getState/);
  assert.match(source, /const readRuntime = typeof privateDebug\?\.getRuntimeState/);
  assert.doesNotMatch(source, /privateDebug\?\.(deleteParts|loadState|moveParts|rotateParts)/);
});

test('PNG and A4 controls are separate from the printable sheet', () => {
  assert.match(source, /PNG保存/);
  assert.match(source, /A4印刷/);
  assert.match(source, /presentationPrintSheet/);
  assert.match(printCss, /presentation-toolbar[\s\S]*display: none !important/);
  assert.match(printCss, /presentation-stage[\s\S]*display: none !important/);
});

test('presentation view is responsive down to phone width', () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0,1fr\)\)/);
});

test('normal JSON save is enriched with optional presentation metadata without editor mutation', () => {
  assert.match(source, /DATA\.withMetadata\(layout, metadata\)/);
  assert.match(source, /saveButton\?\.addEventListener\('click',[\s\S]*stopImmediatePropagation\(\)/);
});
