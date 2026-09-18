'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const graph = require('./layout-graph.js');
const behavior = require('./straight-color-behavior.js');

function loadCatalog() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('./part-catalog.js', 'utf8'), context, { filename: 'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG.PARTS;
}

const catalog = loadCatalog();

function start() {
  return { id: 'start', type: 'start', x: 0, y: 0, rotation: 0, zMm: 0, colorKey: 'default' };
}

function part(id, type = 'straight', zMm = 0, rotation = 0) {
  return {
    id, type, x: 0, y: 0, rotation, zMm,
    colorKey: 'default', routeIndex: 0, entryConnectorId: 'a',
    pitchDeg: 0, bankAngleDeg: 0, zOrder: 1, zIndex: 1
  };
}

function edge(partAId, connectorAId, partBId, connectorBId, createdOrder = 1) {
  return { partAId, connectorAId, partBId, connectorBId, createdOrder };
}

function apply({ parts, edges, requests, mode = behavior.DEFAULT_MODE }) {
  return behavior.applyColorRequests({
    start: start(),
    parts,
    edges,
    catalog,
    requests,
    mode,
    graphValue: graph
  });
}

test('behavior mode defaults to slope conversion and color-only is explicit', () => {
  assert.equal(behavior.normalizeMode(undefined), behavior.MODE_SLOPE_BY_COLOR);
  assert.equal(behavior.normalizeMode('unexpected'), behavior.MODE_SLOPE_BY_COLOR);
  assert.equal(behavior.normalizeMode(behavior.MODE_COLOR_ONLY), behavior.MODE_COLOR_ONLY);
});

test('travel direction is traced from the Start exit through concrete connector ids', () => {
  const parts = [part('s1'), part('s2')];
  const edges = [
    edge('start', 'b', 's1', 'a', 1),
    edge('s1', 'b', 's2', 'a', 2)
  ];
  assert.deepEqual(
    behavior.resolveTravelEntryConnector({ start: start(), parts, edges, catalog, targetPartId: 's2', graphValue: graph }),
    { status: 'resolved', connectorId: 'a' }
  );

  const reverse = [
    edge('start', 'b', 's1', 'b', 1),
    edge('s1', 'a', 's2', 'b', 2)
  ];
  assert.deepEqual(
    behavior.resolveTravelEntryConnector({ start: start(), parts, edges: reverse, catalog, targetPartId: 's2', graphValue: graph }),
    { status: 'resolved', connectorId: 'b' }
  );
});

test('red converts a Start-direction straight into an uphill slope and raises its downstream component by 115mm', () => {
  const parts = [part('target'), part('downstream')];
  const edges = [
    edge('start', 'b', 'target', 'a', 1),
    edge('target', 'b', 'downstream', 'a', 2)
  ];
  const result = apply({
    parts,
    edges,
    requests: [{ partId: 'target', colorKey: 'red' }]
  });

  assert.equal(result.changed, true);
  assert.equal(result.blocked.length, 0);
  const target = result.parts.find(value => value.id === 'target');
  const downstream = result.parts.find(value => value.id === 'downstream');
  assert.equal(target.type, 'slope');
  assert.equal(target.rotation, 0);
  assert.equal(target.entryConnectorId, 'a', 'Start side is the low end');
  assert.equal(target.zMm, 0);
  assert.equal(target.colorKey, 'default', 'red is a conversion command, not the final slope paint');
  assert.equal(downstream.zMm, 115);
  assert.equal(result.changes[0].direction, 'up');
  assert.deepEqual(result.changes[0].shiftedPartIds, ['downstream']);
});

test('red flips the slope when Start enters the original straight from connector b', () => {
  const parts = [part('target'), part('downstream')];
  const edges = [
    edge('start', 'b', 'target', 'b', 1),
    edge('target', 'a', 'downstream', 'b', 2)
  ];
  const result = apply({
    parts,
    edges,
    requests: [{ partId: 'target', colorKey: 'red' }]
  });
  const target = result.parts.find(value => value.id === 'target');

  assert.equal(target.type, 'slope');
  assert.equal(target.rotation, 180);
  assert.equal(target.entryConnectorId, 'a');
  assert.ok(result.edges.some(value => (
    (value.partAId === 'start' && value.connectorAId === 'b' && value.partBId === 'target' && value.connectorBId === 'a')
    || (value.partBId === 'start' && value.connectorBId === 'b' && value.partAId === 'target' && value.connectorAId === 'a')
  )), 'physical Start-side connection is remapped to the slope low connector');
});

test('blue converts a 115mm straight into a downhill slope and lowers downstream to 0mm', () => {
  const parts = [part('target', 'straight', 115), part('downstream', 'straight', 115)];
  const edges = [
    edge('start', 'b', 'target', 'a', 1),
    edge('target', 'b', 'downstream', 'a', 2)
  ];
  const result = apply({
    parts,
    edges,
    requests: [{ partId: 'target', colorKey: 'blue' }]
  });
  const target = result.parts.find(value => value.id === 'target');
  const downstream = result.parts.find(value => value.id === 'downstream');

  assert.equal(target.type, 'slope');
  assert.equal(target.rotation, 180);
  assert.equal(target.entryConnectorId, 'b', 'Start side is the high end');
  assert.equal(target.zMm, 0, 'slope base is its low-end elevation');
  assert.equal(downstream.zMm, 0);
  assert.equal(result.changes[0].direction, 'down');
  assert.equal(result.changes[0].downstreamDeltaMm, -115);
});

test('blue downhill conversion fails closed when it would go below floor level', () => {
  const inputParts = [part('target', 'straight', 0), part('downstream', 'straight', 0)];
  const result = apply({
    parts: inputParts,
    edges: [
      edge('start', 'b', 'target', 'a', 1),
      edge('target', 'b', 'downstream', 'a', 2)
    ],
    requests: [{ partId: 'target', colorKey: 'blue' }]
  });

  assert.equal(result.changed, false);
  assert.equal(result.parts.find(value => value.id === 'target').type, 'straight');
  assert.equal(result.parts.find(value => value.id === 'downstream').zMm, 0);
  assert.equal(result.blocked[0].reason, 'below-floor');
});

test('color-only mode keeps red and blue straights as colored straights', () => {
  const red = apply({
    parts: [part('target')],
    edges: [edge('start', 'b', 'target', 'a')],
    requests: [{ partId: 'target', colorKey: 'red' }],
    mode: behavior.MODE_COLOR_ONLY
  });
  assert.equal(red.parts[0].type, 'straight');
  assert.equal(red.parts[0].colorKey, 'red');
  assert.equal(red.parts[0].zMm, 0);

  const blue = behavior.applyColorRequests({
    start: red.start,
    parts: red.parts,
    edges: red.edges,
    catalog,
    requests: [{ partId: 'target', colorKey: 'blue' }],
    mode: behavior.MODE_COLOR_ONLY,
    graphValue: graph
  });
  assert.equal(blue.parts[0].type, 'straight');
  assert.equal(blue.parts[0].colorKey, 'blue');
});

test('red or blue on non-straight parts remains an ordinary color change', () => {
  const slope = part('slope', 'slope', 0);
  const result = apply({
    parts: [slope],
    edges: [edge('start', 'b', 'slope', 'a')],
    requests: [{ partId: 'slope', colorKey: 'red' }]
  });
  assert.equal(result.parts[0].type, 'slope');
  assert.equal(result.parts[0].colorKey, 'red');
  assert.equal(result.changes[0].kind, 'color');
});

test('a straight not reachable from the Start exit is not guessed into a slope', () => {
  const result = apply({
    parts: [part('target')],
    edges: [],
    requests: [{ partId: 'target', colorKey: 'red' }]
  });
  assert.equal(result.changed, false);
  assert.equal(result.parts[0].type, 'straight');
  assert.equal(result.blocked[0].reason, 'direction-disconnected');
});

test('conversion is blocked if the downstream component reconnects to Start through another route', () => {
  const parts = [part('target'), part('downstream'), part('return')];
  const edges = [
    edge('start', 'b', 'target', 'a', 1),
    edge('target', 'b', 'downstream', 'a', 2),
    edge('downstream', 'b', 'return', 'a', 3),
    edge('return', 'b', 'start', 'a', 4)
  ];
  const result = apply({
    parts,
    edges,
    requests: [{ partId: 'target', colorKey: 'red' }]
  });
  assert.equal(result.changed, false);
  assert.equal(result.blocked[0].reason, 'downstream-rejoins-start');
});

test('adjacent red requests create two successive uphill levels without mutating input', () => {
  const parts = [part('first'), part('second'), part('third')];
  const edges = [
    edge('start', 'b', 'first', 'a', 1),
    edge('first', 'b', 'second', 'a', 2),
    edge('second', 'b', 'third', 'a', 3)
  ];
  const originalParts = JSON.parse(JSON.stringify(parts));
  const originalEdges = JSON.parse(JSON.stringify(edges));

  const result = apply({
    parts,
    edges,
    requests: [
      { partId: 'first', colorKey: 'red' },
      { partId: 'second', colorKey: 'red' }
    ]
  });

  const first = result.parts.find(value => value.id === 'first');
  const second = result.parts.find(value => value.id === 'second');
  const third = result.parts.find(value => value.id === 'third');
  assert.equal(first.type, 'slope');
  assert.equal(first.zMm, 0);
  assert.equal(second.type, 'slope');
  assert.equal(second.zMm, 115);
  assert.equal(third.zMm, 230);
  assert.equal(result.changes.length, 2);
  assert.deepEqual(parts, originalParts, 'input parts are immutable');
  assert.deepEqual(edges, originalEdges, 'input edges are immutable');
});
