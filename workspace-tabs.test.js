'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('presentation-mode.js', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const presentationCss = fs.readFileSync('presentation-mode.css', 'utf8');

test('main editor exposes exactly the LAYOUT and OUTPUT workspace tabs', () => {
  assert.match(html, /id="workspaceTabs"[^>]*role="tablist"/);
  assert.match(html, /id="layoutTabBtn"[^>]*>LAYOUT<\/button>/);
  assert.match(html, /id="outputTabBtn"[^>]*>OUTPUT<\/button>/);
});

test('output view repeats the same LAYOUT and OUTPUT tabs', () => {
  assert.match(source, /layoutTab\.textContent = 'LAYOUT'/);
  assert.match(source, /outputTab\.textContent = 'OUTPUT'/);
  assert.match(source, /presentationLayoutTabBtn/);
  assert.match(source, /presentationOutputTabBtn/);
});

test('workspace tab state is synchronized in both windows', () => {
  assert.match(source, /function syncWorkspaceTabs\(mode\)/);
  assert.match(source, /syncWorkspaceTabs\('output'\)/);
  assert.match(source, /syncWorkspaceTabs\('layout'\)/);
  assert.match(source, /setAttribute\('aria-selected'/);
});

test('OUTPUT opens presentation without replacing or serializing editor state', () => {
  const openStart = source.indexOf('function open()');
  const closeStart = source.indexOf('function close()', openStart);
  const openBlock = source.slice(openStart, closeStart);
  assert.match(openBlock, /const layout = readLayout\(\)/);
  assert.match(openBlock, /view\.hidden = false/);
  assert.doesNotMatch(openBlock, /applySerialized|loadState|localStorage\.setItem/);
});

test('returning to LAYOUT restores editor canvas sizing without rebuilding the layout', () => {
  const closeStart = source.indexOf('function close()');
  const exportStart = source.indexOf('async function exportPng', closeStart);
  const closeBlock = source.slice(closeStart, exportStart);
  assert.match(closeBlock, /body\.classList\.remove\('presentation-mode-open'\)/);
  assert.match(closeBlock, /dispatchEvent\(new Event\('resize'\)\)/);
  assert.doesNotMatch(closeBlock, /applySerialized|loadState/);
});

test('legacy direct PNG button is hidden when workspace tabs are present', () => {
  assert.match(html, /id="exportBtn" class="button primary legacy-direct-export"/);
  assert.match(css, /workspace-tabs ~ \.top-actions \.legacy-direct-export \{ display: none; \}/);
});

test('OUTPUT retains PNG and A4 controls', () => {
  assert.match(source, /png\.textContent = 'PNG保存'/);
  assert.match(source, /print\.textContent = 'A4印刷'/);
  assert.match(presentationCss, /\.presentation-workspace-tabs/);
});
