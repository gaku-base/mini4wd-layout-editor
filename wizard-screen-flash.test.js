'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

test('wizard dialog visibility is guarded and transitions do not directly cycle the modal', () => {
  const helpers = section('function ensureSetupDialogOpen', 'function setNewLayoutModalTab');
  assert.match(helpers, /if \(els\.setupDialog\.open\) return false;\s*els\.setupDialog\.showModal\(\)/);
  assert.match(helpers, /if \(!els\.setupDialog\.open\) return false;\s*els\.setupDialog\.close\(\)/);
  assert.equal((app.match(/els\.setupDialog\.showModal\(\)/g) || []).length, 1);
  assert.equal((app.match(/els\.setupDialog\.close\(\)/g) || []).length, 1);

  const exit = section('function exitSubEditMode', 'function prepareNewInitialSetupDraft');
  assert.match(exit, /ensureSetupDialogOpen\(\)/);
  assert.doesNotMatch(exit, /setupDialog\.(?:close|showModal)\(/);
});

test('canvas backing resize and complete repaint run in one animation frame', () => {
  const resize = section('function resizeCanvas', 'function syncCanvasSizeForFrame');
  const sync = section('function syncCanvasSizeForFrame', 'function fitView');
  const frame = section('function drawFrame', 'function drawBackground');

  assert.match(resize, /render\(\)/);
  assert.doesNotMatch(resize, /courseCanvas\.(?:width|height)\s*=/);
  assert.match(sync, /courseCanvas\.width = frame\.width/);
  assert.match(sync, /courseCanvas\.height = frame\.height/);
  assert.ok(frame.indexOf('syncCanvasSizeForFrame()') < frame.indexOf('ctx.clearRect'));
  assert.match(frame, /syncCanvasSizeForFrame\(\)[\s\S]*ctx\.clearRect[\s\S]*drawBackground/);
});

test('sub-editor footer visibility queues the atomic canvas frame without changing fit semantics', () => {
  const update = section('function updateUI', 'function updateStatusOnly');
  const fit = section('function fitView', 'function drawFrame');
  assert.match(update, /els\.statusBar\.hidden = subEditorActive;[\s\S]*if \(statusVisibilityChanged\) resizeCanvas\(\)/);
  assert.match(fit, /state\.field\.widthCm/);
  assert.match(fit, /state\.field\.heightCm/);
  assert.match(fit, /Math\.min\(sx, sy\)/);
  assert.match(fit, /updateUI\(\);\s*render\(\)/);
});
