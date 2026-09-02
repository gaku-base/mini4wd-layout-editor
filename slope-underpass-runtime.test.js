'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const GRAPH = require('./layout-graph.js');
const RUNTIME = require('./slope-underpass-runtime.js');

const flatConnectors = [
  { id: 'a', x: -27, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
  { id: 'b', x: 27, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
];

const catalog = {
  straight: {
    w: 54,
    h: 37,
    geometry: {
      width: 54,
      height: 37,
      bounds: { minX: -27, maxX: 27, minY: -18.5, maxY: 18.5 },
      connectors: flatConnectors
    }
  },
  slope: {
    slope: true,
    w: 54,
    h: 37,
    geometry: {
      width: 54,
      height: 37,
      bounds: { minX: -27, maxX: 27, minY: -18.5, maxY: 18.5 },
      connectors: [
        { ...flatConnectors[0], label: '低端' },
        { ...flatConnectors[1], label: '高端', localZMm: 115 }
      ]
    }
  }
};

const slope = { id: 'slope', type: 'slope', x: 0, y: 0, zMm: 0, rotation: 0 };
const lowerStraight = x => ({ id: 'lower', type: 'straight', x, y: 0, zMm: 0, rotation: 90 });
const boundsForPart = part => GRAPH.polygonBounds(GRAPH.occupancyPolygon(part, catalog[part.type]));

function legacyWarnings(lower) {
  return GRAPH.interferenceWarnings([slope, lower], catalog, boundsForPart, { edges: [] });
}

function wrappedGraph() {
  const root = { M4WD_LAYOUT_GRAPH: GRAPH };
  assert.equal(RUNTIME.install(root), true);
  return root.M4WD_LAYOUT_GRAPH;
}

test('runtime wrapper preserves the legacy warning first, then clears only an approved high-side underpass', () => {
  const lower = lowerStraight(20);
  assert.equal(legacyWarnings(lower).length, 1, 'legacy engine should report the XY/Z overlap before filtering');
  const graph = wrappedGraph();
  const warnings = graph.interferenceWarnings([slope, lower], catalog, boundsForPart, { edges: [] });
  assert.equal(warnings.length, 0, 'approved overlap entirely beyond X=272mm should be cleared');
});

test('runtime wrapper keeps the warning when any overlap enters the X<=272mm blocked zone', () => {
  const lower = lowerStraight(18);
  assert.equal(legacyWarnings(lower).length, 1);
  const graph = wrappedGraph();
  const warnings = graph.interferenceWarnings([slope, lower], catalog, boundsForPart, { edges: [] });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].slopeUnderpass?.status, 'blocked-underpass');
  assert.ok(warnings[0].slopeUnderpass.overlapMinXMm <= 272);
});

test('runtime install is idempotent and does not wrap an already wrapped graph twice', () => {
  const root = { M4WD_LAYOUT_GRAPH: GRAPH };
  assert.equal(RUNTIME.install(root), true);
  const once = root.M4WD_LAYOUT_GRAPH;
  assert.equal(once[RUNTIME.WRAP_MARKER], true);
  assert.equal(RUNTIME.install(root), true);
  assert.equal(root.M4WD_LAYOUT_GRAPH, once);
});

test('runtime preload order is parser-safe and wheel bridge invokes it before app.js boot', () => {
  const preload = fs.readFileSync('./slope-underpass-runtime-preload.js', 'utf8');
  const wheel = fs.readFileSync('./wheel-rotation.js', 'utf8');
  const expectedOrder = [
    'slope-longitudinal-profile.js',
    'slope-underpass-overlap.js',
    'slope-underpass-pair-policy.js',
    'slope-underpass-warning-filter.js',
    'slope-underpass-runtime.js'
  ];
  let previous = -1;
  expectedOrder.forEach(file => {
    const position = preload.indexOf(file);
    assert.ok(position > previous, `${file} must be loaded after its dependency`);
    previous = position;
  });
  assert.match(preload, /documentRef\.readyState !== 'loading'/);
  assert.match(preload, /documentRef\.write/);
  assert.match(wheel, /slope-underpass-runtime-preload\.js/);
  assert.ok(wheel.indexOf('slope-underpass-runtime-preload.js') < wheel.indexOf("const bootstrapSrc = 'editor-extensions-bootstrap.js"));
});
