'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const GRAPH = require('./layout-graph.js');
const OBSTACLE_GEOMETRY = require('./obstacle-geometry.js');

const context = { window: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('./part-catalog.js', 'utf8'), context, { filename: 'part-catalog.js' });
const CATALOG = context.window.M4WD_PART_CATALOG;

const START = CATALOG.PARTS.start;

function insideField(start, field) {
  const polygon = GRAPH.occupancyPolygon({ ...start, id: 'start', type: 'start' }, START);
  const frame = [
    { x: 0, y: 0 }, { x: field.widthCm, y: 0 },
    { x: field.widthCm, y: field.heightCm }, { x: 0, y: field.heightCm }
  ];
  const total = GRAPH.polygonArea(polygon);
  const inside = GRAPH.polygonIntersectionArea(polygon, frame, GRAPH.OCCUPANCY_EPSILON_CM);
  return total - inside <= GRAPH.OCCUPANCY_AREA_EPSILON_CM2;
}

function overlapsArea(start, area) {
  return OBSTACLE_GEOMETRY.polygonsIntersect(
    GRAPH.occupancyPolygon({ ...start, id: 'start', type: 'start' }, START),
    OBSTACLE_GEOMETRY.corners(area)
  );
}

test('existing Start occupancy polygon fits when wholly inside and rejects boundary overflow', () => {
  const field = { widthCm: 500, heightCm: 500 };
  assert.equal(insideField({ x: 250, y: 250, rotation: 0 }, field), true);
  assert.equal(insideField({ x: 10, y: 250, rotation: 0 }, field), false);
  assert.equal(insideField({ x: 250, y: 10, rotation: 90 }, field), false);
});

test('Start overlap uses rotated unavailable-area polygons rather than an axis-aligned approximation', () => {
  const area = { id: 'area-1', name: 'エリア1', x: 250, y: 250, widthCm: 80, depthCm: 20, rotation: 27, visible: true, locked: false };
  assert.equal(overlapsArea({ x: 250, y: 250, rotation: 45 }, area), true);
  assert.equal(overlapsArea({ x: 100, y: 100, rotation: 45 }, area), false);
});

test('Start continues to use the catalog definition and 45-degree course rotation contract', () => {
  assert.equal(START.special, 'start');
  assert.equal(START.key, '5');
  for (let rotation = 0; rotation < 360; rotation += 45) {
    const polygon = GRAPH.occupancyPolygon({ id: 'start', type: 'start', x: 250, y: 250, rotation }, START);
    assert.ok(polygon.length >= 4);
  }
});
