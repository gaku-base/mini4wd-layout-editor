'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const broad = require('./collision-broadphase.js');

function profile(id = 'identity-normalization-fixture') {
  const station = (stationId, ratio, x) => ({
    id: stationId,
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
    id,
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entrance', 0, 0), station('exit', 1, 200)]
  };
}

function placed(partId, x, value = profile()) {
  return {
    partId,
    profileRef: value.id,
    profile: value,
    positionMm: { x, y: 0, z: 0 },
    rotationDeg: 0
  };
}

const options = { requiredWallKeys: ['left', 'right'], physicalToleranceMm: 0 };

test('whitespace-normalized duplicate part IDs cannot escape indeterminate diagnostics', () => {
  const results = broad.analyzeBroadPhase(
    [placed('A', 0), placed(' A ', 100), placed('C', 1000)],
    options
  );

  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.status === 'indeterminate'));
  assert.ok(results.every(result => result.reasonCode === 'part-id-duplicate'));
  assert.ok(results.some(result => result.missing.some(item => item.path === 'partId(duplicate)')));
});

test('authoritative AABB cannot disable required running-surface geometry', () => {
  const value = profile('missing-running-surface');
  value.stations[0].runningSurfacePolylineYZMm = null;
  const result = broad.buildWorldAabb(
    placed('A', 0, value),
    { ...options, requireRunningSurface: false }
  );

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.aabb, null);
  assert.ok(result.missing.some(path => path.includes('runningSurfacePolylineYZMm')));
});

test('authoritative AABB cannot disable required underside geometry', () => {
  const value = profile('missing-underside');
  value.stations[0].undersidePolylineYZMm = null;
  const result = broad.buildWorldAabb(
    placed('A', 0, value),
    { ...options, requireUnderside: false }
  );

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.aabb, null);
  assert.ok(result.missing.some(path => path.includes('undersidePolylineYZMm')));
});

test('required body and side-wall polylines need at least two valid points', () => {
  const mutations = [
    value => { value.stations[0].runningSurfacePolylineYZMm = [[0, 0]]; },
    value => { value.stations[0].undersidePolylineYZMm = [[0, -20]]; },
    value => { value.stations[0].sideWallPolylinesYZMm.left = [[-50, 0]]; }
  ];

  mutations.forEach((mutate, index) => {
    const value = profile(`one-point-${index}`);
    mutate(value);
    const result = broad.buildWorldAabb(placed('A', 0, value), options);
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.aabb, null);
    assert.ok(result.missing.some(path => path.includes('at least 2 valid points required')));
  });
});

test('bank alternative wall polyline needs at least two valid points', () => {
  const value = profile('one-point-bank-wall');
  value.stations.forEach(station => {
    delete station.sideWallPolylinesYZMm;
    station.walls = {
      inner: { polylineYZMm: [{ y: -50, z: 0 }] },
      outer: {
        lowerEdgeMm: { y: 50, z: -20 },
        upperEdgeMm: { y: 50, z: 30 }
      }
    };
  });

  const result = broad.buildWorldAabb(
    placed('BANK', 0, value),
    { requiredWallKeys: ['inner', 'outer'], physicalToleranceMm: 0 }
  );

  assert.equal(result.status, 'indeterminate');
  assert.equal(result.aabb, null);
  assert.ok(result.missing.some(path => path.includes('walls.inner')));
});
