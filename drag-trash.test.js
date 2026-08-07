'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('the fixed delete target is outside the canvas and exposes normal, dragging, and delete-target states', () => {
  const trash = html.indexOf('id="dragTrash"');
  assert.ok(trash > html.indexOf('id="canvasToolbar"'));
  assert.ok(trash < html.indexOf('id="canvasWrap"'));
  assert.match(html, /id="dragTrashLabel"/);
  assert.match(css, /\.drag-trash\.is-dragging/);
  assert.match(css, /\.drag-trash\.is-delete-target/);
  assert.match(css, /pointer-events: none/);
});

test('trash hit testing uses viewport DOM coordinates and state is always cleared after interaction', () => {
  const hitTest = section('function pointerIsOverDragTrash', 'function updateDragTrashState');
  const clear = section('function clearDragTrashState', 'function cancelCadDrag');
  assert.match(hitTest, /getBoundingClientRect\(\)/);
  assert.match(hitTest, /e\.clientX/);
  assert.match(hitTest, /e\.clientY/);
  assert.match(clear, /active: false, over: false, kind: null/);
  assert.match(app, /clearDragTrashState\(\);\s*persistLocal\(\); updateUI\(\); render\(\);/);
});

test('cutout and obstacle trash drops delete once from their pre-drag history state', () => {
  const cutoutUp = section('function onCadPointerUp', 'function replaceCutout');
  const obstacleUp = section('function onPointerUp', 'function onPointerLeave');
  assert.match(cutoutUp, /const deleteCutout = drag\.kind === 'move' && pointerIsOverDragTrash\(e\)/);
  assert.match(cutoutUp, /snapshotSerialized\(drag\.historyState\)/);
  assert.match(obstacleUp, /const deleteObstacle = pointerIsOverDragTrash\(e\)/);
  assert.match(obstacleUp, /state\.obstacles = state\.obstacles\.filter/);
  assert.match(obstacleUp, /snapshotSerialized\(drag\.historyState\)/);
});

test('locked obstacles cannot start a drag, including the initial-setup interference editor', () => {
  const begin = section('function beginObstacleDrag', 'function clearObstacleSelection');
  const down = section('function onPointerDown', 'function onPointerMove');
  assert.match(begin, /if \(obstacle\.locked\)/);
  assert.match(begin, /ロック中の設置不可エリアは移動・ゴミ箱削除できません/);
  assert.match(down, /state\.wizard\.active && state\.subEditMode === 'interference'[\s\S]*beginObstacleDrag\(obstacle, e, world\)/);
});

test('Escape and pointer cancellation restore an in-progress drag instead of confirming it', () => {
  const cancel = section('function cancelObstacleDrag', 'function clearObstacleSelection');
  const pointerCancel = section('function onPointerCancel', 'function beginMarquee');
  const keyDown = section('function onKeyDown', 'function clearSnapTargetChoice');
  assert.match(cancel, /replaceObstacle\(state\.obstacleDrag\.original, false\)/);
  assert.match(cancel, /clearDragTrashState\(\)/);
  assert.match(pointerCancel, /cancelObstacleDrag\(\)/);
  assert.match(keyDown, /key === 'escape' && \(state\.cad\.drag \|\| state\.obstacleDrag\)/);
});
