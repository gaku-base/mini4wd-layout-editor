'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const UI = require('./ui-controls-cleanup.js');

const SOURCE = fs.readFileSync(require.resolve('./ui-controls-cleanup.js'), 'utf8');
const SNAP_SOURCE = fs.readFileSync(require.resolve('./snap-toggle.js'), 'utf8');

test('top actions use user-facing names and hide JSON terminology', () => {
  assert.deepEqual(UI.TOP_ACTION_LABELS, {
    newBtn: '＋ 新規作成',
    saveBtn: '💾 レイアウト保存',
    loadInput: '📂 レイアウト読込',
    presentationBtn: '▣ 発表・出力'
  });
});

test('editor actions use icon plus plain Japanese labels', () => {
  assert.equal(UI.EDITOR_ACTION_LABELS.undoBtn, '↶ 元に戻す');
  assert.equal(UI.EDITOR_ACTION_LABELS.redoBtn, '↷ やり直す');
  assert.equal(UI.EDITOR_ACTION_LABELS.rewindBtn, '↩ 1パーツ戻る');
  assert.equal(UI.EDITOR_ACTION_LABELS.rotateLeftBtn, '↺ 左回転');
  assert.equal(UI.EDITOR_ACTION_LABELS.rotateRightBtn, '↻ 右回転');
});

test('display and placement commands are consolidated into one overflow menu', () => {
  assert.deepEqual(UI.OVERFLOW_ACTIONS.map(([id]) => id), [
    'gridBtn',
    'fitViewBtn',
    'manualFitBtn',
    'topLeftFitBtn',
    'autoFitFieldBtn'
  ]);
  assert.match(SOURCE, /⋯ 表示・配置/);
  assert.match(SOURCE, /コース全体を表示/);
  assert.match(SOURCE, /コース全体を移動/);
  assert.match(SOURCE, /コースを左上へ整列/);
  assert.match(SOURCE, /作成範囲をコースに合わせる/);
});

test('legacy course-only PNG is preserved inside presentation output', () => {
  assert.equal(UI.PRESENTATION_ACTION_LABELS.presentationPngBtn, 'PNG画像を保存');
  assert.equal(UI.PRESENTATION_ACTION_LABELS.presentationPrintBtn, 'A4で印刷');
  assert.equal(UI.PRESENTATION_ACTION_LABELS.courseOnly, 'コース図のみ保存');
  assert.match(SOURCE, /presentationCourseOnlyPngBtn/);
  assert.match(SOURCE, /button\.addEventListener\('click', \(\) => legacy\.click\(\)\)/);
  assert.match(SOURCE, /exportButton\.classList\.add\('ui-legacy-export-source'\)/);
});

test('cleanup is loaded from the already-required snap toggle entry point with cache busting', () => {
  assert.match(SNAP_SOURCE, /ui-controls-cleanup\.js\?v=20260821-ui1/);
  assert.match(SNAP_SOURCE, /uiControlsCleanupLoader/);
});
