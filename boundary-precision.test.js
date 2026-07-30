'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const graph = require('./layout-graph.js');

function loadCatalog() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'part-catalog.js'), 'utf8'), context, { filename: 'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG.PARTS;
}

const catalog = loadCatalog();
const fieldPolygon = frame => [
  { x: frame.minX, y: frame.minY }, { x: frame.maxX, y: frame.minY },
  { x: frame.maxX, y: frame.maxY }, { x: frame.minX, y: frame.maxY }
];
const isInside = (part, frame) => {
  const polygon = graph.occupancyPolygon(part, catalog[part.type]);
  const outsideArea = graph.polygonArea(polygon)
    - graph.polygonIntersectionArea(polygon, fieldPolygon(frame), graph.OCCUPANCY_EPSILON_CM);
  return outsideArea <= graph.OCCUPANCY_AREA_EPSILON_CM2;
};

test('a corner stays in range when only its legacy visual AABB would cross the field edge', () => {
  const corner = { id: 'corner', type: 'corner-45-right', x: 0, y: 0, rotation: 0 };
  const preciseBounds = graph.polygonBounds(graph.occupancyPolygon(corner, catalog[corner.type]));
  assert.ok(preciseBounds.minX > -21);
  assert.equal(isInside(corner, { minX: -21, minY: -22, maxX: 31, maxY: 26 }), true);
});

test('boundary contact remains in range but a one-centimetre outside area warns', () => {
  const touching = { id: 'straight', type: 'straight', x: 27, y: 18, rotation: 0 };
  assert.equal(isInside(touching, { minX: 0, minY: 0, maxX: 54, maxY: 36 }), true);
  const outside = { ...touching, x: 28 };
  assert.equal(isInside(outside, { minX: 0, minY: 0, maxX: 54, maxY: 36 }), false);
});

test('app boundary checks reuse the collision occupancy geometry instead of AABB containment', () => {
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(source, /function partOccupancyPolygon\(part\)[\s\S]*LAYOUT_GRAPH\.occupancyPolygon/);
  assert.match(source, /function isPartInsideField\(part\)[\s\S]*polygonIntersectionArea/);
  assert.doesNotMatch(source.slice(source.indexOf('function isPartInsideField'), source.indexOf('function drawOutOfBoundsMarker')), /containsBounds\(state\.field/);
});
