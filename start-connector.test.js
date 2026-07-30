'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(filename) {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), context, { filename });
  return context;
}

const catalog = loadBrowserScript('part-catalog.js').window.M4WD_PART_CATALOG;
const graph = loadBrowserScript('layout-graph.js').M4WD_LAYOUT_GRAPH;
const startConnectors = graph.connectorsForDefinition(catalog.PARTS.start);
const entry = startConnectors.find(connector => connector.connectorRole === 'entry');
const exit = startConnectors.find(connector => connector.connectorRole === 'exit');

test('start forward connector is explicit and faces forward at every 45-degree rotation', () => {
  assert.ok(entry);
  assert.ok(exit);
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const point = graph.worldConnector({ id: 'start', type: 'start', x: 100, y: 200, rotation, zMm: 0 }, exit);
    const radians = rotation * Math.PI / 180;
    assert.ok(Math.abs(point.x - (100 + 27 * Math.cos(radians))) < 1e-9, `x at ${rotation}`);
    assert.ok(Math.abs(point.y - (200 + 27 * Math.sin(radians))) < 1e-9, `y at ${rotation}`);
    assert.equal(point.directionDeg, rotation);
  }
});

test('start backward connector remains an independent open connector', () => {
  assert.equal(startConnectors.length, 2);
  assert.notEqual(entry.id, exit.id);
  const endpoints = graph.allWorldConnectors([{ id: 'start', type: 'start', x: 0, y: 0, rotation: 0 }], { start: catalog.PARTS.start });
  assert.deepEqual(endpoints.map(endpoint => endpoint.connectorRole).sort(), ['entry', 'exit']);
});
