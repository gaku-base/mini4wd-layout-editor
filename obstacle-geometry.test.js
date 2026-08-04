'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const GEOMETRY = require('./obstacle-geometry.js');

const obstacle = changes => ({ id: 'o1', name: '柱', x: 100, y: 100, widthCm: 40, depthCm: 20, rotation: 0, visible: true, locked: false, ...changes });
const boundary = { left: 0, top: 0, right: 300, bottom: 300 };

test('obstacle 0-degree corners retain exact width and depth', () => {
  assert.deepEqual(GEOMETRY.corners(obstacle()), [{ x: 80, y: 90 }, { x: 120, y: 90 }, { x: 120, y: 110 }, { x: 80, y: 110 }]);
});

test('obstacle 45-degree and 90-degree corners rotate around its centre', () => {
  assert.equal(GEOMETRY.corners(obstacle({ rotation: 45 })).length, 4);
  assert.deepEqual(GEOMETRY.corners(obstacle({ rotation: 90 })), [{ x: 110, y: 80 }, { x: 110, y: 120 }, { x: 90, y: 120 }, { x: 90, y: 80 }]);
});

test('rotated rectangle hit test does not use only its exterior AABB', () => {
  const polygon = GEOMETRY.corners(obstacle({ rotation: 45 }));
  assert.equal(GEOMETRY.pointInPolygon({ x: 100, y: 100 }, polygon), true);
  assert.equal(GEOMETRY.pointInPolygon({ x: 120, y: 120 }, polygon), false);
});

test('placement requires every rotated corner to remain in the usable space', () => {
  assert.equal(GEOMETRY.placementValidity(obstacle(), boundary).valid, true);
  assert.equal(GEOMETRY.placementValidity(obstacle({ x: 10 }), boundary).reason, 'outside-space');
});

test('placement rejects a rotated obstacle overlapping a room cutout', () => {
  assert.equal(GEOMETRY.placementValidity(obstacle(), boundary, [{ left: 90, top: 90, right: 110, bottom: 110 }]).reason, 'room-cutout');
});

test('polygon collision detects course geometry overlap', () => {
  assert.equal(GEOMETRY.polygonsIntersect(GEOMETRY.corners(obstacle()), [{ x: 110, y: 95 }, { x: 140, y: 95 }, { x: 140, y: 105 }, { x: 110, y: 105 }]), true);
  assert.equal(GEOMETRY.polygonsIntersect(GEOMETRY.corners(obstacle()), [{ x: 150, y: 150 }, { x: 170, y: 150 }, { x: 170, y: 170 }, { x: 150, y: 170 }]), false);
});
