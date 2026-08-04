'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WARNINGS = require('./obstacle-course-warnings.js');
const GEOMETRY = require('./obstacle-geometry.js');

const obstacle = { id: 'obstacle-a', x: 0, y: 0, widthCm: 40, depthCm: 40, rotation: 0, visible: true };
const part = { id: 'part-a', x: 0, y: 0, widthCm: 20, depthCm: 20, rotation: 0 };
const polygonForPart = value => GEOMETRY.rectanglePolygon(value);

test('course and visible obstacle overlap produces one warning pair', () => {
  const warnings = WARNINGS.collect([obstacle], [part], GEOMETRY.corners, polygonForPart, GEOMETRY.polygonsIntersect);
  assert.deepEqual(warnings, [{ type: 'obstacle-interference', obstacleId: 'obstacle-a', partIds: ['part-a'] }]);
});

test('hidden obstacles do not contribute warnings', () => {
  const warnings = WARNINGS.collect([{ ...obstacle, visible: false }], [part], GEOMETRY.corners, polygonForPart, GEOMETRY.polygonsIntersect);
  assert.deepEqual(warnings, []);
});

test('multiple overlap pairs retain their count and selected obstacle part ids', () => {
  const parts = [part, { ...part, id: 'part-b', x: 8 }];
  const warnings = WARNINGS.collect([obstacle], parts, GEOMETRY.corners, polygonForPart, GEOMETRY.polygonsIntersect);
  assert.equal(warnings.length, 2);
  assert.deepEqual(WARNINGS.partIdsFor(warnings, 'obstacle-a').sort(), ['part-a', 'part-b']);
});
