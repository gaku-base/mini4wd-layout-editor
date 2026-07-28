'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const POSE = require('./part-render-pose.js');
const GRAPH = require('./layout-graph.js');

const corner = {
  corner45: true,
  renderKind: 'corner45',
  radius: 54,
  w: 53.711688245,
  h: 49.344155877,
  geometry: {
    centerlineRadius: 54,
    innerRadius: 36,
    outerRadius: 72,
    connectors: [
      { id: 'a', x: -20.883700800371177, y: -3.58228629520206, heading: 180 },
      { id: 'b', x: 17.300065383702393, y: 12.233947520724378, heading: 45 }
    ]
  }
};

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);

function assertTraceEqual(actual, expected, label) {
  assert.deepEqual(actual.pose, expected.pose, `${label} pose`);
  assert.equal(actual.shapeVariant, expected.shapeVariant, `${label} variant`);
  assert.equal(actual.path.length, expected.path.length, `${label} path length`);
  actual.path.forEach((point, index) => {
    close(point.x, expected.path[index].x, `${label} path[${index}].x`);
    close(point.y, expected.path[index].y, `${label} path[${index}].y`);
  });
  assert.equal(actual.connectors.length, expected.connectors.length, `${label} connector count`);
  actual.connectors.forEach((connector, index) => {
    assert.equal(connector.id, expected.connectors[index].id, `${label} connector id`);
    close(connector.x, expected.connectors[index].x, `${label} connector[${index}].x`);
    close(connector.y, expected.connectors[index].y, `${label} connector[${index}].y`);
    close(connector.heading, expected.connectors[index].heading, `${label} connector[${index}].heading`);
  });
}

function part(overrides = {}) {
  return {
    id: 'corner', type: 'corner45', x: 240, y: 180, zMm: 0,
    rotation: 0, cornerMirror: false, handedness: 'right', ...overrides
  };
}

for (const handedness of ['left', 'right']) {
  for (const snapped of [false, true]) {
    test(`${handedness} ${snapped ? 'snapped' : 'free'} ghost path equals the confirmed part path`, () => {
      const ghost = part({ id: 'ghost', handedness, appliedHandedness: handedness, rotation: snapped ? 135 : 45, cornerMirror: handedness === 'left' });
      const placed = { ...ghost, id: 'placed' };
      assertTraceEqual(POSE.tracePart(corner, ghost), POSE.tracePart(corner, placed), `${handedness}-${snapped}`);
    });
  }
}

for (const entryConnectorId of ['a', 'b']) {
  for (const handedness of ['left', 'right']) {
    test(`${handedness} entry ${entryConnectorId.toUpperCase()} connector coordinates and tangents match layout geometry`, () => {
      const value = part({ entryConnectorId, handedness, rotation: entryConnectorId === 'a' ? 90 : 270, cornerMirror: handedness === 'left' });
      const traced = POSE.traceConnectors(corner, value);
      corner.geometry.connectors.forEach((connector, index) => {
        const world = GRAPH.worldConnector(value, connector, index);
        close(traced[index].x, world.x, `${entryConnectorId}-${handedness} x`);
        close(traced[index].y, world.y, `${entryConnectorId}-${handedness} y`);
        close(traced[index].heading, world.directionDeg, `${entryConnectorId}-${handedness} heading`);
      });
    });
  }
}

test('rotation 0/45/90/180/270 and both mirror states produce stable ghost/placed traces', () => {
  for (const rotation of [0, 45, 90, 180, 270]) {
    for (const cornerMirror of [false, true]) {
      const ghost = part({ id: 'ghost', rotation, cornerMirror, handedness: cornerMirror ? 'left' : 'right' });
      assertTraceEqual(POSE.tracePart(corner, ghost), POSE.tracePart(corner, { ...ghost, id: 'placed' }), `${rotation}-${cornerMirror}`);
    }
  }
});

test('height 0/115/230 does not change the 2D physical pose', () => {
  const baseline = POSE.tracePart(corner, part({ zMm: 0, rotation: 180, cornerMirror: true, handedness: 'left' }));
  for (const zMm of [115, 230]) {
    assertTraceEqual(baseline, POSE.tracePart(corner, part({ zMm, rotation: 180, cornerMirror: true, handedness: 'left' })), `height-${zMm}`);
  }
});

test('JSON, history clone, and localStorage-shaped round trips preserve the physical trace', () => {
  const original = part({ rotation: 270, cornerMirror: true, handedness: 'left', entryConnectorId: 'b', zMm: 115 });
  const serialized = JSON.stringify({ parts: [original] });
  const restored = JSON.parse(serialized).parts[0];
  assertTraceEqual(POSE.tracePart(corner, original), POSE.tracePart(corner, restored), 'round-trip');
});

test('handedness never overrides an explicit physical mirror during rendering', () => {
  const leftLabel = part({ handedness: 'left', cornerMirror: false, rotation: 45 });
  const rightLabel = part({ handedness: 'right', cornerMirror: false, rotation: 45 });
  const leftTrace = POSE.tracePart(corner, leftLabel);
  const rightTrace = POSE.tracePart(corner, rightLabel);
  assert.deepEqual(leftTrace.path, rightTrace.path);
  assert.deepEqual(leftTrace.connectors, rightTrace.connectors);
});

test('screen, ghost, selection outline, warnings, and PNG use the shared part pose path', () => {
  const source = fs.readFileSync('./app.js', 'utf8');
  const production = fs.readFileSync('./index.html', 'utf8');
  const qa = fs.readFileSync('./test-index.html', 'utf8');
  assert.match(source, /function drawPart\(c, part, opts = \{\}\)[\s\S]*const pose = resolvePartPose\(part\)/);
  assert.match(source, /const ghostPart = renderPartFromProposal\(proposal\)[\s\S]*drawPart\(c, ghostPart\)/);
  assert.match(source, /drawPartsInLayerOrder\(c, \{ exportMode: true \}\)/);
  assert.match(source, /function corner45Geometry\(def\) \{\s*return PART_RENDER_POSE\.cornerGeometry\(def\)/);
  assert.match(production, /part-render-pose\.js[\s\S]*app\.js/);
  assert.match(qa, /part-render-pose\.js[\s\S]*app\.js/);
});
