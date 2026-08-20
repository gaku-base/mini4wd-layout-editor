'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const BROADPHASE = require('./collision-broadphase.js');

// Synthetic provisional collision fixture only. Its arbitrary dimensions are
// engine-test geometry, not measured, verified, or production part dimensions.
function makeSyntheticProvisionalProfile() {
  const station = (id, ratio, x) => ({
    id,
    ratio,
    centerlinePositionMm: { x, y: 0, z: 0 },
    tangentHeadingDeg: 0,
    runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
    undersidePolylineYZMm: [[-50, -10], [50, -10]],
    sideWallPolylinesYZMm: {
      left: [[-50, -10], [-50, 30]],
      right: [[50, -10], [50, 30]],
      '42': [[-40, -10], [-40, 30]]
    },
    passableClearance: { effectiveHeightMm: 100, effectiveWidthMm: 100 }
  });
  return {
    id: 'synthetic-wall-schema-profile',
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entry', 0, 0), station('exit', 1, 100)]
  };
}

function placement(requiredWallKeys) {
  return {
    partId: 'A',
    profile: makeSyntheticProvisionalProfile(),
    requiredWallKeys,
    positionMm: { x: 0, y: 0, z: 0 },
    rotationDeg: 0
  };
}

test('synthetic provisional profile: numeric placement wall key is rejected instead of coerced to a string', () => {
  const result = BROADPHASE.buildWorldAabb(placement([42]));
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.aabb, null);
  assert(result.missing.includes('placement.requiredWallKeys(non-empty wall schema required)'));
});

test('synthetic provisional profile: mixed valid and non-string placement wall keys fail closed', () => {
  const result = BROADPHASE.buildWorldAabb(placement(['left', 42, 'right']));
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.aabb, null);
  assert(result.missing.includes('placement.requiredWallKeys(non-empty wall schema required)'));
});

test('synthetic provisional profile: valid placement wall keys still trim and dedupe', () => {
  const result = BROADPHASE.buildWorldAabb(placement([' left ', 'right', 'left']));
  assert.equal(result.status, 'ready');
  assert(result.aabb);
  assert.deepEqual(result.missing, []);
});
