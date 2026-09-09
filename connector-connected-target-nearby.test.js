'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LOCK = require('./connector-target-lock-runtime.js');

test('connected endpoints remain distinguishable from ordinary open endpoints', () => {
  const endpoints = [
    { sourceId: 'start', connectorId: 'exit', x: 100, y: 100 },
    { sourceId: 'p1', connectorId: 'a', x: 100, y: 100 },
    { sourceId: 'p1', connectorId: 'b', x: 154, y: 100 }
  ];
  const connections = [{
    partAId: 'start', connectorAId: 'exit',
    partBId: 'p1', connectorBId: 'a'
  }];

  assert.deepEqual(
    LOCK.usedEndpoints(endpoints, connections).map(LOCK.endpointIdentity),
    ['start|exit', 'p1|a']
  );
  assert.deepEqual(
    LOCK.openEndpoints(endpoints, connections).map(LOCK.endpointIdentity),
    ['p1|b']
  );
});

test('connected target reveal only appears very near the connector', () => {
  const radius = LOCK.CONNECTED_REVEAL_RADIUS_PX;
  assert.equal(radius, 20);
  assert.ok(radius < 24, 'yellow connected marker reveal must be stricter than the ordinary 24px snap radius');
  assert.equal(LOCK.pointWithinRadius({ x: 100, y: 100 }, { x: 100 + radius, y: 100 }, radius), true);
  assert.equal(LOCK.pointWithinRadius({ x: 100, y: 100 }, { x: 100 + radius + 0.01, y: 100 }, radius), false);
  assert.equal(LOCK.pointWithinRadius({ x: 100, y: 100 }, null, radius), false);
});

test('an explicitly selected connected endpoint is still a valid lock target', () => {
  const state = { lock: null, commitCountAtLock: null, blockedMessage: '', clearReason: null };
  LOCK.setLock(state, { sourceId: 'start', connectorId: 'exit', x: 100, y: 100 }, 3);

  let captured = null;
  LOCK.lockedChoosePlacement(
    (_part, _catalog, targets, options) => {
      captured = { targets, options };
      return { kind: 'snap', selected: { target: targets[0] } };
    },
    state,
    { id: 'ghost', type: 'straight' },
    { straight: {} },
    [
      { partId: 'start', connectorId: 'exit', x: 100, y: 100 },
      { partId: 'p1', connectorId: 'b', x: 154, y: 100 }
    ],
    { edges: [{ partAId: 'start', connectorAId: 'exit', partBId: 'p1', connectorBId: 'a' }] }
  );

  assert.equal(captured.targets.length, 1);
  assert.equal(LOCK.endpointIdentity(captured.targets[0]), 'start|exit');
  assert.equal(captured.options.snapEnabled, true);
  assert.equal(captured.options.radiusPx, Infinity);
});

test('browser UI wires pointer proximity to a yellow connected-target control', () => {
  const source = fs.readFileSync(path.join(__dirname, 'connector-target-lock-runtime.js'), 'utf8');
  assert.match(source, /wrap\.addEventListener\('pointermove'/);
  assert.match(source, /wrap\.addEventListener\('pointerleave'/);
  assert.match(source, /is-connected-target/);
  assert.match(source, /border-color: #ffd45c/);
  assert.match(source, /接続済み位置から別レイアウトを開始/);
  assert.match(source, /CONNECTED_MARKER_OFFSET_PX/);
});
