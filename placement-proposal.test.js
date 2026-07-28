'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const PROPOSAL = require('./placement-proposal.js');

function proposal(overrides = {}) {
  return {
    type: 'corner45', x: 120, y: 240, zMm: 115, rotation: 135,
    cornerMirror: true, selectedHandedness: 'left', appliedHandedness: 'left',
    entryConnectorId: 'b', endpoints: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }],
    edge: { partAId: 'straight-1', connectorAId: 'b', partBId: 'pending', connectorBId: 'b' },
    ...overrides
  };
}

test('visible proposal snapshot is immutable and does not share nested data with its source', () => {
  const source = proposal();
  const visible = PROPOSAL.snapshotVisibleProposal(source, 'placement-7');
  source.endpoints[0].x = 999;
  source.edge.partAId = 'mutated';

  assert.equal(visible.placementId, 'placement-7');
  assert.equal(visible.endpoints[0].x, 1);
  assert.equal(visible.edge.partAId, 'straight-1');
  assert.ok(Object.isFrozen(visible));
  assert.ok(Object.isFrozen(visible.endpoints));
  assert.ok(Object.isFrozen(visible.endpoints[0]));
});

test('committing the visible proposal preserves its physical corner pose exactly', () => {
  const visible = PROPOSAL.snapshotVisibleProposal(proposal(), 'placement-8');
  const committed = PROPOSAL.cloneForCommit(visible);

  assert.notEqual(committed, visible);
  assert.notEqual(committed.endpoints, visible.endpoints);
  assert.deepEqual(PROPOSAL.physicalPose(committed), PROPOSAL.physicalPose(visible));
  assert.equal(committed.entryConnectorId, visible.entryConnectorId);
  assert.equal(committed.rotation, visible.rotation);
  assert.equal(committed.cornerMirror, visible.cornerMirror);
});

test('the next ghost can change without mutating an already captured placement', () => {
  const placedSnapshot = PROPOSAL.snapshotVisibleProposal(proposal({ rotation: 90, cornerMirror: true }), 'placement-9');
  const placed = PROPOSAL.cloneForCommit(placedSnapshot);
  const nextGhost = PROPOSAL.snapshotVisibleProposal(proposal({ rotation: 270, cornerMirror: false, appliedHandedness: 'right' }), 'placement-10');

  assert.deepEqual(PROPOSAL.physicalPose(placed), { rotation: 90, cornerMirror: true, handedness: 'left' });
  assert.deepEqual(PROPOSAL.physicalPose(nextGhost), { rotation: 270, cornerMirror: false, handedness: 'right' });
  assert.deepEqual(PROPOSAL.physicalPose(placed), PROPOSAL.physicalPose(placedSnapshot));
});

test('pointer confirmation commits the captured visible proposal exactly once without snap reevaluation', () => {
  const source = fs.readFileSync('./app.js', 'utf8');
  assert.match(source, /pendingPlacementProposal = captureVisiblePlacementProposal\('pointerdown'\)/);
  assert.match(source, /placePartAtCursor\(pendingPlacementProposal, \{ source: 'pointerup', reevaluated: false \}\)/);
  assert.match(source, /function onPointerCancel\(e\)[\s\S]*pendingPlacementProposal = null/);
  const commitStart = source.indexOf('function placePartAtCursor(proposalOverride = null, placementMeta = {})');
  const commitEnd = source.indexOf('function recalculateBankStates', commitStart);
  assert.ok(commitStart >= 0 && commitEnd > commitStart, 'placement commit function is present');
  const commitFunction = source.slice(commitStart, commitEnd);
  assert.doesNotMatch(commitFunction, /getPlacementProposal\(/);
  assert.match(commitFunction, /PLACEMENT_PROPOSAL\.cloneForCommit\(visibleProposal\)/);
});
