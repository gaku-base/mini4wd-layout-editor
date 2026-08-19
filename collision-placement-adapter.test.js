'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ADAPTER = require('./collision-placement-adapter.js');
const BROADPHASE = require('./collision-broadphase.js');

// Synthetic provisional collision fixtures only. Their arbitrary dimensions are
// engine-test geometry, not measured, verified, or production part dimensions.
function makeSyntheticProvisionalPolylineProfile(id = 'poly') {
  const station = (stationId, ratio, x) => ({
    id: stationId,
    ratio,
    centerlinePositionMm: { x, y: 0, z: 0 },
    tangentHeadingDeg: 0,
    runningSurfacePolylineYZMm: [[-50, 0], [50, 0]],
    undersidePolylineYZMm: [[-50, -10], [50, -10]],
    sideWallPolylinesYZMm: {
      left: [[-50, -10], [-50, 30]],
      right: [[50, -10], [50, 30]]
    },
    passableClearance: { effectiveHeightMm: 100, effectiveWidthMm: 100 }
  });
  return {
    id,
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entry', 0, 0), station('exit', 1, 100)]
  };
}

function makeSyntheticProvisionalBankProfile(id = 'bank') {
  const station = (stationId, ratio, x) => ({
    id: stationId,
    ratio,
    centerlinePositionMm: { x, y: 0, z: 0 },
    tangentHeadingDeg: 0,
    runningSurfacePolylineYZMm: [[-60, 0], [60, 0]],
    undersidePolylineYZMm: [[-60, -10], [60, -10]],
    walls: {
      inner: { lowerEdgeMm: { y: -60, z: -10 }, upperEdgeMm: { y: -60, z: 35 } },
      outer: { lowerEdgeMm: { y: 60, z: -10 }, upperEdgeMm: { y: 60, z: 35 } }
    },
    passableClearance: { effectiveHeightMm: 100, effectiveWidthMm: 100 }
  });
  return {
    id,
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entry', 0, 0), station('exit', 1, 100)]
  };
}

const definitions = {
  slope: { name: 'Slope definition' },
  bank20: { name: 'Bank definition' },
  straight: { name: 'Straight definition' },
  start: { name: 'Start definition' }
};

test('editorCmToMm converts only finite numeric centimetres', () => {
  assert.equal(ADAPTER.editorCmToMm(12.5), 125);
  assert.equal(ADAPTER.editorCmToMm(-3), -30);
  assert.equal(ADAPTER.editorCmToMm(0), 0);
  for (const value of [null, undefined, NaN, Infinity, -Infinity, '12.5']) {
    assert.equal(ADAPTER.editorCmToMm(value), null);
  }
});

test('synthetic provisional profile: adaptEditorPlacement converts XY to mm, preserves zMm and rotation, and passes resolver context', () => {
  const part = { id: 'p-1', type: 'slope', x: 12.5, y: -3.25, zMm: 115, rotation: 45 };
  const profile = makeSyntheticProvisionalPolylineProfile('slope-profile');
  let resolverCall = null;
  const placement = ADAPTER.adaptEditorPlacement(part, {
    partDefinitions: definitions,
    resolveCollisionProfile(runtimePart, definition) {
      resolverCall = { runtimePart, definition };
      return { profileRef: 'slope-profile@1', profile, requiredWallKeys: ['left', 'right'] };
    }
  });
  assert.deepEqual(placement.positionMm, { x: 125, y: -32.5, z: 115 });
  assert.equal(placement.rotationDeg, 45);
  assert.equal(placement.partId, 'p-1');
  assert.equal(placement.profileRef, 'slope-profile@1');
  assert.deepEqual(placement.requiredWallKeys, ['left', 'right']);
  assert.equal(resolverCall.runtimePart, part);
  assert.equal(resolverCall.definition, definitions.slope);
  assert.equal(placement.profile, profile);
});

test('synthetic provisional profile: invalid editor numeric fields stay unknown and rotation is not snapped to 45 degrees', () => {
  const profile = makeSyntheticProvisionalPolylineProfile();
  const placement = ADAPTER.adaptEditorPlacement({
    id: 'bad-numbers', type: 'slope', x: '10', y: null, zMm: Infinity, rotation: 30
  }, {
    partDefinitions: definitions,
    resolveCollisionProfile: () => ({ profile, requiredWallKeys: ['left', 'right'] })
  });
  assert.deepEqual(placement.positionMm, { x: null, y: null, z: null });
  assert.equal(placement.rotationDeg, 30);
  const aabb = BROADPHASE.buildWorldAabb(placement);
  assert.equal(aabb.status, 'indeterminate');
  assert(aabb.missing.includes('placement.positionMm.x'));
  assert(aabb.missing.includes('placement.positionMm.y'));
  assert(aabb.missing.includes('placement.positionMm.z'));
  assert(aabb.missing.includes('placement.rotationDeg(45-degree increment required)'));
});

test('unresolved profile and wall schema remain indeterminate instead of being invented', () => {
  const placement = ADAPTER.adaptEditorPlacement({ id: 'p', type: 'slope', x: 0, y: 0, zMm: 0, rotation: 0 });
  assert.equal(placement.profile, null);
  assert.deepEqual(placement.requiredWallKeys, []);
  const result = BROADPHASE.buildWorldAabb(placement, { requiredWallKeys: ['left', 'right'] });
  assert.equal(result.status, 'indeterminate');
  assert(result.missing.includes('placement.requiredWallKeys(non-empty wall schema required)'));
  assert(result.missing.includes('profile'));
});

test('resolver errors are contained as unresolved profile diagnostics, never a fabricated profile', () => {
  const placement = ADAPTER.adaptEditorPlacement({ id: 'p', type: 'slope', x: 0, y: 0, zMm: 0, rotation: 0 }, {
    resolveCollisionProfile() { throw new Error('boom'); }
  });
  assert.equal(placement.profile, null);
  assert.deepEqual(placement.requiredWallKeys, []);
  assert.equal(placement.adapterDiagnostics[0].code, 'collision-profile-resolver-error');
  assert.equal(BROADPHASE.buildWorldAabb(placement).status, 'indeterminate');
});

test('synthetic provisional profile: adaptEditorLayout includes existing start plus parts and never creates a missing start', () => {
  const profile = makeSyntheticProvisionalPolylineProfile();
  const resolver = () => ({ profile, requiredWallKeys: ['left', 'right'] });
  const layout = {
    start: { id: 'start', type: 'start', x: 1, y: 2, zMm: 0, rotation: 0 },
    parts: [
      { id: 'a', type: 'straight', x: 3, y: 4, zMm: 0, rotation: 0 },
      { id: 'b', type: 'straight', x: 5, y: 6, zMm: 0, rotation: 45 }
    ]
  };
  const before = JSON.stringify(layout);
  const placements = ADAPTER.adaptEditorLayout(layout, { partDefinitions: definitions, resolveCollisionProfile: resolver });
  assert.deepEqual(placements.map(item => item.partId), ['start', 'a', 'b']);
  assert.equal(JSON.stringify(layout), before);
  const withoutStart = ADAPTER.adaptEditorLayout({ parts: layout.parts }, { resolveCollisionProfile: resolver });
  assert.deepEqual(withoutStart.map(item => item.partId), ['a', 'b']);
});

test('synthetic provisional profile: missing and duplicate IDs are not synthesized away by the adapter', () => {
  const profile = makeSyntheticProvisionalPolylineProfile();
  const resolver = () => ({ profile, requiredWallKeys: ['left', 'right'] });
  const placements = ADAPTER.adaptEditorLayout({
    parts: [
      { id: 'dup', type: 'straight', x: 0, y: 0, zMm: 0, rotation: 0 },
      { id: 'dup', type: 'straight', x: 1, y: 0, zMm: 0, rotation: 0 },
      { type: 'straight', x: 2, y: 0, zMm: 0, rotation: 0 }
    ]
  }, { resolveCollisionProfile: resolver });
  assert.deepEqual(placements.map(item => item.partId), ['dup', 'dup', '']);
  const results = BROADPHASE.analyzeBroadPhase(placements, { physicalToleranceMm: 0 });
  assert.equal(results.length, 3);
  assert(results.every(result => result.status === 'indeterminate'));
  assert(results.some(result => result.reasonCode === 'part-id-missing'));
  assert(results.some(result => result.reasonCode === 'part-id-duplicate'));
});

test('synthetic provisional profiles: mixed per-placement wall schemas can be classified in one pair', () => {
  const poly = makeSyntheticProvisionalPolylineProfile('poly');
  const bank = makeSyntheticProvisionalBankProfile('bank');
  const resolver = part => part.type === 'bank20'
    ? { profileRef: 'bank@1', profile: bank, requiredWallKeys: ['inner', 'outer'] }
    : { profileRef: 'poly@1', profile: poly, requiredWallKeys: ['left', 'right'] };
  const [a, b] = ADAPTER.adaptEditorLayout({
    parts: [
      { id: 'A', type: 'slope', x: 0, y: 0, zMm: 0, rotation: 0 },
      { id: 'B', type: 'bank20', x: 5, y: 0, zMm: 0, rotation: 0 }
    ]
  }, { partDefinitions: definitions, resolveCollisionProfile: resolver });
  const result = BROADPHASE.classifyPair(a, b, { physicalToleranceMm: 0 });
  assert.equal(result.status, 'candidate');
  assert.equal(result.reasonCode, 'aabb-overlap');
});

test('synthetic provisional profile: legacy global wall schema remains a fallback when placement schema is absent', () => {
  const profile = makeSyntheticProvisionalPolylineProfile();
  const base = { profile, positionMm: { x: 0, y: 0, z: 0 }, rotationDeg: 0 };
  const a = { ...base, partId: 'A' };
  const b = { ...base, partId: 'B', positionMm: { x: 50, y: 0, z: 0 } };
  const result = BROADPHASE.classifyPair(a, b, { requiredWallKeys: ['left', 'right'], physicalToleranceMm: 0 });
  assert.equal(result.status, 'candidate');
});

test('synthetic provisional profile: explicit empty placement wall schema is authoritative and cannot be rescued by global fallback', () => {
  const profile = makeSyntheticProvisionalPolylineProfile();
  const a = {
    partId: 'A', profile, requiredWallKeys: [],
    positionMm: { x: 0, y: 0, z: 0 }, rotationDeg: 0
  };
  const b = {
    partId: 'B', profile,
    positionMm: { x: 50, y: 0, z: 0 }, rotationDeg: 0
  };
  const result = BROADPHASE.classifyPair(a, b, { requiredWallKeys: ['left', 'right'], physicalToleranceMm: 0 });
  assert.equal(result.status, 'indeterminate');
  assert(result.missing.some(item => item.partId === 'A' && item.path === 'placement.requiredWallKeys(non-empty wall schema required)'));
});
