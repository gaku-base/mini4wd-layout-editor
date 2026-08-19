'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const broad = require('./collision-broadphase.js');

function profile() {
  const station = (id, ratio, x) => ({
    id,
    ratio,
    centerlinePositionMm: { x, y: 0, z: 0 },
    tangentHeadingDeg: 0,
    runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
    undersidePolylineYZMm: [[-50, -20], [50, -20]],
    sideWallPolylinesYZMm: {
      left: [[-50, -20], [-50, 30]],
      right: [[50, -20], [50, 30]]
    },
    passableClearance: { effectiveHeightMm: 80, effectiveWidthMm: 90 }
  });
  return {
    id: 'identity-normalization-fixture',
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entrance', 0, 0), station('exit', 1, 200)]
  };
}

function placed(partId, x) {
  const value = profile();
  return {
    partId,
    profileRef: value.id,
    profile: value,
    positionMm: { x, y: 0, z: 0 },
    rotationDeg: 0
  };
}

test('whitespace-normalized duplicate part IDs cannot escape indeterminate diagnostics', () => {
  const results = broad.analyzeBroadPhase(
    [placed('A', 0), placed(' A ', 100), placed('C', 1000)],
    { requiredWallKeys: ['left', 'right'], physicalToleranceMm: 0 }
  );

  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.status === 'indeterminate'));
  assert.ok(results.every(result => result.reasonCode === 'part-id-duplicate'));
  assert.ok(results.some(result => result.missing.some(item => item.path === 'partId(duplicate)')));
});
