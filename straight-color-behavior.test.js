'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('./layout-graph.js');
const behavior = require('./straight-color-behavior.js');

function connector(id, x, localZMm, heading, role = null) {
  return {
    id,
    x,
    y: 0,
    localZMm,
    heading,
    role,
    pitchDeg: 0,
    bankAngleDeg: 0,
    shape: 'jcjc-3lane',
    laneCount: 3
  };
}

const flatGeometry = Object.freeze({
  width: 54,
  height: 36,
  connectors: Object.freeze([
    Object.freeze(connector('a', -27, 0, 180)),
    Object.freeze(connector('b', 27, 0, 0))
  ])
});

const startGeometry = Object.freeze({
  width: 54,
  height: 36,
  connectors: Object.freeze([
    Object.freeze(connector('a', -27, 0, 180, 'entry')),
    Object.freeze(connector('b', 27, 0, 0, 'exit'))
  ])
});

const slopeGeometry = Object.freeze({
  width: 54,
  height: 36,
  connectors: Object.freeze([
    Object.freeze(connector('a', -27, 0, 180)),
    Object.freeze(connector('b', 27, 115, 0))
  ])
});

const catalog = Object.freeze({
  start: Object.freeze({ w: 54, h: 36, geometry: startGeometry }),
  straight: Object.freeze({ w: 54, h: 36, geometry: flatGeometry }),
  slope: Object.freeze({ w: 54, h: 36, slope: true, geometry: slopeGeometry })
});

function part(id, type, rotation = 0, zMm = 0, extra = {}) {
  return { id, type, x: 0, y: 0, rotation, zMm, colorKey: 'default', entryConnectorId: 'a', ...extra };
}

function edge(partAId, connectorAId, partBId, connectorBId, createdOrder = 1) {
  return { partAId, connectorAId, partBId, connectorBId, createdOrder };
}

function base(start, parts, edges, partId, nextColorKey, mode = behavior.MODE_SLOPE_BY_COLOR) {
  return behavior.applyColorChange({ mode, start, parts, edges, partId, nextColorKey, catalog, graph });
}

test('mode defaults to slope-by-color and color-only is explicit', () => {
  assert.equal(behavior.normalizeMode(undefined), behavior.MODE_SLOPE_BY_COLOR);
  assert.equal(behavior.normalizeMode('bad-value'), behavior.MODE_SLOPE_BY_COLOR);
  assert.equal(behavior.normalizeMode(behavior.MODE_COLOR_ONLY), behavior.MODE_COLOR_ONLY);
});

test('color-only mode keeps a red or blue straight as a straight', () => {
  const start = part('start', 'start');
  const straight = part('s1', 'straight');
  const edges = [edge('start', 'b', 's1', 'a')];

  const red = base(start, [straight], edges, 's1', 'red', behavior.MODE_COLOR_ONLY);
  assert.equal(red.status, 'colored');
  assert.equal(red.parts[0].type, 'straight');
  assert.equal(red.parts[0].colorKey, 'red');

  const blue = base(start, red.parts, red.edges, 's1', 'blue', behavior.MODE_COLOR_ONLY);
  assert.equal(blue.parts[0].type, 'straight');
  assert.equal(blue.parts[0].colorKey, 'blue');
});

test('red straight becomes an uphill slope in Start travel direction and raises downstream by 115mm', () => {
  const start = part('start', 'start');
  const straight = part('s1', 'straight');
  const downstream = part('s2', 'straight');
  const edges = [
    edge('start', 'b', 's1', 'a', 1),
    edge('s1', 'b', 's2', 'a', 2)
  ];

  const result = base(start, [straight, downstream], edges, 's1', 'red');

  assert.equal(result.status, 'changed');
  const slope = result.parts.find(value => value.id === 's1');
  const after = result.parts.find(value => value.id === 's2');
  assert.equal(slope.type, 'slope');
  assert.equal(slope.colorKey, 'red');
  assert.equal(slope.colorSlopeRole, 'up');
  assert.equal(slope.entryConnectorId, 'a', 'Start側が低端aになる');
  assert.equal(slope.rotation, 0);
  assert.equal(slope.zMm, 0);
  assert.equal(after.zMm, 115);
  assert.deepEqual(result.edges, edges);
});

test('red conversion reverses geometry and connector IDs when Start reaches the original straight through b', () => {
  const start = part('start', 'start');
  const straight = part('s1', 'straight', 180, 0, { entryConnectorId: 'b' });
  const downstream = part('s2', 'straight', 180, 0, { entryConnectorId: 'b' });
  const edges = [
    edge('start', 'b', 's1', 'b', 1),
    edge('s1', 'a', 's2', 'b', 2)
  ];

  const result = base(start, [straight, downstream], edges, 's1', 'red');
  assert.equal(result.status, 'changed');
  const slope = result.parts.find(value => value.id === 's1');
  assert.equal(slope.type, 'slope');
  assert.equal(slope.entryConnectorId, 'a');
  assert.equal(slope.rotation, 0, '180度回転して低端aを元のStart側物理端へ合わせる');
  assert.ok(result.edges.some(value => value.partBId === 's1' && value.connectorBId === 'a'));
  assert.ok(result.edges.some(value => value.partAId === 's1' && value.connectorAId === 'b'));
  assert.equal(result.parts.find(value => value.id === 's2').zMm, 115);
});

test('blue straight becomes downhill when it is already on the 115mm level', () => {
  const start = part('start', 'start');
  const up = part('up', 'slope', 0, 0, { entryConnectorId: 'a' });
  const target = part('target', 'straight', 0, 115, { entryConnectorId: 'a' });
  const downstream = part('downstream', 'straight', 0, 115, { entryConnectorId: 'a' });
  const edges = [
    edge('start', 'b', 'up', 'a', 1),
    edge('up', 'b', 'target', 'a', 2),
    edge('target', 'b', 'downstream', 'a', 3)
  ];

  const result = base(start, [up, target, downstream], edges, 'target', 'blue');
  assert.equal(result.status, 'changed');
  const slope = result.parts.find(value => value.id === 'target');
  assert.equal(slope.type, 'slope');
  assert.equal(slope.colorSlopeRole, 'down');
  assert.equal(slope.entryConnectorId, 'b', 'Start側が高端bになる');
  assert.equal(slope.rotation, 180);
  assert.equal(slope.zMm, 0);
  assert.equal(result.parts.find(value => value.id === 'downstream').zMm, 0);
  assert.ok(result.edges.some(value => value.partAId === 'up' && value.partBId === 'target' && value.connectorBId === 'b'));
  assert.ok(result.edges.some(value => value.partAId === 'target' && value.connectorAId === 'a' && value.partBId === 'downstream'));
});

test('blue conversion at ground level is fail-closed instead of creating negative course height', () => {
  const start = part('start', 'start');
  const target = part('target', 'straight');
  const edges = [edge('start', 'b', 'target', 'a')];

  const result = base(start, [target], edges, 'target', 'blue');
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'below-ground');
  assert.equal(result.parts[0].type, 'straight');
  assert.equal(result.parts[0].colorKey, 'default');
});

test('a single uphill conversion in a closed loop keeps Start fixed and reports the unresolved loop-height conflict', () => {
  const start = part('start', 'start');
  const target = part('target', 'straight');
  const downstream = part('downstream', 'straight');
  const edges = [
    edge('start', 'b', 'target', 'a', 1),
    edge('target', 'b', 'downstream', 'a', 2),
    edge('downstream', 'b', 'start', 'a', 3)
  ];

  const result = base(start, [target, downstream], edges, 'target', 'red');
  assert.equal(result.status, 'changed');
  assert.equal(result.parts.find(value => value.id === 'downstream').zMm, 115);
  assert.ok(result.conflicts.length >= 1, 'down slope is still needed before returning to Start height');
});

test('color-derived slope can change from red/up to blue/down and follows the same Start direction', () => {
  const start = part('start', 'start');
  const up = part('upstream-up', 'slope', 0, 0, { entryConnectorId: 'a' });
  const derived = part('target', 'slope', 0, 115, { colorKey: 'red', colorSlopeRole: 'up', entryConnectorId: 'a' });
  const downstream = part('downstream', 'straight', 0, 230);
  const edges = [
    edge('start', 'b', 'upstream-up', 'a', 1),
    edge('upstream-up', 'b', 'target', 'a', 2),
    edge('target', 'b', 'downstream', 'a', 3)
  ];

  const result = base(start, [up, derived, downstream], edges, 'target', 'blue');
  assert.equal(result.status, 'changed');
  const target = result.parts.find(value => value.id === 'target');
  assert.equal(target.type, 'slope');
  assert.equal(target.colorKey, 'blue');
  assert.equal(target.colorSlopeRole, 'down');
  assert.equal(target.entryConnectorId, 'b');
  assert.equal(result.parts.find(value => value.id === 'downstream').zMm, 0);
});

test('in default mode a color-derived slope returns to a straight when cycling beyond red/blue', () => {
  const start = part('start', 'start');
  const up = part('up', 'slope', 0, 0, { colorKey: 'red', colorSlopeRole: 'up', entryConnectorId: 'a' });
  const downstream = part('downstream', 'straight', 0, 115);
  const edges = [
    edge('start', 'b', 'up', 'a', 1),
    edge('up', 'b', 'downstream', 'a', 2)
  ];

  const result = base(start, [up, downstream], edges, 'up', 'orange');
  assert.equal(result.status, 'changed');
  const target = result.parts.find(value => value.id === 'up');
  assert.equal(target.type, 'straight');
  assert.equal(target.colorKey, 'orange');
  assert.equal(target.colorSlopeRole, undefined);
  assert.equal(result.parts.find(value => value.id === 'downstream').zMm, 0);
});

test('color-only recoloring never changes an existing color-derived slope and removes automatic semantic ownership', () => {
  const start = part('start', 'start');
  const derived = part('target', 'slope', 0, 0, { colorKey: 'red', colorSlopeRole: 'up', entryConnectorId: 'a' });
  const edges = [edge('start', 'b', 'target', 'a')];

  const result = base(start, [derived], edges, 'target', 'blue', behavior.MODE_COLOR_ONLY);
  assert.equal(result.status, 'colored');
  assert.equal(result.parts[0].type, 'slope');
  assert.equal(result.parts[0].colorKey, 'blue');
  assert.equal(result.parts[0].colorSlopeRole, undefined);
});

test('semantic conversion is blocked when the target route is not connected to Start', () => {
  const start = part('start', 'start');
  const target = part('target', 'straight');
  const result = base(start, [target], [], 'target', 'red');
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'not-connected-to-start');
  assert.equal(result.parts[0].type, 'straight');
});
