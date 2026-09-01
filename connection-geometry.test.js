'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');
const SEAMS = require('./part-seams.js');

function catalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = catalog();
const PARTS = CATALOG.PARTS;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);

function connectorDistanceCm(type) {
  const [entry, exit] = GRAPH.connectorsForDefinition(PARTS[type]);
  return Math.hypot(exit.localX - entry.localX, exit.localY - entry.localY);
}

test('straight connection faces are 540mm apart and 370mm wide', () => {
  assert.equal(CATALOG.STRAIGHT_CONNECTION_LENGTH_MM, 540);
  assert.equal(CATALOG.STRAIGHT_CONNECTION_WIDTH_MM, 370);
  close(connectorDistanceCm('straight'), 54, 'straight connector distance');
  assert.deepEqual(Array.from(GRAPH.connectorsForDefinition(PARTS.straight), connector => connector.connectionWidthMm), [370, 370]);
});

test('wave keeps its connection axis separate from its expanded visual bounds', () => {
  close(connectorDistanceCm('wave'), 54, 'wave connector distance');
  const visualHeight = PARTS.wave.geometry.bounds.maxY - PARTS.wave.geometry.bounds.minY;
  assert.ok(visualHeight > CATALOG.STRAIGHT_CONNECTION_WIDTH_MM / 10, 'visual envelope is not the connection width');
  assert.ok(GRAPH.connectorsForDefinition(PARTS.wave).every(connector => connector.connectionWidthMm === 370));
});

test('lane change connection length is exactly three straights and faces remain 370mm', () => {
  close(connectorDistanceCm('lanechange'), CATALOG.STRAIGHT_CONNECTION_LENGTH_MM * 3 / 10, 'lane-change connector distance');
  assert.ok(GRAPH.connectorsForDefinition(PARTS.lanechange).every(connector => connector.connectionWidthMm === 370));
});

test('slope keeps the 540mm horizontal connection distance and 115mm height delta separately', () => {
  close(connectorDistanceCm('slope'), 54, 'slope horizontal connector distance');
  const [entry, exit] = GRAPH.connectorsForDefinition(PARTS.slope);
  assert.equal(exit.localZMm - entry.localZMm, 115);
  assert.ok([entry, exit].every(connector => connector.connectionWidthMm === 370));
});

test('slope records approved sidewall dimensions without inventing a full collision profile', () => {
  const measurements = PARTS.slope.measurements;
  const floorBlocking = measurements?.floorBlockingSideWallLengthFromLowEndMm;
  const wallHeight = measurements?.sideWallHeightAboveRunningSurfaceMm;
  const wallThickness = measurements?.sideWallThicknessMm;
  assert.equal(floorBlocking?.value, 270);
  assert.equal(wallHeight?.value, 50);
  assert.equal(wallThickness?.value, 2.5);
  for (const measurement of [floorBlocking, wallHeight, wallThickness]) {
    assert.equal(measurement?.status, 'verified');
    assert.equal(measurement?.confidence, 'high');
    assert.deepEqual(Array.from(measurement?.appliesTo || []), ['left', 'right']);
  }
  assert.equal(PARTS.slope.geometry.sideWallProfile, undefined);
});

test('slope keeps R398/R803 drawing radii provisional until their arc endpoints are resolved', () => {
  const measurements = PARTS.slope.measurements;
  assert.equal(measurements?.upperSideWallCurveRadiusMm?.value, 398);
  assert.equal(measurements?.openingUndersideCurveRadiusMm?.value, 803);
  assert.equal(measurements?.upperSideWallCurveRadiusMm?.status, 'provisional');
  assert.equal(measurements?.openingUndersideCurveRadiusMm?.status, 'provisional');
  assert.equal(PARTS.slope.geometry.sideWallProfile, undefined);
});

test('right and left 45-degree corners use 370mm faces and retain a 45-degree travel turn at every snapped rotation', () => {
  for (const type of ['corner-45-right', 'corner-45-left']) {
    const [entry, exit] = GRAPH.connectorsForDefinition(PARTS[type]);
    assert.equal(entry.connectionWidthMm, 370);
    assert.equal(exit.connectionWidthMm, 370);
    const entryTravel = GRAPH.normalizeAngle(entry.directionDeg + 180);
    close(GRAPH.angleDistance(entryTravel, exit.directionDeg), 45, `${type} turn`);
    for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const part = { id: `${type}-${rotation}`, type, x: 20, y: 40, rotation };
      for (const connector of GRAPH.connectorsForDefinition(PARTS[type])) {
        const world = GRAPH.worldConnector(part, connector);
        const face = SEAMS.connectorFace({ ...world, heading: world.directionDeg });
        close((face.start.x + face.end.x) / 2, world.x, `${type}-${rotation}-${connector.id} face x`);
        close((face.start.y + face.end.y) / 2, world.y, `${type}-${rotation}-${connector.id} face y`);
        close(Math.hypot(face.end.x - face.start.x, face.end.y - face.start.y), 37, `${type}-${rotation}-${connector.id} face width`);
      }
    }
  }
});

test('every registered connector defaults to the verified 370mm JCJC outer width', () => {
  for (const definition of Object.values(PARTS)) {
    assert.ok(GRAPH.connectorsForDefinition(definition).every(connector => connector.connectionWidthMm === 370), `${definition.name} connector width`);
  }
});
