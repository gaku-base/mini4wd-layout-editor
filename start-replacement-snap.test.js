'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('./layout-graph.js');
const snap = require('./start-replacement-snap.js');

const connectorGeometry = [
  { id: 'a', role: 'entry', x: -27, y: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
  { id: 'b', role: 'exit', x: 27, y: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
];

const catalog = {
  PARTS: {
    start: { w: 54, h: 37, geometry: { width: 54, connectors: connectorGeometry } },
    straight: { w: 54, h: 37, geometry: { width: 54, connectors: connectorGeometry } }
  }
};

function runtime(overrides = {}) {
  return {
    mode: 'start',
    snapEnabled: true,
    cursor: { x: 151, y: 100 },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    connections: [],
    openConnections: [
      { sourceId: 'p1', partId: 'p1', connectorId: 'b', x: 127, y: 100, zMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
    ],
    ...overrides
  };
}

function layout(overrides = {}) {
  return {
    start: null,
    parts: [{ id: 'p1', type: 'straight', x: 100, y: 100, zMm: 0, rotation: 0, pitchDeg: 0, bankAngleDeg: 0 }],
    connections: [],
    rotation: 0,
    ...overrides
  };
}

test('missing Start snaps either Start connector to a nearby unused flat ground connector', () => {
  const proposal = snap.createStartReplacementSnapProposal(layout(), runtime(), catalog, graph);
  assert.ok(proposal?.snapped);
  assert.equal(proposal.target.partId, 'p1');
  assert.equal(proposal.target.connectorId, 'b');
  assert.equal(proposal.localConnector.id, 'a');
  assert.equal(proposal.pose.x, 154);
  assert.equal(proposal.pose.y, 100);
  assert.equal(proposal.pose.rotation, 0);
  assert.deepEqual(proposal.edge, {
    partAId: 'p1', connectorAId: 'b', partBId: 'start', connectorBId: 'a'
  });
});

test('snap disabled keeps Start on the ordinary free/grid placement path', () => {
  assert.equal(
    snap.createStartReplacementSnapProposal(layout(), runtime({ snapEnabled: false }), catalog, graph),
    null
  );
});

test('initial Start placement with no existing course is not intercepted', () => {
  assert.equal(
    snap.createStartReplacementSnapProposal(layout({ parts: [] }), runtime({ openConnections: [] }), catalog, graph),
    null
  );
});

test('used connectors are ignored so Start does not attach into an existing seam', () => {
  const edge = { partAId: 'p1', connectorAId: 'b', partBId: 'p2', connectorBId: 'a' };
  assert.equal(
    snap.createStartReplacementSnapProposal(
      layout({ connections: [edge] }),
      runtime({ connections: [edge] }),
      catalog,
      graph
    ),
    null
  );
});

test('slope, banked and elevated targets are rejected because Start commits level at ground', () => {
  for (const patch of [{ pitchDeg: 10 }, { bankAngleDeg: 20 }, { zMm: 115 }]) {
    const target = { ...runtime().openConnections[0], ...patch };
    assert.equal(
      snap.createStartReplacementSnapProposal(layout(), runtime({ openConnections: [target] }), catalog, graph),
      null
    );
  }
});

test('adding the Start edge preserves existing course connections', () => {
  const existing = { partAId: 'p0', connectorAId: 'b', partBId: 'p1', connectorBId: 'a', createdOrder: 1 };
  const baseLayout = layout({
    parts: [
      { id: 'p0', type: 'straight', x: 46, y: 100, zMm: 0, rotation: 0 },
      { id: 'p1', type: 'straight', x: 100, y: 100, zMm: 0, rotation: 0 }
    ],
    connections: [existing]
  });
  const proposal = snap.createStartReplacementSnapProposal(
    baseLayout,
    runtime({ connections: [existing] }),
    catalog,
    graph
  );
  assert.ok(proposal);
  const withStart = snap.addStartConnection({ ...baseLayout, start: { id: 'start', type: 'start', ...proposal.pose } }, proposal, graph);
  assert.equal(withStart.connections.length, 2);
  assert.ok(withStart.connections.some(edge => edge.partAId === 'p0' && edge.partBId === 'p1'));
  assert.ok(withStart.connections.some(edge => [edge.partAId, edge.partBId].includes('start')));
});

test('remaining Start connector is the exact opposite endpoint after snap', () => {
  const proposal = snap.createStartReplacementSnapProposal(layout(), runtime(), catalog, graph);
  const start = { id: 'start', type: 'start', ...proposal.pose };
  const open = snap.otherStartEndpoint(start, proposal, catalog, graph);
  assert.equal(open.connectorId, 'b');
  assert.equal(open.x, 181);
  assert.equal(open.y, 100);
  assert.equal(open.directionDeg, 0);
});
