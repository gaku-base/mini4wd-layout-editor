'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SNAP_TOGGLE = require('./snap-toggle.js');

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('Startの左端をレイアウトスペース左端へ正確に合わせる', () => {
  const result = SNAP_TOGGLE.snapBoundsToFrame({
    point: { x: 30, y: 250 },
    bounds: { minX: 3, maxX: 57, minY: 232, maxY: 268 },
    frame: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
    scale: 1,
    radiusPx: 24
  });
  approx(result.point.x, 27);
  approx(result.point.y, 250);
  assert.equal(result.snappedX, 'min');
  assert.equal(result.snappedY, null);
});

test('Startの右端をレイアウトスペース右端へ正確に合わせる', () => {
  const result = SNAP_TOGGLE.snapBoundsToFrame({
    point: { x: 470, y: 250 },
    bounds: { minX: 443, maxX: 497, minY: 232, maxY: 268 },
    frame: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
    scale: 1,
    radiusPx: 24
  });
  approx(result.point.x, 473);
  assert.equal(result.snappedX, 'max');
});

test('角付近ではX/Yを独立補正して2辺へ同時に合わせる', () => {
  const result = SNAP_TOGGLE.snapBoundsToFrame({
    point: { x: 30, y: 20 },
    bounds: { minX: 3, maxX: 57, minY: 2, maxY: 38 },
    frame: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
    scale: 1,
    radiusPx: 24
  });
  approx(result.point.x, 27);
  approx(result.point.y, 18);
  assert.equal(result.snappedX, 'min');
  assert.equal(result.snappedY, 'min');
});

test('吸着半径より遠い場合はグリッド位置を変えない', () => {
  const result = SNAP_TOGGLE.snapBoundsToFrame({
    point: { x: 100, y: 100 },
    bounds: { minX: 73, maxX: 127, minY: 82, maxY: 118 },
    frame: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
    scale: 1,
    radiusPx: 24
  });
  assert.deepEqual(result.point, { x: 100, y: 100 });
  assert.equal(result.snappedX, null);
  assert.equal(result.snappedY, null);
});

test('画面スケールに応じて24pxをワールド距離へ換算する', () => {
  const result = SNAP_TOGGLE.snapBoundsToFrame({
    point: { x: 40, y: 100 },
    bounds: { minX: 13, maxX: 67, minY: 82, maxY: 118 },
    frame: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
    scale: 2,
    radiusPx: 24
  });
  assert.equal(result.snappedX, null, '13cm gap = 26pxなので24px半径では吸着しない');
  approx(result.point.x, 40);
});
