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

  // The floor-reaching side skirt blocks an underpass through x=270 mm.
  // Beyond that station the product photos show an opening, but the exact
  // underside offset/thickness is not yet verified. This helper therefore
  // reports the known running-surface envelope and only computes a physical
  // roof clearance when the caller supplies an explicit finite numeric offset.
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

    if (typeof undersideOffsetMm !== 'number' || !Number.isFinite(undersideOffsetMm) || undersideOffsetMm < 0) {
      return Object.freeze({
        status: 'indeterminate-underside',
        xMm: x,
        runningSurfaceHeightMm,
        clearHeightMm: null,
        undersideOffsetMm: null
      });
    }

    return Object.freeze({
      status: 'candidate-clearance',
      xMm: x,
      runningSurfaceHeightMm,
      clearHeightMm: Math.max(0, runningSurfaceHeightMm - undersideOffsetMm),
      undersideOffsetMm
    });
  }

  // Two slopes joined at their high ends create a 540 mm longitudinal opening
  // (270 mm from each half). A lower course crossing at 90 degrees is normally
  // centred on that high-end seam. This function evaluates only horizontal fit
  // and the critical station at the lower-course outer edge; it never upgrades
  // the result to authoritative collision clearance because real underside ribs
  // and connector protrusions are still unmeasured.
  function centeredTwoSlopeCrossoverReference(lowerCourseOuterWidthMm, undersideOffsetMm = null, lowerCourseHeightMm = null) {
    if (typeof lowerCourseOuterWidthMm !== 'number' || !Number.isFinite(lowerCourseOuterWidthMm) || lowerCourseOuterWidthMm <= 0) return null;

    const halfOpeningLengthMm = HORIZONTAL_MM - FLOOR_BLOCKING_SIDEWALL_LENGTH_MM;
    const totalOpeningLengthMm = halfOpeningLengthMm * 2;
    const sideMarginMm = (totalOpeningLengthMm - lowerCourseOuterWidthMm) / 2;
    const horizontalFitStatus = sideMarginMm > 0
      ? 'fits-with-margin'
      : (sideMarginMm === 0 ? 'touches-sidewall-boundary' : 'does-not-fit');

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
    const candidateRoofHeightMm = roof?.status === 'candidate-clearance' ? roof.clearHeightMm : null;
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
    floorBlockingEnd: FLOOR_BLOCKING_END,
    transitionPoints: Object.freeze({ lowerArcEnd: LOWER_ARC_END, straightEnd: STRAIGHT_END }),
    segments: SEGMENTS,
    heightAtHorizontalX,
    tangentAngleDegAtHorizontalX,
    underpassEnvelopeAtHorizontalX,
    centeredTwoSlopeCrossoverReference
  });
});
