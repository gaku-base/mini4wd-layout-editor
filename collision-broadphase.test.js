'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const broad = require('./collision-broadphase.js');

function syntheticProfile(id = 'synthetic-v1') {
  return {
    id,
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    stations: [
      {
        id: 'entrance',
        centerlinePositionMm: { x: 0, y: 0, z: 0 },
        tangentHeadingDeg: 0,
        runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
        undersidePolylineYZMm: [[-50, -20], [50, -20]],
        sideWallPolylinesYZMm: {
          left: [[-50, -20], [-50, 30]],
          right: [[50, -20], [50, 30]]
        }
      },
      {
        id: 'exit',
        centerlinePositionMm: { x: 200, y: 0, z: 0 },
        tangentHeadingDeg: 0,
        runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
        undersidePolylineYZMm: [[-50, -20], [50, -20]],
        sideWallPolylinesYZMm: {
          left: [[-50, -20], [-50, 30]],
          right: [[50, -20], [50, 30]]
        }
      }
    ]
  };
}

function placed(partId, positionMm = { x: 0, y: 0, z: 0 }, rotationDeg = 0, profile = syntheticProfile()) {
  return { partId, profileRef: profile.id, profile, positionMm, rotationDeg };
}

const wallOptions = { requiredWallKeys: ['left', 'right'] };

test('station geometry applies tangent frame, 45-degree part rotation, and XYZ translation', () => {
  const station = {
    id: 's0',
    centerlinePositionMm: { x: 10, y: 20, z: 30 },
    tangentHeadingDeg: 90,
    runningSurfacePolylineYZMm: [[10, 5]],
    undersidePolylineYZMm: [[10, -5]],
    sideWallPolylinesYZMm: { left: [[10, 0]], right: [[-10, 0]] }
  };
  const placement = placed('A', { x: 100, y: 200, z: 300 }, 45, { id: 'p', coordinateFrame: 'part-local-xyz', stations: [station] });
  const result = broad.transformStationGeometry(station, placement, wallOptions);
  assert.equal(result.ready, true);

  // tangent=90 turns lateral +10mm to local -X. center becomes (0,20,35),
  // then the part rotates 45 degrees and translates by (100,200,300).
  const expected = {
    x: 100 + (0 * Math.SQRT1_2 - 20 * Math.SQRT1_2),
    y: 200 + (0 * Math.SQRT1_2 + 20 * Math.SQRT1_2),
    z: 335
  };
  const runningPoint = result.points[1];
  assert.ok(Math.abs(runningPoint.x - expected.x) < 1e-9);
  assert.ok(Math.abs(runningPoint.y - expected.y) < 1e-9);
  assert.ok(Math.abs(runningPoint.z - expected.z) < 1e-9);
});

test('world AABB contains every known collision point and does not mutate source objects', () => {
  const profile = syntheticProfile();
  const placement = placed('A', { x: 1000, y: -250, z: 80 }, 45, profile);
  const before = JSON.parse(JSON.stringify(placement));
  const result = broad.buildWorldAabb(placement, wallOptions);
  assert.equal(result.status, 'ready');
  assert.ok(result.aabb.minX <= result.aabb.maxX);
  assert.ok(result.aabb.minY <= result.aabb.maxY);
  assert.ok(result.aabb.minZ <= result.aabb.maxZ);
  profile.stations.forEach((station, stationIndex) => {
    const transformed = broad.transformStationGeometry(station, placement, wallOptions, stationIndex);
    transformed.points.forEach(point => {
      assert.ok(point.x >= result.aabb.minX - 1e-9 && point.x <= result.aabb.maxX + 1e-9);
      assert.ok(point.y >= result.aabb.minY - 1e-9 && point.y <= result.aabb.maxY + 1e-9);
      assert.ok(point.z >= result.aabb.minZ - 1e-9 && point.z <= result.aabb.maxZ + 1e-9);
    });
  });
  assert.deepEqual(placement, before);
});

test('bank-style wall edge objects are accepted as collision geometry', () => {
  const profile = syntheticProfile('bank-style');
  delete profile.stations[0].sideWallPolylinesYZMm;
  delete profile.stations[1].sideWallPolylinesYZMm;
  profile.stations.forEach(station => {
    station.walls = {
      inner: { lowerEdgeMm: { y: -50, z: -20 }, upperEdgeMm: { y: -50, z: 30 } },
      outer: { lowerEdgeMm: { y: 50, z: -20 }, upperEdgeMm: { y: 50, z: 30 } }
    };
  });
  const result = broad.buildWorldAabb(placed('BANK', { x: 0, y: 0, z: 0 }, 0, profile), { requiredWallKeys: ['inner', 'outer'] });
  assert.equal(result.status, 'ready');
  assert.equal(result.aabb.minY, -50);
  assert.equal(result.aabb.maxY, 50);
});

test('parts separated in XY are clear', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 1000, y: 0, z: 0 }),
    wallOptions
  );
  assert.equal(result.status, 'clear');
  assert.equal(result.reasonCode, 'aabb-separated-x');
});

test('parts separated in Z are clear even when XY overlaps', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 0, y: 0, z: 500 }),
    wallOptions
  );
  assert.equal(result.status, 'clear');
  assert.equal(result.reasonCode, 'aabb-separated-z');
});

test('AABB overlap is a candidate, never an asserted collision', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 100, y: 0, z: 0 }),
    wallOptions
  );
  assert.equal(result.status, 'candidate');
  assert.equal(result.reasonCode, 'aabb-overlap');
  assert.ok(result.candidateRangeMm);
  assert.equal(Object.hasOwn(result, 'collision'), false);
});

test('incomplete profile is indeterminate and reports missing fields without fabricating AABB', () => {
  const incomplete = syntheticProfile('incomplete');
  incomplete.stations[1].undersidePolylineYZMm = null;
  const result = broad.classifyPair(
    placed('A', { x: 0, y: 0, z: 0 }, 0, incomplete),
    placed('B', { x: 100, y: 0, z: 0 }),
    wallOptions
  );
  assert.equal(result.status, 'indeterminate');
  assert.equal(result.worldAabbA, null);
  assert.ok(result.knownWorldAabbA);
  assert.ok(result.missing.some(item => item.partId === 'A' && item.path.includes('undersidePolylineYZMm')));
});

test('unknown profile status or coordinate frame is indeterminate instead of assumed ready', () => {
  const unknownStatus = syntheticProfile('unknown-status');
  unknownStatus.status = 'unknown';
  const wrongFrame = syntheticProfile('wrong-frame');
  wrongFrame.coordinateFrame = 'unspecified';

  const statusResult = broad.buildWorldAabb(placed('A', { x: 0, y: 0, z: 0 }, 0, unknownStatus), wallOptions);
  const frameResult = broad.buildWorldAabb(placed('B', { x: 0, y: 0, z: 0 }, 0, wrongFrame), wallOptions);
  assert.equal(statusResult.status, 'indeterminate');
  assert.ok(statusResult.missing.some(path => path.includes('profile.status')));
  assert.equal(frameResult.status, 'indeterminate');
  assert.ok(frameResult.missing.some(path => path.includes('coordinateFrame')));
});

test('same part is excluded and unique part pair order is stable regardless of input order', () => {
  const a = placed('A');
  const b = placed('B', { x: 100, y: 0, z: 0 });
  const c = placed('C', { x: 1000, y: 0, z: 0 });
  assert.equal(broad.classifyPair(a, a, wallOptions), null);

  const forward = broad.analyzeBroadPhase([a, b, c], wallOptions)
    .map(item => `${item.partAId}:${item.partBId}:${item.status}`);
  const reversed = broad.analyzeBroadPhase([c, b, a], wallOptions)
    .map(item => `${item.partAId}:${item.partBId}:${item.status}`);
  assert.deepEqual(forward, reversed);
});

test('formal connection with unknown normal-contact exclusion remains candidate', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 100, y: 0, z: 0 }),
    {
      ...wallOptions,
      connections: [{
        partAId: 'A', connectorAId: 'exit', partBId: 'B', connectorBId: 'entrance',
        normalContactExclusion: { status: 'unknown', broadPhaseCoverage: 'unknown' }
      }]
    }
  );
  assert.equal(result.status, 'candidate');
  assert.equal(result.reasonCode, 'aabb-overlap-normal-contact-not-confirmed');
});

test('non-connected pair cannot use another pair normal-contact exclusion', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 100, y: 0, z: 0 }),
    {
      ...wallOptions,
      connections: [{
        partAId: 'A', connectorAId: 'exit', partBId: 'C', connectorBId: 'entrance',
        normalContactExclusion: { status: 'verified', broadPhaseCoverage: 'confirmed' }
      }]
    }
  );
  assert.equal(result.status, 'candidate');
  assert.equal(result.normalContact.formalConnection, false);
});

test('confirmed known normal-contact coverage can mark a formally connected overlap as excluded', () => {
  const result = broad.classifyPair(
    placed('A'),
    placed('B', { x: 100, y: 0, z: 0 }),
    {
      ...wallOptions,
      connections: [{
        partAId: 'A', connectorAId: 'exit', partBId: 'B', connectorBId: 'entrance',
        normalContactExclusion: { status: 'verified', broadPhaseCoverage: 'confirmed' }
      }]
    }
  );
  assert.equal(result.status, 'excluded-normal-contact');
  assert.equal(result.reasonCode, 'confirmed-normal-contact-exclusion');
});

test('physical tolerance and floating-point epsilon remain separate controls', () => {
  const a = placed('A');
  const b = placed('B', { x: 200.5, y: 0, z: 0 });
  const withoutTolerance = broad.classifyPair(a, b, { ...wallOptions, physicalToleranceMm: 0, numericEpsilonMm: 1e-7 });
  const withTolerance = broad.classifyPair(a, b, { ...wallOptions, physicalToleranceMm: 0.5, numericEpsilonMm: 1e-7 });
  assert.equal(withoutTolerance.status, 'clear');
  assert.equal(withTolerance.status, 'candidate');
});

test('candidate extraction keeps candidate and indeterminate pairs but drops clear and excluded normal contact', () => {
  const incomplete = syntheticProfile('incomplete');
  incomplete.stations[0].runningSurfacePolylineYZMm = null;
  const placements = [
    placed('A'),
    placed('B', { x: 100, y: 0, z: 0 }),
    placed('C', { x: 1000, y: 0, z: 0 }),
    placed('D', { x: 120, y: 0, z: 0 }, 0, incomplete)
  ];
  const candidates = broad.extractBroadPhaseCandidates(placements, wallOptions);
  assert.ok(candidates.some(item => item.partAId === 'A' && item.partBId === 'B' && item.status === 'candidate'));
  assert.ok(candidates.some(item => item.partBId === 'D' && item.status === 'indeterminate'));
  assert.equal(candidates.some(item => item.partBId === 'C' && item.status === 'clear'), false);
});
