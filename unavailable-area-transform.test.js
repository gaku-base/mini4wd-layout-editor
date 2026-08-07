'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIntegerRotation, snapValue, axes, cornerPoints, edgeGeometry,
  moveTo, resizeFromCorner, resizeAroundCenter, hitCorner
} = require('./unavailable-area-transform.js');

const area = {
  id: 'area-1', name: '柱', x: 100, y: 100,
  widthCm: 80, depthCm: 40, rotation: 0, visible: true, locked: false
};

test('integer rotations preserve 27 and 359 while 360 normalizes to zero', () => {
  assert.equal(normalizeIntegerRotation(27), 27);
  assert.equal(normalizeIntegerRotation(359), 359);
  assert.equal(normalizeIntegerRotation(360), 0);
  assert.equal(normalizeIntegerRotation(-1), 359);
  assert.equal(normalizeIntegerRotation(2.5), null);
  assert.equal(normalizeIntegerRotation(''), 0);
});

test('grid movement uses the current grid and Shift movement uses one centimetre', () => {
  assert.equal(snapValue(117, 10, false), 120);
  assert.equal(snapValue(117, 25, false), 125);
  assert.equal(snapValue(117.4, 25, true), 117);
  assert.deepEqual(moveTo(area, { x: 137, y: 164 }, { x: 7, y: 4 }, 10, false), { ...area, x: 130, y: 160 });
  assert.deepEqual(moveTo(area, { x: 137.4, y: 164.4 }, { x: 7, y: 4 }, 10, true), { ...area, x: 130, y: 160 });
});

test('locked areas reject movement and resizing', () => {
  assert.equal(moveTo({ ...area, locked: true }, { x: 200, y: 200 }, {}, 10), null);
  assert.equal(resizeFromCorner({ ...area, locked: true }, 'se', { x: 200, y: 200 }, 10), null);
  assert.equal(resizeAroundCenter({ ...area, locked: true }, 'width', 100), null);
});

test('four corner handles expose all rotated rectangle corners', () => {
  const points = cornerPoints(area);
  assert.deepEqual(points.map(point => point.key), ['nw', 'ne', 'se', 'sw']);
  assert.deepEqual(points.map(({ x, y }) => [x, y]), [[60, 80], [140, 80], [140, 120], [60, 120]]);
  assert.equal(hitCorner(area, { x: 141, y: 121 }, 3).key, 'se');
});

test('corner resize fixes the opposite corner and snaps dimensions to grid', () => {
  const resized = resizeFromCorner(area, 'se', { x: 157, y: 137 }, 10, false);
  assert.equal(resized.widthCm, 100);
  assert.equal(resized.depthCm, 60);
  const beforeNorthWest = cornerPoints(area).find(point => point.key === 'nw');
  const afterNorthWest = cornerPoints(resized).find(point => point.key === 'nw');
  assert.ok(Math.abs(beforeNorthWest.x - afterNorthWest.x) < 1e-9);
  assert.ok(Math.abs(beforeNorthWest.y - afterNorthWest.y) < 1e-9);
});

test('rotated rectangle resize keeps the opposite world corner fixed', () => {
  const rotated = { ...area, rotation: 27 };
  const originalOpposite = cornerPoints(rotated).find(point => point.key === 'nw');
  const basis = axes(rotated.rotation);
  const target = {
    x: originalOpposite.x + basis.x.x * 120 + basis.y.x * 70,
    y: originalOpposite.y + basis.x.y * 120 + basis.y.y * 70
  };
  const resized = resizeFromCorner(rotated, 'se', target, 1, true);
  const resizedOpposite = cornerPoints(resized).find(point => point.key === 'nw');
  assert.equal(Math.round(resized.widthCm), 120);
  assert.equal(Math.round(resized.depthCm), 70);
  assert.ok(Math.abs(originalOpposite.x - resizedOpposite.x) < 1e-9);
  assert.ok(Math.abs(originalOpposite.y - resizedOpposite.y) < 1e-9);
});

test('all four edge labels describe width and depth around the rectangle', () => {
  const edges = edgeGeometry({ ...area, rotation: 27 }, 10);
  assert.deepEqual(edges.map(edge => edge.key), ['top', 'right', 'bottom', 'left']);
  assert.deepEqual(edges.map(edge => edge.dimension), ['width', 'depth', 'width', 'depth']);
  assert.equal(edges.length, 4);
});

test('direct dimension editing keeps the centre and rejects invalid input', () => {
  assert.deepEqual(resizeAroundCenter(area, 'width', 125), { ...area, widthCm: 125 });
  assert.deepEqual(resizeAroundCenter(area, 'depth', 75), { ...area, depthCm: 75 });
  assert.equal(resizeAroundCenter(area, 'width', 0), null);
  assert.equal(resizeAroundCenter(area, 'unknown', 10), null);
});
