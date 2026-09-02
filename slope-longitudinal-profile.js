(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SLOPE_LONGITUDINAL_PROFILE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HORIZONTAL_MM = 540;
  const RISE_MM = 115;
  const LOWER_ARC_RADIUS_MM = 398;
  const UPPER_ARC_RADIUS_MM = 803;
  const FLOOR_BLOCKING_SIDEWALL_LENGTH_MM = 270;
  const UNDERPASS_SAFETY_MARGIN_MM = 2;
  const UNDERPASS_BLOCKED_THROUGH_X_MM = FLOOR_BLOCKING_SIDEWALL_LENGTH_MM + UNDERPASS_SAFETY_MARGIN_MM;

  // Project-owner approved on 2026-09-01: the longitudinal side-view reference
  // curve is a tangent-continuous R398 arc -> straight -> R803 arc. Solving
  // the two unknowns (straight length and tangent angle) against the verified
  // 540 mm horizontal projection and 115 mm rise gives the values below.
  const STRAIGHT_LENGTH_MM = 169.10056179681956;
  const TANGENT_ANGLE_DEG = 18.423741009432902;
  const TANGENT_ANGLE_RAD = TANGENT_ANGLE_DEG * Math.PI / 180;

  const LOWER_ARC_HORIZONTAL_MM = LOWER_ARC_RADIUS_MM * Math.sin(TANGENT_ANGLE_RAD);
  const LOWER_ARC_RISE_MM = LOWER_ARC_RADIUS_MM * (1 - Math.cos(TANGENT_ANGLE_RAD));
  const STRAIGHT_HORIZONTAL_MM = STRAIGHT_LENGTH_MM * Math.cos(TANGENT_ANGLE_RAD);
  const STRAIGHT_RISE_MM = STRAIGHT_LENGTH_MM * Math.sin(TANGENT_ANGLE_RAD);
  const UPPER_ARC_HORIZONTAL_MM = UPPER_ARC_RADIUS_MM * Math.sin(TANGENT_ANGLE_RAD);
  const UPPER_ARC_RISE_MM = UPPER_ARC_RADIUS_MM * (1 - Math.cos(TANGENT_ANGLE_RAD));

  const LOWER_ARC_END = Object.freeze({
    xMm: LOWER_ARC_HORIZONTAL_MM,
    zMm: LOWER_ARC_RISE_MM,
    tangentDeg: TANGENT_ANGLE_DEG
  });

  const STRAIGHT_END = Object.freeze({
    xMm: LOWER_ARC_HORIZONTAL_MM + STRAIGHT_HORIZONTAL_MM,
    zMm: LOWER_ARC_RISE_MM + STRAIGHT_RISE_MM,
    tangentDeg: TANGENT_ANGLE_DEG
  });

  function clampHorizontalX(xMm) {
    const x = Number(xMm);
    if (!Number.isFinite(x)) return null;
    return Math.min(HORIZONTAL_MM, Math.max(0, x));
  }

  function heightAtHorizontalX(xMm) {
    const x = clampHorizontalX(xMm);
    if (x === null) return null;

    if (x <= LOWER_ARC_END.xMm) {
      return LOWER_ARC_RADIUS_MM - Math.sqrt(Math.max(0, LOWER_ARC_RADIUS_MM ** 2 - x ** 2));
    }

    if (x <= STRAIGHT_END.xMm) {
      return LOWER_ARC_END.zMm + (x - LOWER_ARC_END.xMm) * Math.tan(TANGENT_ANGLE_RAD);
    }

    const fromHighEnd = HORIZONTAL_MM - x;
    return RISE_MM - (UPPER_ARC_RADIUS_MM - Math.sqrt(Math.max(0, UPPER_ARC_RADIUS_MM ** 2 - fromHighEnd ** 2)));
  }

  function tangentAngleDegAtHorizontalX(xMm) {
    const x = clampHorizontalX(xMm);
    if (x === null) return null;

    if (x <= LOWER_ARC_END.xMm) {
      return Math.asin(x / LOWER_ARC_RADIUS_MM) * 180 / Math.PI;
    }

    if (x <= STRAIGHT_END.xMm) return TANGENT_ANGLE_DEG;

    return Math.asin((HORIZONTAL_MM - x) / UPPER_ARC_RADIUS_MM) * 180 / Math.PI;
  }

  // The physical floor-reaching side wall ends at x=270 mm. The project-owner
  // approved an additional 2 mm interference margin on 2026-09-02, so x<=272
  // is treated as blocked for layout collision purposes. At x>272 the lower
  // course may pass under the slope. An explicit underside offset can still be
  // supplied for diagnostic clearance calculations, but it does not change the
  // approved pass/fail boundary.
  function underpassEnvelopeAtHorizontalX(xMm, undersideOffsetMm = null) {
    const x = clampHorizontalX(xMm);
    if (x === null) return null;

    const runningSurfaceHeightMm = heightAtHorizontalX(x);
    if (x <= FLOOR_BLOCKING_SIDEWALL_LENGTH_MM) {
      return Object.freeze({
        status: 'blocked-by-floor-sidewall',
        xMm: x,
        runningSurfaceHeightMm,
        clearHeightMm: 0,
        undersideOffsetMm: null
      });
    }

    if (x <= UNDERPASS_BLOCKED_THROUGH_X_MM) {
      return Object.freeze({
        status: 'blocked-by-safety-margin',
        xMm: x,
        runningSurfaceHeightMm,
        clearHeightMm: 0,
        undersideOffsetMm: null
      });
    }

    const hasExplicitUndersideOffset = typeof undersideOffsetMm === 'number'
      && Number.isFinite(undersideOffsetMm)
      && undersideOffsetMm >= 0;

    return Object.freeze({
      status: 'clear-by-approved-rule',
      xMm: x,
      runningSurfaceHeightMm,
      clearHeightMm: hasExplicitUndersideOffset
        ? Math.max(0, runningSurfaceHeightMm - undersideOffsetMm)
        : null,
      undersideOffsetMm: hasExplicitUndersideOffset ? undersideOffsetMm : null
    });
  }

  // Arbitrary lower-course positions and crossing angles are handled by first
  // projecting the lower-course occupied polygon onto the slope-local X axis.
  // If any overlapping part of that projected range reaches x<=272 mm, it is
  // blocked. Only a footprint whose entire overlap lies at x>272 mm is clear.
  function classifyUnderpassLongitudinalRange(minXMm, maxXMm) {
    if (typeof minXMm !== 'number' || !Number.isFinite(minXMm)
      || typeof maxXMm !== 'number' || !Number.isFinite(maxXMm)) return null;

    const rawMin = Math.min(minXMm, maxXMm);
    const rawMax = Math.max(minXMm, maxXMm);
    if (rawMax < 0 || rawMin > HORIZONTAL_MM) {
      return Object.freeze({
        status: 'no-overlap',
        minXMm: null,
        maxXMm: null,
        blockedThroughXMm: UNDERPASS_BLOCKED_THROUGH_X_MM
      });
    }

    const overlapMinXMm = Math.max(0, rawMin);
    const overlapMaxXMm = Math.min(HORIZONTAL_MM, rawMax);
    const blocked = overlapMinXMm <= UNDERPASS_BLOCKED_THROUGH_X_MM;

    return Object.freeze({
      status: blocked ? 'blocked-by-underpass-zone' : 'clear-by-approved-rule',
      minXMm: overlapMinXMm,
      maxXMm: overlapMaxXMm,
      blockedThroughXMm: UNDERPASS_BLOCKED_THROUGH_X_MM
    });
  }

  // This remains only a QA/reference example for a centred 90-degree crossing.
  // Actual collision logic must use the projected occupied range above so that
  // low-side/high-side offsets and diagonal crossings are handled identically.
  function centeredTwoSlopeCrossoverReference(lowerCourseOuterWidthMm, undersideOffsetMm = null, lowerCourseHeightMm = null) {
    if (typeof lowerCourseOuterWidthMm !== 'number' || !Number.isFinite(lowerCourseOuterWidthMm) || lowerCourseOuterWidthMm <= 0) return null;

    const halfOpeningLengthMm = HORIZONTAL_MM - UNDERPASS_BLOCKED_THROUGH_X_MM;
    const totalOpeningLengthMm = halfOpeningLengthMm * 2;
    const sideMarginMm = (totalOpeningLengthMm - lowerCourseOuterWidthMm) / 2;
    const horizontalFitStatus = sideMarginMm > 0
      ? 'fits-with-margin'
      : (sideMarginMm === 0 ? 'touches-safety-boundary' : 'does-not-fit');

    if (sideMarginMm < 0) {
      return Object.freeze({
        status: horizontalFitStatus,
        lowerCourseOuterWidthMm,
        totalOpeningLengthMm,
        sideMarginMm,
        criticalXMm: null,
        runningSurfaceHeightMm: null,
        candidateRoofHeightMm: null,
        candidateVerticalMarginMm: null
      });
    }

    const criticalXMm = HORIZONTAL_MM - lowerCourseOuterWidthMm / 2;
    const runningSurfaceHeightMm = heightAtHorizontalX(criticalXMm);
    const roof = underpassEnvelopeAtHorizontalX(criticalXMm, undersideOffsetMm);
    const hasLowerCourseHeight = typeof lowerCourseHeightMm === 'number' && Number.isFinite(lowerCourseHeightMm) && lowerCourseHeightMm >= 0;
    const candidateRoofHeightMm = roof?.status === 'clear-by-approved-rule' ? roof.clearHeightMm : null;
    const candidateVerticalMarginMm = candidateRoofHeightMm !== null && hasLowerCourseHeight
      ? candidateRoofHeightMm - lowerCourseHeightMm
      : null;

    return Object.freeze({
      status: horizontalFitStatus,
      lowerCourseOuterWidthMm,
      totalOpeningLengthMm,
      sideMarginMm,
      criticalXMm,
      runningSurfaceHeightMm,
      candidateRoofHeightMm,
      candidateVerticalMarginMm
    });
  }

  const FLOOR_BLOCKING_END = Object.freeze({
    xMm: FLOOR_BLOCKING_SIDEWALL_LENGTH_MM,
    runningSurfaceHeightMm: heightAtHorizontalX(FLOOR_BLOCKING_SIDEWALL_LENGTH_MM),
    tangentDeg: tangentAngleDegAtHorizontalX(FLOOR_BLOCKING_SIDEWALL_LENGTH_MM)
  });

  const UNDERPASS_BLOCKED_END = Object.freeze({
    xMm: UNDERPASS_BLOCKED_THROUGH_X_MM,
    runningSurfaceHeightMm: heightAtHorizontalX(UNDERPASS_BLOCKED_THROUGH_X_MM),
    tangentDeg: tangentAngleDegAtHorizontalX(UNDERPASS_BLOCKED_THROUGH_X_MM)
  });

  const SEGMENTS = Object.freeze([
    Object.freeze({
      id: 'lower-r398',
      kind: 'arc',
      radiusMm: LOWER_ARC_RADIUS_MM,
      start: Object.freeze({ xMm: 0, zMm: 0, tangentDeg: 0 }),
      end: LOWER_ARC_END
    }),
    Object.freeze({
      id: 'middle-straight',
      kind: 'straight',
      lengthMm: STRAIGHT_LENGTH_MM,
      angleDeg: TANGENT_ANGLE_DEG,
      start: LOWER_ARC_END,
      end: STRAIGHT_END
    }),
    Object.freeze({
      id: 'upper-r803',
      kind: 'arc',
      radiusMm: UPPER_ARC_RADIUS_MM,
      start: STRAIGHT_END,
      end: Object.freeze({ xMm: HORIZONTAL_MM, zMm: RISE_MM, tangentDeg: 0 })
    })
  ]);

  return Object.freeze({
    status: 'verified',
    source: 'project-owner-approved-2026-09-01',
    horizontalMm: HORIZONTAL_MM,
    riseMm: RISE_MM,
    lowerArcRadiusMm: LOWER_ARC_RADIUS_MM,
    straightLengthMm: STRAIGHT_LENGTH_MM,
    tangentAngleDeg: TANGENT_ANGLE_DEG,
    upperArcRadiusMm: UPPER_ARC_RADIUS_MM,
    floorBlockingSideWallLengthMm: FLOOR_BLOCKING_SIDEWALL_LENGTH_MM,
    underpassSafetyMarginMm: UNDERPASS_SAFETY_MARGIN_MM,
    underpassBlockedThroughXMm: UNDERPASS_BLOCKED_THROUGH_X_MM,
    floorBlockingEnd: FLOOR_BLOCKING_END,
    underpassBlockedEnd: UNDERPASS_BLOCKED_END,
    transitionPoints: Object.freeze({ lowerArcEnd: LOWER_ARC_END, straightEnd: STRAIGHT_END }),
    segments: SEGMENTS,
    heightAtHorizontalX,
    tangentAngleDegAtHorizontalX,
    underpassEnvelopeAtHorizontalX,
    classifyUnderpassLongitudinalRange,
    centeredTwoSlopeCrossoverReference
  });
});
