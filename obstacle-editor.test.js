const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const persistence = fs.readFileSync('persistence.js', 'utf8');

test('three layout-space tabs and the obstacle editor are available without renaming persisted cutout fields', () => {
  assert.match(index, /data-space-tab="boundary"[^>]*>レイアウトスペース/);
  assert.match(index, /data-space-tab="cutout"[^>]*>スペース修正/);
  assert.match(index, /data-space-tab="obstacle"[^>]*>干渉物設定/);
  assert.match(index, /id="obstacleCreateDialog"/);
  assert.match(index, /<script src="obstacles\.js"><\/script>\s*<script src="render-scheduler\.js"><\/script>/);
  assert.match(persistence, /'roomCutouts', 'obstacles'/);
});

test('obstacles are normalized, serialized, restored, rendered in PNG, and excluded from interaction previews', () => {
  assert.match(app, /obstacles: OBSTACLES\.normalizeObstacles\(migrated\.obstacles \|\| \[\]\)/);
  assert.match(app, /obstacles: state\.obstacles\.map\(obstacle => \(\{ \.\.\.obstacle \}\)\)/);
  assert.match(app, /state\.obstacles = OBSTACLES\.normalizeObstacles\(data\.obstacles \|\| \[\]\)/);
  assert.match(app, /drawObstacles\(c, \{ exportMode: true \}\)/);
  assert.match(app, /if \(state\.obstacle\.ghost\) drawObstacle\(c, state\.obstacle\.ghost, \{ ghost: true \}\)/);
});

test('obstacle input separates Ctrl zoom, 90 degree wheel rotation, placement, drag, warning, and cancel states', () => {
  const wheel = app.slice(app.indexOf('function onWheel'), app.indexOf('function hasWheelRotatableTarget'));
  assert.match(wheel, /if \(e\.ctrlKey\) \{\s*e\.preventDefault\(\);\s*wheelRotation\.reset\(\);/);
  assert.match(wheel, /if \(state\.mode === 'obstacle'\)[\s\S]*rotateObstacle\(direction < 0 \? -90 : 90\)/);
  assert.match(app, /function onObstaclePointerUp[\s\S]*OBSTACLES\.nextObstacleId/);
  assert.match(app, /function onObstaclePointerMove[\s\S]*snapMovedObstacle/);
  assert.match(app, /function cancelObstacleInteraction[\s\S]*state\.obstacle\.ghost = null/);
  assert.match(app, /type: 'obstacle-course-interference'/);
  assert.match(app, /type: 'obstacle-interference'/);
  assert.match(app, /type: 'obstacle-outside-space'/);
});
