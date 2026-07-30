const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ROOM = require('./room-boundary.js');

test('site boundary rounds to 10mm, accepts negative origins, and enforces 10mm sizes', () => {
  assert.deepEqual(ROOM.normalizeSiteBoundary({ x: -14, y: -15, width: 4, height: -7 }), {
    name: '設置範囲', shape: 'rectangle', x: -10, y: -10, width: 10, height: 10, visible: true
  });
});

test('legacy field creates a backwards-compatible site boundary', () => {
  assert.deepEqual(ROOM.defaultSiteBoundary({ originX: -20, originY: 10, widthCm: 900, heightCm: 600 }), {
    name: '設置範囲', shape: 'rectangle', x: -200, y: 100, width: 9000, height: 6000, visible: true
  });
});

test('reverse drag creates a minimum rounded rectangle', () => {
  const cutout = ROOM.cutoutFromDrag({ x: 95, y: 205 }, { x: -4, y: 101 });
  assert.deepEqual({ x: cutout.x, y: cutout.y, width: cutout.width, height: cutout.height }, { x: 0, y: 100, width: 100, height: 110 });
});

test('outside cutouts are allowed and only their overlap removes room area', () => {
  const boundary = { width: 9000, height: 6000 };
  const metrics = ROOM.effectiveRoomMetrics(boundary, [{ id: 'x', x: 6000, y: -1000, width: 5000, height: 3500 }]);
  assert.equal(metrics.cutoutArea, 3000 * 2500);
  assert.equal(metrics.effectiveArea, 9000 * 6000 - 3000 * 2500);
  assert.equal(ROOM.effectiveRoomMetrics(boundary, [{ id: 'outside', x: 10000, y: 0, width: 100, height: 100 }]).cutoutArea, 0);
});

test('overlapping cutouts are unioned once and invisible cutouts do not exclude space', () => {
  const boundary = { width: 1000, height: 1000 };
  const base = [{ id: 'a', x: 0, y: 0, width: 600, height: 600 }, { id: 'b', x: 400, y: 400, width: 600, height: 600 }];
  assert.equal(ROOM.effectiveRoomMetrics(boundary, base).cutoutArea, 680000);
  assert.equal(ROOM.effectiveRoomMetrics(boundary, [{ ...base[0], visible: false }]).cutoutArea, 0);
});

test('rotation uses an exterior rectangle for distances', () => {
  const distances = ROOM.distancesToBoundary({ width: 1000, height: 800 }, { id: 'a', x: 100, y: 200, width: 400, height: 200, rotation: 90 });
  assert.deepEqual(distances, { left: 200, right: 600, top: 100, bottom: 300 });
});

test('cutouts normalize invalid shape and rotation, deduplicate ids, move and duplicate safely', () => {
  const cutouts = ROOM.normalizeRoomCutouts([{ id: 'a', shape: 'ellipse', rotation: 40 }, { id: 'a', width: 20, height: 30 }]);
  assert.deepEqual(cutouts.map(item => [item.id, item.shape, item.rotation]), [['a', 'rectangle', 0], ['a-2', 'rectangle', 0]]);
  assert.deepEqual(ROOM.moveCutout(cutouts[0], { x: -16, y: 24 }).x, -20);
  assert.equal(ROOM.duplicateCutout(cutouts[0], cutouts).id, 'cutout-1');
});

test('CAD model is loaded before app code and persisted field names remain additive', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const persistence = fs.readFileSync('persistence.js', 'utf8');
  assert.ok(index.indexOf('src="room-boundary.js"') < index.indexOf('src="app.js"'));
  assert.match(persistence, /'siteBoundary', 'roomCutouts'/);
});
