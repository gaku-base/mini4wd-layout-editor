'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const POSE = require('./part-render-pose.js');
const GRAPH = require('./layout-graph.js');

function catalog() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync('./part-catalog.js', 'utf8'), context);
  return context.window.M4WD_PART_CATALOG.PARTS;
}

const PARTS = catalog();
const TYPES = ['corner-45-right', 'corner-45-left'];
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);

function part(type, overrides = {}) {
  return { id: 'corner', type, x: 240, y: 180, zMm: 0, rotation: 0, ...overrides };
}

function assertTraceEqual(actual, expected, label) {
  assert.deepEqual(actual.pose, expected.pose, `${label} pose`);
  assert.equal(actual.shapeVariant, expected.shapeVariant, `${label} variant`);
  assert.deepEqual(actual.path, expected.path, `${label} path`);
  assert.deepEqual(actual.connectors, expected.connectors, `${label} connectors`);
}

for (const type of TYPES) {
  for (const snapped of [false, true]) {
    test(`${type} ${snapped ? 'snapped' : 'free'} ghost path equals the confirmed part path`, () => {
      const ghost = part(type, { id: 'ghost', rotation: snapped ? 135 : 45 });
      const placed = { ...ghost, id: 'placed' };
      assertTraceEqual(POSE.tracePart(PARTS[type], ghost), POSE.tracePart(PARTS[type], placed), `${type}-${snapped}`);
    });
  }
}

for (const type of TYPES) {
  for (const entryConnectorId of ['a', 'b']) {
    test(`${type} entry ${entryConnectorId.toUpperCase()} connectors match layout geometry`, () => {
      const value = part(type, { entryConnectorId, rotation: entryConnectorId === 'a' ? 90 : 270 });
      const traced = POSE.traceConnectors(PARTS[type], value);
      PARTS[type].geometry.connectors.forEach((connector, index) => {
        const world = GRAPH.worldConnector(value, connector, index);
        close(traced[index].x, world.x, `${type}-${entryConnectorId} x`);
        close(traced[index].y, world.y, `${type}-${entryConnectorId} y`);
        close(traced[index].heading, world.directionDeg, `${type}-${entryConnectorId} heading`);
      });
    });
  }
}

test('rotation 0/45/90/180/270 and both concrete definitions produce stable ghost/placed traces', () => {
  for (const rotation of [0, 45, 90, 180, 270]) {
    for (const type of TYPES) {
      const ghost = part(type, { id: 'ghost', rotation });
      assertTraceEqual(POSE.tracePart(PARTS[type], ghost), POSE.tracePart(PARTS[type], { ...ghost, id: 'placed' }), `${type}-${rotation}`);
    }
  }
});

test('height 0/115/230 does not change the 2D physical pose', () => {
  for (const type of TYPES) {
    const baseline = POSE.tracePart(PARTS[type], part(type, { zMm: 0, rotation: 180 }));
    for (const zMm of [115, 230]) {
      assertTraceEqual(baseline, POSE.tracePart(PARTS[type], part(type, { zMm, rotation: 180 })), `${type}-height-${zMm}`);
    }
  }
});

test('JSON, history clone, and localStorage-shaped round trips preserve the physical trace', () => {
  for (const type of TYPES) {
    const original = part(type, { rotation: 270, entryConnectorId: 'b', zMm: 115 });
    const restored = JSON.parse(JSON.stringify({ parts: [original] })).parts[0];
    assertTraceEqual(POSE.tracePart(PARTS[type], original), POSE.tracePart(PARTS[restored.type], restored), `${type}-round-trip`);
  }
});

test('the left/right form comes from the catalog definition, not a runtime mirror', () => {
  const left = POSE.tracePart(PARTS['corner-45-left'], part('corner-45-left', { rotation: 45 }));
  const right = POSE.tracePart(PARTS['corner-45-right'], part('corner-45-right', { rotation: 45 }));
  assert.notDeepEqual(left.path, right.path);
  assert.notDeepEqual(left.connectors, right.connectors);
  assert.deepEqual(POSE.resolvePartPose(part('corner-45-left')), { rotation: 0 });
});

test('screen, ghost, selection outline, warnings, and PNG use the shared catalog definition trace', () => {
  const source = fs.readFileSync('./app.js', 'utf8');
  const production = fs.readFileSync('./index.html', 'utf8');
  assert.match(source, /function drawPart\(c, part, opts = \{\}\)[\s\S]*const pose = resolvePartPose\(part\)/);
  assert.match(source, /const ghostPart = renderPartFromProposal\(proposal\)[\s\S]*drawPart\(c, ghostPart\)/);
  assert.match(source, /function partRenderTrace\(part\) \{\s*return PART_RENDER_POSE\.tracePart\(PARTS\[part\.type\], part\)/);
  assert.match(source, /drawPartsInLayerOrder\(c, \{ exportMode: true \}\)/);
  assert.match(production, /part-render-pose\.js[\s\S]*corner-variant\.js[\s\S]*app\.js/);
});
