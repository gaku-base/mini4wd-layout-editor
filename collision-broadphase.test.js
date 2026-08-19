'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const broad = require('./collision-broadphase.js');

function profile(id = 'synthetic-v1') {
  const station = (id, ratio, x) => ({
    id, ratio,
    centerlinePositionMm: { x, y: 0, z: 0 },
    tangentHeadingDeg: 0,
    runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
    undersidePolylineYZMm: [[-50, -20], [50, -20]],
    sideWallPolylinesYZMm: { left: [[-50, -20], [-50, 30]], right: [[50, -20], [50, 30]] },
    passableClearance: { effectiveHeightMm: 80, effectiveWidthMm: 90 }
  });
  return {
    id, status: 'provisional', coordinateFrame: 'part-local-xyz', interpolation: 'linear',
    stations: [station('entrance', 0, 0), station('exit', 1, 200)]
  };
}
function placed(partId, positionMm = { x: 0, y: 0, z: 0 }, rotationDeg = 0, value = profile()) {
  return { partId, profileRef: value.id, profile: value, positionMm, rotationDeg };
}
const options = { requiredWallKeys: ['left', 'right'], physicalToleranceMm: 0 };

test('station transform applies tangent frame, 45-degree part rotation, and XYZ translation', () => {
  const station = {
    id: 's0', centerlinePositionMm: { x: 10, y: 20, z: 30 }, tangentHeadingDeg: 90,
    runningSurfacePolylineYZMm: [[10, 5]], undersidePolylineYZMm: [[10, -5]],
    sideWallPolylinesYZMm: { left: [[10, 0]], right: [[-10, 0]] }
  };
  const value = { id: 'p', coordinateFrame: 'part-local-xyz', stations: [station] };
  const result = broad.transformStationGeometry(station, placed('A', { x: 100, y: 200, z: 300 }, 45, value), options);
  assert.equal(result.ready, true);
  const point = result.points[1];
  assert.ok(Math.abs(point.x - (100 - 20 * Math.SQRT1_2)) < 1e-9);
  assert.ok(Math.abs(point.y - (200 + 20 * Math.SQRT1_2)) < 1e-9);
  assert.ok(Math.abs(point.z - 335) < 1e-9);
});

test('world AABB contains known collision points and does not mutate input', () => {
  const value = profile();
  const placement = placed('A', { x: 1000, y: -250, z: 80 }, 45, value);
  const before = structuredClone(placement);
  const result = broad.buildWorldAabb(placement, options);
  assert.equal(result.status, 'ready');
  value.stations.forEach((station, index) => {
    broad.transformStationGeometry(station, placement, options, index).points.forEach(point => {
      assert.ok(point.x >= result.aabb.minX - 1e-9 && point.x <= result.aabb.maxX + 1e-9);
      assert.ok(point.y >= result.aabb.minY - 1e-9 && point.y <= result.aabb.maxY + 1e-9);
      assert.ok(point.z >= result.aabb.minZ - 1e-9 && point.z <= result.aabb.maxZ + 1e-9);
    });
  });
  assert.deepEqual(placement, before);
});

test('bank wall edge objects are accepted', () => {
  const value = profile('bank');
  value.stations.forEach(station => {
    delete station.sideWallPolylinesYZMm;
    station.walls = {
      inner: { lowerEdgeMm: { y: -50, z: -20 }, upperEdgeMm: { y: -50, z: 30 } },
      outer: { lowerEdgeMm: { y: 50, z: -20 }, upperEdgeMm: { y: 50, z: 30 } }
    };
  });
  const result = broad.buildWorldAabb(placed('BANK', undefined, 0, value), { requiredWallKeys: ['inner', 'outer'], physicalToleranceMm: 0 });
  assert.equal(result.status, 'ready');
  assert.ok(result.aabb.minY <= -50 && result.aabb.maxY >= 50);
});

test('XY-separated pair is clear', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 1000, y: 0, z: 0 }), options);
  assert.equal(result.status, 'clear');
  assert.equal(result.reasonCode, 'aabb-separated-x');
});

test('missing physical tolerance is indeterminate', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 1000, y: 0, z: 0 }), { requiredWallKeys: ['left', 'right'] });
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.reasonCode, 'physical-tolerance-unknown');
  assert.ok(result.missing.some(item => item.path === 'physicalToleranceMm'));
});

test('Z-separated pair is clear', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 0, y: 0, z: 500 }), options);
  assert.equal(result.status, 'clear');
  assert.equal(result.reasonCode, 'aabb-separated-z');
});

test('AABB overlap is candidate, not collision', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 100, y: 0, z: 0 }), options);
  assert.equal(result.status, 'candidate');
  assert.ok(result.candidateRangeMm);
  assert.equal(Object.hasOwn(result, 'collision'), false);
});

test('incomplete profile is indeterminate with diagnostic-only known AABB', () => {
  const value = profile('incomplete');
  value.stations[1].undersidePolylineYZMm = null;
  const result = broad.classifyPair(placed('A', undefined, 0, value), placed('B', { x: 100, y: 0, z: 0 }), options);
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.worldAabbA, null);
  assert.ok(result.knownWorldAabbA);
  assert.ok(result.missing.some(item => item.partId === 'A' && item.path.includes('undersidePolylineYZMm')));
});

test('unknown profile status or coordinate frame is indeterminate', () => {
  const unknown = profile('unknown'); unknown.status = 'unknown';
  const wrongFrame = profile('frame'); wrongFrame.coordinateFrame = 'unspecified';
  assert.equal(broad.buildWorldAabb(placed('A', undefined, 0, unknown), options).status, 'indeterminate');
  assert.equal(broad.buildWorldAabb(placed('B', undefined, 0, wrongFrame), options).status, 'indeterminate');
});

test('collision readiness requires effective height and width', () => {
  const value = profile('clearance');
  value.stations[1].passableClearance.effectiveWidthMm = null;
  const result = broad.buildWorldAabb(placed('A', undefined, 0, value), options);
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.missing.some(path => path.includes('stations[exit].effectiveWidthMm')));
});

test('collision readiness validates station IDs, ratios, and order', () => {
  const value = profile('invalid');
  value.stations[0].ratio = 1;
  value.stations[1].ratio = 0;
  value.stations[1].id = 'entrance';
  const result = broad.buildWorldAabb(placed('A', undefined, 0, value), options);
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.missing.some(path => path.includes('duplicate')));
  assert.ok(result.missing.some(path => path.includes('ratio ascending required')));
});

test('unknown or spline interpolation is not authoritative broad phase', () => {
  const value = profile('interpolation'); value.interpolation = 'unknown';
  const result = broad.buildWorldAabb(placed('A', undefined, 0, value), options);
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.missing.some(path => path.includes('interpolation')));
});

test('part rotation stays on 45-degree grid', () => {
  const result = broad.buildWorldAabb(placed('A', undefined, 30), options);
  assert.equal(result.status, 'indeterminate');
  assert.ok(result.missing.some(path => path.includes('45-degree increment required')));
});

test('same part is excluded and pair order is stable', () => {
  const a = placed('A'); const b = placed('B', { x: 100, y: 0, z: 0 }); const c = placed('C', { x: 1000, y: 0, z: 0 });
  assert.equal(broad.classifyPair(a, a, options), null);
  const summarize = list => broad.analyzeBroadPhase(list, options).map(item => `${item.partAId}:${item.partBId}:${item.status}`);
  assert.deepEqual(summarize([a, b, c]), summarize([c, b, a]));
});

test('formal connection with unknown exclusion remains candidate', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 100, y: 0, z: 0 }), {
    ...options,
    connections: [{ partAId: 'A', connectorAId: 'exit', partBId: 'B', connectorBId: 'entrance', normalContactExclusion: { status: 'unknown', broadPhaseCoverage: 'unknown' } }]
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.reasonCode, 'aabb-overlap-normal-contact-not-confirmed');
});

test('another pair normal-contact exclusion cannot be reused', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 100, y: 0, z: 0 }), {
    ...options,
    connections: [{ partAId: 'A', connectorAId: 'exit', partBId: 'C', connectorBId: 'entrance', normalContactExclusion: { status: 'verified', broadPhaseCoverage: 'confirmed' } }]
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.normalContact.formalConnection, false);
});

test('confirmed normal-contact coverage can exclude a formal overlap', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 100, y: 0, z: 0 }), {
    ...options,
    connections: [{ partAId: 'A', connectorAId: 'exit', partBId: 'B', connectorBId: 'entrance', normalContactExclusion: { status: 'verified', broadPhaseCoverage: 'confirmed' } }]
  });
  assert.equal(result.status, 'excluded-normal-contact');
});

test('multiple formal contacts require every edge to have confirmed coverage', () => {
  const result = broad.classifyPair(placed('A'), placed('B', { x: 100, y: 0, z: 0 }), {
    ...options,
    connections: [
      { partAId: 'A', connectorAId: 'a1', partBId: 'B', connectorBId: 'b1', normalContactExclusion: { status: 'verified', broadPhaseCoverage: 'confirmed' } },
      { partAId: 'A', connectorAId: 'a2', partBId: 'B', connectorBId: 'b2', normalContactExclusion: { status: 'unknown', broadPhaseCoverage: 'unknown' } }
    ]
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.normalContact.connections.length, 2);
  assert.equal(result.normalContact.confirmedCoverage, false);
});

test('physical tolerance and numeric epsilon are separate', () => {
  const a = placed('A'); const b = placed('B', { x: 300.5, y: 0, z: 0 });
  assert.equal(broad.classifyPair(a, b, { ...options, physicalToleranceMm: 0, numericEpsilonMm: 1e-7 }).status, 'clear');
  assert.equal(broad.classifyPair(a, b, { ...options, physicalToleranceMm: 0.5, numericEpsilonMm: 1e-7 }).status, 'candidate');
});

test('candidate extraction keeps candidate and indeterminate only', () => {
  const incomplete = profile('incomplete'); incomplete.stations[0].runningSurfacePolylineYZMm = null;
  const results = broad.extractBroadPhaseCandidates([
    placed('A'), placed('B', { x: 100, y: 0, z: 0 }), placed('C', { x: 1000, y: 0, z: 0 }), placed('D', { x: 120, y: 0, z: 0 }, 0, incomplete)
  ], options);
  assert.ok(results.some(item => item.partAId === 'A' && item.partBId === 'B' && item.status === 'candidate'));
  assert.ok(results.some(item => item.partBId === 'D' && item.status === 'indeterminate'));
  assert.equal(results.some(item => item.status === 'clear'), false);
});
