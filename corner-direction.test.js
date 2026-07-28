'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const DIRECTION = require('./corner-direction.js');
const GRAPH = require('./layout-graph.js');

const appSource = fs.readFileSync('./app.js', 'utf8');
const section = (from, to) => appSource.slice(appSource.indexOf(from), appSource.indexOf(to, appSource.indexOf(from)));
const corner = {
  turnDirections: { right: 'a', left: 'b' },
  defaultTurnDirection: 'right',
  geometry: { connectors: [
    { id: 'a', x: -20.883700800371177, y: -3.58228629520206, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
    { id: 'b', x: 17.300065383702393, y: 12.233947520724378, localZMm: 0, heading: 45, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
  ] }
};
const straight = { geometry: { connectors: [
  { id: 'a', x: -27, y: 0, localZMm: 0, heading: 180, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 },
  { id: 'b', x: 27, y: 0, localZMm: 0, heading: 0, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 }
] } };
const catalog = { corner45: corner, straight };
const target = (heading = 0, zMm = 0) => ({ partId: 'start', connectorId: 'b', x: 0, y: 0, zMm, directionDeg: heading, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 });

function placeCorner(anchor, direction, id) {
  const routeIndex = DIRECTION.routeIndexForDirection(corner, direction);
  const solved = GRAPH.solveSnapPose({ id, type: 'corner45', x: 0, y: 0, zMm: 0, rotation: 0, pitchDeg: 0, bankAngleDeg: 0 }, corner.geometry.connectors[routeIndex], anchor);
  const part = { ...solved, routeIndex };
  const endpoints = GRAPH.allWorldConnectors([part], catalog);
  return { part, routeIndex, exit: endpoints[routeIndex === 0 ? 1 : 0] };
}

function cornerChain(direction, count = 4, anchor = target()) {
  const parts = [];
  let next = anchor;
  for (let index = 0; index < count; index += 1) {
    const placed = placeCorner(next, direction, `corner-${index + 1}`);
    parts.push(placed.part);
    next = placed.exit;
  }
  return { parts, exit: next };
}

test('1. corner declares right and left logical directions', () => assert.deepEqual(DIRECTION.directionsForDefinition(corner), ['right', 'left']));
test('2. standard ghost direction is right', () => assert.equal(DIRECTION.defaultDirection(corner), 'right'));
test('3. right uses connector a', () => assert.equal(DIRECTION.routeIndexForDirection(corner, 'right'), 0));
test('4. left uses connector b', () => assert.equal(DIRECTION.routeIndexForDirection(corner, 'left'), 1));
test('5. route a resolves to right', () => assert.equal(DIRECTION.directionForRouteIndex(corner, 0), 'right'));
test('6. route b resolves to left', () => assert.equal(DIRECTION.directionForRouteIndex(corner, 1), 'left'));
test('7. invalid direction falls back to right', () => assert.equal(DIRECTION.normalizeDirection(corner, 'unknown'), 'right'));
test('8. non-directional definition has no corner direction', () => assert.equal(DIRECTION.defaultDirection(straight), null));
test('9. right at 0 degrees uses tangent-facing rotation', () => assert.equal(DIRECTION.rotationForConnection(corner, 0, 'right'), 0));
test('10. left at 0 degrees uses the distinct route rotation', () => assert.equal(DIRECTION.rotationForConnection(corner, 0, 'left'), 135));
test('11. right stays logical at 45 degrees', () => assert.equal(DIRECTION.rotationForConnection(corner, 45, 'right'), 45));
test('12. left stays logical at 45 degrees', () => assert.equal(DIRECTION.rotationForConnection(corner, 45, 'left'), 180));
test('13. right stays logical at 90 degrees', () => assert.equal(DIRECTION.rotationForConnection(corner, 90, 'right'), 90));
test('14. left stays logical at 180 degrees', () => assert.equal(DIRECTION.rotationForConnection(corner, 180, 'left'), 315));
test('15. right to left change is a 135-degree adjustment', () => assert.equal(DIRECTION.rotationDeltaForDirectionChange(corner, 'right', 'left'), 135));
test('16. left to right change is the reciprocal adjustment', () => assert.equal(DIRECTION.rotationDeltaForDirectionChange(corner, 'left', 'right'), 225));
test('17. three right corners connect consecutively', () => assert.equal(cornerChain('right', 3).parts.length, 3));
test('18. four right corners produce a 180-degree turn', () => assert.equal(cornerChain('right', 4).exit.directionDeg, 180));
test('19. four right corners preserve their route', () => assert.deepEqual(cornerChain('right', 4).parts.map(part => part.routeIndex), [0, 0, 0, 0]));
test('20. three left corners connect consecutively', () => assert.equal(cornerChain('left', 3).parts.length, 3));
test('21. four left corners produce a 180-degree turn', () => assert.equal(cornerChain('left', 4).exit.directionDeg, 180));
test('22. four left corners preserve their route', () => assert.deepEqual(cornerChain('left', 4).parts.map(part => part.routeIndex), [1, 1, 1, 1]));
test('23. right then left keeps left for the following corner', () => {
  const first = placeCorner(target(), 'right', 'right-1');
  const second = placeCorner(first.exit, 'left', 'left-2');
  const third = placeCorner(second.exit, 'left', 'left-3');
  assert.deepEqual([first.routeIndex, second.routeIndex, third.routeIndex], [0, 1, 1]);
});
test('24. left then right keeps right for the following corner', () => {
  const first = placeCorner(target(), 'left', 'left-1');
  const second = placeCorner(first.exit, 'right', 'right-2');
  const third = placeCorner(second.exit, 'right', 'right-3');
  assert.deepEqual([first.routeIndex, second.routeIndex, third.routeIndex], [1, 0, 0]);
});
test('25. 115mm anchors preserve inherited height in both directions', () => {
  assert.equal(placeCorner(target(0, 115), 'right', 'right-high').part.zMm, 115);
  assert.equal(placeCorner(target(0, 115), 'left', 'left-high').part.zMm, 115);
});
test('26. 230mm anchors preserve inherited height in both directions', () => {
  assert.equal(placeCorner(target(0, 230), 'right', 'right-higher').part.zMm, 230);
  assert.equal(placeCorner(target(0, 230), 'left', 'left-higher').part.zMm, 230);
});
test('27. connector filtering retains the requested right route', () => {
  const solved = placeCorner(target(), 'right', 'right-filter').part;
  const candidates = GRAPH.snapCandidates(solved, catalog, [target()], { scale: 1, radiusPx: 1000, localConnectorIndexes: [0] });
  assert.deepEqual(candidates.map(candidate => candidate.localConnectorIndex), [0]);
});
test('28. connector filtering retains the requested left route', () => {
  const solved = placeCorner(target(), 'left', 'left-filter').part;
  const candidates = GRAPH.snapCandidates(solved, catalog, [target()], { scale: 1, radiusPx: 1000, localConnectorIndexes: [1] });
  assert.deepEqual(candidates.map(candidate => candidate.localConnectorIndex), [1]);
});
test('29. confirmed placement is the only remembered-direction write', () => {
  const placementSource = section('function placePartAtCursor', 'function recalculateBankStates');
  assert.match(placementSource, /state\.lastPlacedCornerHandedness = handedness/);
  assert.equal((appSource.match(/state\.lastPlacedCornerHandedness = handedness/g) || []).length, 1);
});
test('30. changing or cancelling a ghost never writes remembered direction', () => {
  const changeSource = section('function setCornerGhostHandedness', 'function toggleCornerGhostHandedness');
  const cancelSource = section('function cancelCornerGhostDirection', 'const WAVE_PATH_SAMPLES');
  assert.doesNotMatch(changeSource, /lastPlacedCornerHandedness\s*=/);
  assert.doesNotMatch(cancelSource, /lastPlacedCornerHandedness\s*=/);
});
test('31. history, JSON, and localStorage serialization exclude the UI session', () => {
  const serialization = section('function serializeState', 'function applySerialized');
  const restore = section('function applySerialized', 'function persistLocal');
  const undoRedo = section('function undo', 'function serializeState');
  assert.doesNotMatch(serialization, /lastPlacedCornerHandedness|cornerGhostHandedness/);
  assert.doesNotMatch(restore, /lastPlacedCornerHandedness|cornerGhostHandedness/);
  assert.doesNotMatch(undoRedo, /lastPlacedCornerHandedness|cornerGhostHandedness/);
});
test('32. ghost direction becomes both its route index and snap connector filter', () => {
  const placement = section('function freePlacement', 'function getPlacementProposal');
  const proposal = section('function getPlacementProposal', 'function isPartInsideField');
  assert.match(placement, /routeIndexForDirection/);
  assert.match(proposal, /localConnectorIndexes: hasCornerDirection/);
});
test('33. control label and aria-pressed stay synchronized', () => {
  assert.match(appSource, /cornerDirectionToggleBtn\.textContent = `コーナー方向:/);
  assert.match(appSource, /cornerDirectionToggleBtn\.setAttribute\('aria-pressed'/);
});
test('34. Alt remains absent from the new corner behavior', () => {
  const relevant = [
    section('function setCornerGhostHandedness', 'function toggleCornerGhostHandedness'),
    section('function freePlacement', 'function getPlacementProposal'),
    section('function placePartAtCursor', 'function recalculateBankStates')
  ].join('\n');
  assert.doesNotMatch(relevant, /altKey|Alt/);
});
test('35. negative heading still normalizes a left connection', () => assert.equal(DIRECTION.rotationForConnection(corner, -45, 'left'), 90));
