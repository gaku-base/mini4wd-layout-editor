'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PROFILE = require('./slope-longitudinal-profile.js');

const close = (actual, expected, tolerance = 1e-9, message = 'value') => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} !== ${expected}`);
};

test('verified slope profile uses R398 -> straight -> R803 and preserves the separate 270mm floor-blocking sidewall length', () => {
  assert.equal(PROFILE.status, 'verified');
  assert.equal(PROFILE.lowerArcRadiusMm, 398);
  assert.equal(PROFILE.upperArcRadiusMm, 803);
  close(PROFILE.straightLengthMm, 169.10056179681956, 1e-9, 'straight length');
  close(PROFILE.tangentAngleDeg, 18.423741009432902, 1e-9, 'tangent angle');
  assert.equal(PROFILE.floorBlockingSideWallLengthMm, 270);
  assert.equal(PROFILE.segments.map(segment => segment.kind).join(','), 'arc,straight,arc');
});

test('slope profile is tangent-continuous at both arc-to-straight connections', () => {
  const lowerEnd = PROFILE.transitionPoints.lowerArcEnd;
  const straightEnd = PROFILE.transitionPoints.straightEnd;

  close(PROFILE.tangentAngleDegAtHorizontalX(lowerEnd.xMm), PROFILE.tangentAngleDeg, 1e-9, 'lower tangent');
  close(PROFILE.tangentAngleDegAtHorizontalX(straightEnd.xMm), PROFILE.tangentAngleDeg, 1e-9, 'upper tangent');
  close(PROFILE.heightAtHorizontalX(lowerEnd.xMm), lowerEnd.zMm, 1e-9, 'lower height continuity');
  close(PROFILE.heightAtHorizontalX(straightEnd.xMm), straightEnd.zMm, 1e-9, 'upper height continuity');
});

test('slope profile closes exactly to 540mm horizontal and 115mm rise with horizontal end tangents', () => {
  close(PROFILE.heightAtHorizontalX(0), 0, 1e-9, 'low-end height');
  close(PROFILE.heightAtHorizontalX(540), 115, 1e-9, 'high-end height');
  close(PROFILE.tangentAngleDegAtHorizontalX(0), 0, 1e-9, 'low-end tangent');
  close(PROFILE.tangentAngleDegAtHorizontalX(540), 0, 1e-9, 'high-end tangent');

  close(PROFILE.transitionPoints.lowerArcEnd.xMm, 125.78478960900252, 1e-9, 'R398 end x');
  close(PROFILE.transitionPoints.lowerArcEnd.zMm, 20.39943498053534, 1e-9, 'R398 end z');
  close(PROFILE.transitionPoints.straightEnd.xMm, 286.21812548736425, 1e-9, 'straight end x');
  close(PROFILE.transitionPoints.straightEnd.zMm, 73.8423460066084, 1e-9, 'straight end z');
});

test('R398 horizontal projection independently matches the drawing 126mm cross-check', () => {
  close(PROFILE.transitionPoints.lowerArcEnd.xMm, 126, 0.25, 'drawing 126mm cross-check');
});

test('270mm floor-blocking endpoint has a derived running-surface height of about 68.44mm', () => {
  assert.equal(PROFILE.floorBlockingEnd.xMm, 270);
  close(PROFILE.floorBlockingEnd.runningSurfaceHeightMm, 68.43982892569419, 1e-9, 'surface height at x=270');
  close(PROFILE.floorBlockingEnd.tangentDeg, PROFILE.tangentAngleDeg, 1e-9, 'tangent at x=270');
});

test('underpass stays blocked through 270mm and remains indeterminate beyond it until a numeric underside offset is supplied', () => {
  const blocked = PROFILE.underpassEnvelopeAtHorizontalX(270);
  assert.equal(blocked.status, 'blocked-by-floor-sidewall');
  assert.equal(blocked.clearHeightMm, 0);

  for (const unknownOffset of [undefined, null, '', '2', Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const unknown = PROFILE.underpassEnvelopeAtHorizontalX(270.001, unknownOffset);
    assert.equal(unknown.status, 'indeterminate-underside');
    assert.equal(unknown.clearHeightMm, null);
  }

  const withTwoMillimetreReference = PROFILE.underpassEnvelopeAtHorizontalX(270.001, 2);
  assert.equal(withTwoMillimetreReference.status, 'candidate-clearance');
  close(
    withTwoMillimetreReference.clearHeightMm,
    PROFILE.heightAtHorizontalX(270.001) - 2,
    1e-9,
    'explicit underside-offset clearance'
  );
});

test('two high-end-connected slopes give a 540mm opening and a centred 370mm lower course leaves 85mm side margin', () => {
  const reference = PROFILE.centeredTwoSlopeCrossoverReference(370);
  assert.equal(reference.status, 'fits-with-margin');
  assert.equal(reference.totalOpeningLengthMm, 540);
  assert.equal(reference.sideMarginMm, 85);
  assert.equal(reference.criticalXMm, 355);
  close(reference.runningSurfaceHeightMm, 93.39874583979213, 1e-9, 'critical running-surface height');
  assert.equal(reference.candidateRoofHeightMm, null);
  assert.equal(reference.candidateVerticalMarginMm, null);
});

test('centred crossover only reports candidate vertical margin when underside offset and lower-course height are explicit', () => {
  const reference = PROFILE.centeredTwoSlopeCrossoverReference(370, 2, 57);
  assert.equal(reference.status, 'fits-with-margin');
  close(reference.candidateRoofHeightMm, 91.39874583979213, 1e-9, 'candidate roof height');
  close(reference.candidateVerticalMarginMm, 34.39874583979213, 1e-9, 'candidate vertical margin');

  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference('370'), null);
  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference(541).status, 'does-not-fit');
  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference(540).status, 'touches-sidewall-boundary');
});

test('profile remains monotonic through representative horizontal stations', () => {
  const stations = [0, 50, 125.78478960900252, 200, 270, 286.21812548736425, 355, 400, 540];
  const heights = stations.map(PROFILE.heightAtHorizontalX);
  for (let index = 1; index < heights.length; index += 1) {
    assert.ok(heights[index] >= heights[index - 1], `height must not decrease at station ${stations[index]}`);
  }
});
