'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('simple-ui.js', 'utf8');
const wheel = fs.readFileSync('wheel-rotation.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

test('detail drawer is manual-only and selection changes cannot auto-open it', () => {
  assert.match(ui, /function computeDrawerState\(\{ manualOpen = false \} = \{\}\)/);
  assert.match(ui, /const open = Boolean\(manualOpen\)/);
  assert.doesNotMatch(ui, /const autoOpen = Boolean\(contextActive/);
  assert.match(ui, /detailsToggleBtn\.addEventListener\('click',[\s\S]*manualOpen = !manualOpen/);
});

test('trash lives in the top toolbar and is visible without changing canvas height', () => {
  assert.match(ui, /rightToolbarGroup\.append\(dragTrash\)/);
  assert.match(ui, /body\.simple-ui-enabled \.drag-trash \{[\s\S]*position: static !important;[\s\S]*height: 32px;[\s\S]*opacity: 1;/);
  assert.doesNotMatch(ui, /body\.simple-ui-enabled \.drag-trash \{[\s\S]*top: 56px;/);
});

test('course-part drop on trash consumes normal move pointerup and keeps one-step undo', () => {
  assert.match(ui, /event\.stopImmediatePropagation\(\)/);
  assert.match(ui, /runtime\?\.historyLength[\s\S]*drag\.historyLength/);
  assert.match(ui, /KeyboardEvent\('keydown',[\s\S]*ctrlKey: true/);
  assert.match(ui, /debug\.setSelectedIds\(drag\.ids\);\s*debug\.deleteParts\(drag\.ids\);/);
  assert.match(ui, /PointerEvent\('pointercancel'/);
});

test('private production bridge is cache-busted and does not leave debug mode enabled', () => {
  assert.match(wheel, /exposeCoursePartTrashBridgeApiOnce/);
  assert.match(wheel, /value: false/);
  assert.match(wheel, /simple-ui\.js\?v=v1\.1-rc4-20260820-toolbar-trash1/);
  assert.match(index, /wheel-rotation\.js\?v=v1\.1-rc4-20260820-toolbar-trash1/);
});
