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
const boundsForPart = part => graph.polygonBounds(graph.occupancyPolygon(part, catalog[part.type]));
const warningFor = parts => graph.interferenceWarnings(parts, catalog, boundsForPart);
const part = (id, type, x, y, rotation = 0, zMm = 0) => ({ id, type, x, y, rotation, zMm });

test('corner occupancy is an annular 45-degree polygon rather than its AABB', () => {
  const corner = part('corner', 'corner-45-right', 0, 0);
  const probeDefinition = { w: 8, h: 8, geometry: { width: 8, height: 8, connectors: [] } };
  const probe = { id: 'probe', type: 'probe', x: 24, y: -14, rotation: 0, zMm: 0 };
  const cornerPolygon = graph.occupancyPolygon(corner, catalog[corner.type]);
  const probePolygon = graph.occupancyPolygon(probe, probeDefinition);
  assert.equal(graph.boundsOverlap(graph.polygonBounds(cornerPolygon), graph.polygonBounds(probePolygon), graph.OCCUPANCY_EPSILON_CM), true);
  assert.equal(graph.polygonIntersectionArea(cornerPolygon, probePolygon), 0);
});

test('AABB-only corner false positives do not produce an interference warning', () => {
  const extendedCatalog = { ...catalog, probe: { w: 8, h: 8, geometry: { width: 8, height: 8, connectors: [] } } };
  const parts = [part('corner', 'corner-45-right', 0, 0), part('probe', 'probe', 24, -14)];
  const bounds = value => graph.polygonBounds(graph.occupancyPolygon(value, extendedCatalog[value.type]));
  assert.equal(graph.interferenceWarnings(parts, extendedCatalog, bounds).length, 0);
});

test('clear same-height surface overlap still reports interference', () => {
  const warnings = warningFor([
    part('first', 'corner-45-right', 0, 0),
    part('second', 'corner-45-right', 0, 0)
  ]);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].overlapAreaCm2 > graph.OCCUPANCY_AREA_EPSILON_CM2);
});

test('boundary-only contact is not interference', () => {
  const warnings = warningFor([
    part('first', 'straight', 0, 0),
    part('second', 'straight', 54, 0)
  ]);
  assert.equal(warnings.length, 0);
});

test('vertically separated overlapping parts remain valid', () => {
  const warnings = warningFor([
    part('lower', 'corner-45-left', 0, 0, 0, 0),
    part('upper', 'corner-45-left', 0, 0, 0, 230)
  ]);
  assert.equal(warnings.length, 0);
});
