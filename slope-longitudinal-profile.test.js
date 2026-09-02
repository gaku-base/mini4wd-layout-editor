'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PROFILE = require('./slope-longitudinal-profile.js');

const close = (actual, expected, tolerance = 1e-9, message = 'value') => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} !== ${expected}`);
};

test('verified slope profile uses R398 -> straight -> R803 and preserves physical 270mm sidewall plus 2mm safety margin', () => {
  assert.equal(PROFILE.status, 'verified');
  assert.equal(PROFILE.lowerArcRadiusMm, 398);
  assert.equal(PROFILE.upperArcRadiusMm, 803);
  close(PROFILE.straightLengthMm, 169.10056179681956, 1e-9, 'straight length');
  close(PROFILE.tangentAngleDeg, 18.423741009432902, 1e-9, 'tangent angle');
  assert.equal(PROFILE.floorBlockingSideWallLengthMm, 270);
  assert.equal(PROFILE.underpassSafetyMarginMm, 2);
  assert.equal(PROFILE.underpassBlockedThroughXMm, 272);
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

test('physical sidewall ends at 270mm while collision blocking extends through 272mm', () => {
  assert.equal(PROFILE.floorBlockingEnd.xMm, 270);
  close(PROFILE.floorBlockingEnd.runningSurfaceHeightMm, 68.43982892569419, 1e-9, 'surface height at x=270');
  assert.equal(PROFILE.underpassBlockedEnd.xMm, 272);
  close(PROFILE.underpassBlockedEnd.runningSurfaceHeightMm, 69.10606092459238, 1e-9, 'surface height at x=272');
});

test('underpass is blocked through x=272 and clear immediately above the approved safety boundary', () => {
  assert.equal(PROFILE.underpassEnvelopeAtHorizontalX(270).status, 'blocked-by-floor-sidewall');
  assert.equal(PROFILE.underpassEnvelopeAtHorizontalX(270.001).status, 'blocked-by-safety-margin');
  assert.equal(PROFILE.underpassEnvelopeAtHorizontalX(272).status, 'blocked-by-safety-margin');

  const clear = PROFILE.underpassEnvelopeAtHorizontalX(272.001);
  assert.equal(clear.status, 'clear-by-approved-rule');
  assert.equal(clear.clearHeightMm, null);

  const diagnostic = PROFILE.underpassEnvelopeAtHorizontalX(272.001, 2);
  assert.equal(diagnostic.status, 'clear-by-approved-rule');
  close(diagnostic.clearHeightMm, PROFILE.heightAtHorizontalX(272.001) - 2, 1e-9, 'diagnostic underside clearance');
});

test('arbitrary crossing footprints fail if any projected overlap reaches x<=272 and clear only when wholly above it', () => {
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(280, 500).status, 'clear-by-approved-rule');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(272.001, 500).status, 'clear-by-approved-rule');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(272, 500).status, 'blocked-by-underpass-zone');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(265, 500).status, 'blocked-by-underpass-zone');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(500, 280).status, 'clear-by-approved-rule');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(-100, -1).status, 'no-overlap');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange(541, 600).status, 'no-overlap');
  assert.equal(PROFILE.classifyUnderpassLongitudinalRange('280', 500), null);
});

test('centred 90-degree crossover remains a QA example and reflects the 2mm margin on both slopes', () => {
  const reference = PROFILE.centeredTwoSlopeCrossoverReference(370);
  assert.equal(reference.status, 'fits-with-margin');
  assert.equal(reference.totalOpeningLengthMm, 536);
  assert.equal(reference.sideMarginMm, 83);
  assert.equal(reference.criticalXMm, 355);
  close(reference.runningSurfaceHeightMm, 93.39874583979213, 1e-9, 'critical running-surface height');
  assert.equal(reference.candidateRoofHeightMm, null);
  assert.equal(reference.candidateVerticalMarginMm, null);
});

test('centred crossover diagnostic clearance is optional and does not define passability', () => {
  const reference = PROFILE.centeredTwoSlopeCrossoverReference(370, 2, 57);
  assert.equal(reference.status, 'fits-with-margin');
  close(reference.candidateRoofHeightMm, 91.39874583979213, 1e-9, 'candidate roof height');
  close(reference.candidateVerticalMarginMm, 34.39874583979213, 1e-9, 'candidate vertical margin');

  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference('370'), null);
  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference(537).status, 'does-not-fit');
  assert.equal(PROFILE.centeredTwoSlopeCrossoverReference(536).status, 'touches-safety-boundary');
});

test('profile remains monotonic through representative horizontal stations', () => {
  const stations = [0, 50, 125.78478960900252, 200, 270, 272, 286.21812548736425, 355, 400, 540];
  const heights = stations.map(PROFILE.heightAtHorizontalX);
  for (let index = 1; index < heights.length; index += 1) {
    assert.ok(heights[index] >= heights[index - 1], `height must not decrease at station ${stations[index]}`);
  }
});
