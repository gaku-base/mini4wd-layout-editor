'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const GRAPH = require('./layout-graph.js');
const POSE = require('./part-render-pose.js');
const VARIANT = require('./corner-variant.js');

function catalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG.PARTS;
}

const PARTS = catalog();
const TYPES = [VARIANT.RIGHT, VARIANT.LEFT];
const target = (connector, id = 'target', zMm = 0) => ({
  partId: id,
  connectorId: 'b',
  x: connector.x,
  y: connector.y,
  zMm,
  directionDeg: GRAPH.normalizeAngle(connector.directionDeg + 180),
  pitchDeg: 0,
  bankAngleDeg: 0,
  shape: 'jcjc-3lane',
  laneCount: 3
});

function part(type, overrides = {}) {
  return {
    id: 'ghost', type, x: 200, y: 180, zMm: 0, rotation: 0,
    pitchDeg: 0, bankAngleDeg: 0, ...overrides
  };
}

function atEntry(type, entryIndex, rotation = 0, zMm = 0) {
  const ghost = part(type, { rotation, zMm });
  const connector = GRAPH.worldConnector(ghost, PARTS[type].geometry.connectors[entryIndex], entryIndex);
  return { ghost, endpoint: target(connector, `${type}-${entryIndex}-${rotation}-${zMm}`, zMm) };
}

test('corner variants are concrete part types with independent catalog definitions', () => {
  assert.deepEqual(TYPES, ['corner-45-right', 'corner-45-left']);
  assert.notEqual(PARTS[VARIANT.RIGHT], PARTS[VARIANT.LEFT]);
  assert.equal(PARTS[VARIANT.RIGHT].geometry.pathOrientation, 'right');
  assert.equal(PARTS[VARIANT.LEFT].geometry.pathOrientation, 'left');
  assert.deepEqual(Array.from(PARTS[VARIANT.RIGHT].geometry.connectors, item => item.id), ['a', 'b']);
  assert.deepEqual(Array.from(PARTS[VARIANT.LEFT].geometry.connectors, item => item.id), ['a', 'b']);
});

test('left and right definitions express distinct physical paths without runtime mirroring', () => {
  const right = POSE.tracePart(PARTS[VARIANT.RIGHT], part(VARIANT.RIGHT));
  const left = POSE.tracePart(PARTS[VARIANT.LEFT], part(VARIANT.LEFT));
  assert.notDeepEqual(right.path, left.path);
  assert.notDeepEqual(right.connectors, left.connectors);
  assert.deepEqual(POSE.resolvePartPose(part(VARIANT.LEFT)), { rotation: 0 });
});

for (const type of TYPES) {
  for (const entryIndex of [0, 1]) {
    test(`${type} snaps through connector ${entryIndex === 0 ? 'A' : 'B'} and preserves its type`, () => {
      const { ghost, endpoint } = atEntry(type, entryIndex);
      const choice = GRAPH.choosePlacement(ghost, PARTS, [endpoint], { scale: 1, radiusPx: 24 });
      assert.equal(choice.kind, 'snap');
      assert.equal(choice.selected.entryConnectorId, entryIndex === 0 ? 'a' : 'b');
      assert.equal(choice.part.type, type);
      assert.equal(choice.selected.pose.type, type);
    });
  }
}

test('A/B is selected by nearest ghost endpoint, not by the corner type', () => {
  for (const type of TYPES) {
    const a = atEntry(type, 0);
    const b = atEntry(type, 1);
    assert.equal(GRAPH.choosePlacement(a.ghost, PARTS, [a.endpoint], { scale: 1, radiusPx: 24 }).selected.entryConnectorId, 'a');
    assert.equal(GRAPH.choosePlacement(b.ghost, PARTS, [b.endpoint], { scale: 1, radiusPx: 24 }).selected.entryConnectorId, 'b');
  }
});

test('connector B remains a candidate even when the free ghost rotation is not target-facing', () => {
  const type = VARIANT.LEFT;
  const existing = part(type, { id: 'existing', x: 350, y: 200, rotation: 0 });
  const existingB = GRAPH.worldConnector(existing, PARTS[type].geometry.connectors[1], 1);
  const targetB = {
    ...existingB,
    partId: 'existing', connectorId: 'b', shape: 'jcjc-3lane', laneCount: 3
  };
  const freeGhost = part(type, { x: 370, y: 190, rotation: 135 });
  const choice = GRAPH.choosePlacement(freeGhost, PARTS, [targetB], { scale: 0.935, radiusPx: 24 });
  assert.equal(choice.kind, 'snap');
  const bCandidate = choice.rawCandidates.find(candidate => candidate.entryConnectorId === 'b');
  assert.ok(bCandidate);
  assert.equal(bCandidate.pose.type, VARIANT.LEFT);
  assert.notEqual(bCandidate.pose.rotation, freeGhost.rotation);
});

test('both physical corner types recalculate entry A/B at 0/45/90/180 degrees and 0/115/230mm', () => {
  for (const type of TYPES) {
    for (const rotation of [0, 45, 90, 180]) {
      for (const zMm of [0, 115, 230]) {
        for (const entryIndex of [0, 1]) {
          const { ghost, endpoint } = atEntry(type, entryIndex, rotation, zMm);
          const choice = GRAPH.choosePlacement(ghost, PARTS, [endpoint], { scale: 1, radiusPx: 24 });
          assert.equal(choice.kind, 'snap', `${type}/${entryIndex}/${rotation}/${zMm}`);
          assert.equal(choice.selected.entryConnectorId, entryIndex === 0 ? 'a' : 'b');
          assert.equal(choice.part.type, type);
          assert.equal(choice.part.zMm, zMm);
        }
      }
    }
  }
});

test('the same entry connector has a pose computed from the target tangent', () => {
  const definition = PARTS[VARIANT.LEFT];
  const local = definition.geometry.connectors[0];
  const first = GRAPH.solveSnapPose(part(VARIANT.LEFT), local, { ...target({ x: 0, y: 0, directionDeg: 0 }), directionDeg: 0 });
  const second = GRAPH.solveSnapPose(part(VARIANT.LEFT), local, { ...target({ x: 0, y: 0, directionDeg: 90 }), directionDeg: 90 });
  assert.notEqual(first.rotation, second.rotation);
  assert.equal(first.type, VARIANT.LEFT);
  assert.equal(second.type, VARIANT.LEFT);
});

test('outside the 24px radius remains free without changing the selected corner type', () => {
  const ghost = part(VARIANT.LEFT, { x: 500, y: 500 });
  const choice = GRAPH.choosePlacement(ghost, PARTS, [target({ x: 0, y: 0, directionDeg: 0 })], { scale: 1, radiusPx: 24 });
  assert.equal(choice.kind, 'free');
  assert.equal(choice.part.type, VARIANT.LEFT);
});

test('legacy JSON migrates only the semantic handedness into a concrete type', () => {
  assert.equal(VARIANT.migrateLegacyType({ type: 'corner45', handedness: 'left', cornerMirror: false, entryConnectorId: 'a', rotation: 0 }), VARIANT.LEFT);
  assert.equal(VARIANT.migrateLegacyType({ type: 'corner-45', handedness: 'right', cornerMirror: true, entryConnectorId: 'b', rotation: 180 }), VARIANT.RIGHT);
  assert.equal(VARIANT.migrateLegacyType({ type: 'corner45', cornerMirror: true, entryConnectorId: 'b', rotation: 90 }), VARIANT.RIGHT);
});

test('ghost and placed parts use the same concrete definition and have identical paths/connectors', () => {
  for (const type of TYPES) {
    const ghost = part(type, { id: 'ghost', rotation: 135, zMm: 115 });
    const placed = { ...ghost, id: 'placed' };
    const ghostTrace = POSE.tracePart(PARTS[ghost.type], ghost);
    const placedTrace = POSE.tracePart(PARTS[placed.type], placed);
    assert.equal(ghost.type, placed.type);
    assert.equal(PARTS[ghost.type], PARTS[placed.type]);
    assert.deepEqual(ghostTrace, placedTrace);
  }
});

test('runtime code does not infer the concrete corner type from entry connector, mirror, or rotation', () => {
  const app = fs.readFileSync('./app.js', 'utf8');
  const pose = fs.readFileSync('./part-render-pose.js', 'utf8');
  assert.match(app, /const \{ cornerMirror, handedness, cornerHandedness, selectedHandedness, appliedHandedness, \.\.\.persistentPart \}/);
  assert.doesNotMatch(app, /cornerMirror\) c\.scale|handednessForEntry|cornerGhostHandedness|lastPlacedCornerHandedness/);
  assert.doesNotMatch(pose, /cornerMirror|handedness/);
});
