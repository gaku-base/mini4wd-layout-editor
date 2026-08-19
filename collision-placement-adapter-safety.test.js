'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ADAPTER = require('./collision-placement-adapter.js');
const BROADPHASE = require('./collision-broadphase.js');

function makeProfile() {
  const station = (id, ratio, x) => ({
    id,
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
    id: 'profile',
    status: 'provisional',
    coordinateFrame: 'part-local-xyz',
    interpolation: 'linear',
    stations: [station('entry', 0, 0), station('exit', 1, 100)]
  };
}

test('wall schema normalization accepts only non-empty string keys', () => {
  assert.deepEqual(
    ADAPTER.normalizeRequiredWallKeys([' left ', 'right', 'left', 42, {}, null, '']),
    ['left', 'right']
  );
});

test('finite centimetre input that overflows in mm becomes unknown', () => {
  assert.equal(ADAPTER.editorCmToMm(Number.MAX_VALUE), null);
  const placement = ADAPTER.adaptEditorPlacement({
    id: 'overflow', type: 'slope', x: Number.MAX_VALUE, y: 0, zMm: 0, rotation: 0
  }, {
    resolveCollisionProfile: () => ({ profile: makeProfile(), requiredWallKeys: ['left', 'right'] })
  });
  assert.equal(placement.positionMm.x, null);
  const result = BROADPHASE.buildWorldAabb(placement);
  assert.equal(result.status, 'indeterminate');
  assert(result.missing.includes('placement.positionMm.x'));
});
