'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LOCK = require('./connector-target-lock-runtime.js');

test('explicit connector lock restricts placement to the selected endpoint and ignores ordinary snap radius', () => {
  const state = { lock: null, commitCountAtLock: null, blockedMessage: '', clearReason: null };
  LOCK.setLock(state, { sourceId: 'wanted', connectorId: 'b', x: 200, y: 100 }, 4);

  let captured = null;
  const originalChoose = (part, catalog, targets, options) => {
    captured = { part, catalog, targets, options };
    return { kind: 'snap', selected: { target: targets[0] } };
  };

  const result = LOCK.lockedChoosePlacement(
    originalChoose,
    state,
    { id: 'ghost', type: 'straight' },
    { straight: {} },
    [
      { partId: 'nearer', connectorId: 'a', x: 10, y: 10 },
      { partId: 'wanted', connectorId: 'b', x: 200, y: 100 }
    ],
    { snapEnabled: false, radiusPx: 24, selectedTargetKey: 'old' }
  );

  assert.equal(result.kind, 'snap');
  assert.equal(captured.targets.length, 1);
  assert.equal(captured.targets[0].partId, 'wanted');
  assert.equal(captured.targets[0].connectorId, 'b');
  assert.equal(captured.options.snapEnabled, true);
  assert.equal(captured.options.radiusPx, Infinity);
  assert.equal(captured.options.selectedTargetKey, null);
});

test('missing locked target falls back to ordinary placement and releases the stale lock', () => {
  const state = { lock: null, commitCountAtLock: null, blockedMessage: '', clearReason: null };
  LOCK.setLock(state, { partId: 'removed', connectorId: 'a' }, 2);
  let ordinaryTargets = null;
  const originalChoose = (_part, _catalog, targets) => {
    ordinaryTargets = targets;
    return { kind: 'free' };
  };

  LOCK.lockedChoosePlacement(originalChoose, state, {}, {}, [{ partId: 'other', connectorId: 'b' }], {});

  assert.equal(state.lock, null);
  assert.equal(state.clearReason, 'target-missing');
  assert.equal(ordinaryTargets.length, 1);
  assert.equal(ordinaryTargets[0].partId, 'other');
});

test('only unused endpoints are offered for direct connector selection', () => {
  const endpoints = [
    { sourceId: 'p1', connectorId: 'a' },
    { sourceId: 'p1', connectorId: 'b' },
    { sourceId: 'p2', connectorId: 'a' }
  ];
  const connections = [{ partAId: 'p1', connectorAId: 'b', partBId: 'p2', connectorBId: 'a' }];
  const open = LOCK.openEndpoints(endpoints, connections);
  assert.deepEqual(open.map(LOCK.endpointIdentity), ['p1\u0000a']);
});

test('layout-space edge is inside, any point beyond it is outside', () => {
  const bounds = { minX: 0, minY: 0, maxX: 500, maxY: 400 };
  assert.equal(LOCK.fieldContainsPoint(bounds, { x: 0, y: 0 }), true);
  assert.equal(LOCK.fieldContainsPoint(bounds, { x: 500, y: 400 }), true);
  assert.equal(LOCK.fieldContainsPoint(bounds, { x: -0.01, y: 10 }), false);
  assert.equal(LOCK.fieldContainsPoint(bounds, { x: 501, y: 10 }), false);
});

test('same connector can be recognized for toggle-to-release behavior', () => {
  const lock = LOCK.normalizeTarget({ sourceId: 'p8', connectorId: 'b', x: 10, y: 20 });
  assert.equal(LOCK.sameTarget(lock, { partId: 'p8', connectorId: 'b' }), true);
  assert.equal(LOCK.sameTarget(lock, { partId: 'p8', connectorId: 'a' }), false);
});
