(function (root, factory) {
  'use strict';
  const profile = typeof module === 'object' && module.exports
    ? require('./slope-longitudinal-profile.js')
    : root?.M4WD_SLOPE_LONGITUDINAL_PROFILE;
  const api = factory(profile);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SLOPE_UNDERPASS_OVERLAP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PROFILE) {
  'use strict';

  const NUMERIC_EPSILON_MM = 1e-7;
  const POLYGON_EPSILON_MM = 1e-6;

  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  function normalizeAngleDeg(value) {
    const angle = finite(value);
    return angle == null ? null : ((angle % 360) + 360) % 360;
  }

  function normalizePointMm(value) {
    if (!value || typeof value !== 'object') return null;
    const x = finite(value.x);
    const y = finite(value.y);
    return x == null || y == null ? null : { x, y };
  }

  function normalizePolygonMm(value) {
    if (!Array.isArray(value) || value.length < 3) return null;
    const points = value.map(normalizePointMm);
    if (points.some(point => point == null)) return null;
    return points;
  }

  function cross(origin, left, right) {
    return (left.x - origin.x) * (right.y - origin.y)
      - (left.y - origin.y) * (right.x - origin.x);
  }

  function polygonSignedArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    return points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2;
  }

  function polygonArea(points) {
    return Math.abs(polygonSignedArea(points));
  }

  function pointInTriangle(point, a, b, c, epsilonMm = POLYGON_EPSILON_MM) {
    const ab = cross(a, b, point);
    const bc = cross(b, c, point);
    const ca = cross(c, a, point);
    return (ab >= -epsilonMm && bc >= -epsilonMm && ca >= -epsilonMm)
      || (ab <= epsilonMm && bc <= epsilonMm && ca <= epsilonMm);
  }

  function triangulatePolygon(pointsValue, epsilonMm = POLYGON_EPSILON_MM) {
    const points = normalizePolygonMm(pointsValue);
    if (!points) return [];

    const vertices = points.filter((point, index) => index === 0
      || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > epsilonMm);
    if (vertices.length > 1
      && Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) <= epsilonMm) {
      vertices.pop();
    }
    if (vertices.length < 3 || polygonArea(vertices) <= epsilonMm ** 2) return [];

    const orientation = Math.sign(polygonSignedArea(vertices)) || 1;
    const remaining = vertices.map((_, index) => index);
    const triangles = [];
    let guard = remaining.length ** 2;

    while (remaining.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let cursor = 0; cursor < remaining.length; cursor += 1) {
        const beforeIndex = remaining[(cursor - 1 + remaining.length) % remaining.length];
        const currentIndex = remaining[cursor];
        const afterIndex = remaining[(cursor + 1) % remaining.length];
        const before = vertices[beforeIndex];
        const current = vertices[currentIndex];
        const after = vertices[afterIndex];
        if (orientation * cross(before, current, after) <= epsilonMm) continue;

        const containsVertex = remaining.some((vertexIndex, candidateCursor) => {
          if (candidateCursor === cursor
            || candidateCursor === (cursor - 1 + remaining.length) % remaining.length
            || candidateCursor === (cursor + 1) % remaining.length) return false;
          return pointInTriangle(vertices[vertexIndex], before, current, after, epsilonMm);
        });
        if (containsVertex) continue;

        triangles.push(orientation > 0
          ? [before, current, after]
          : [before, after, current]);
        remaining.splice(cursor, 1);
        clipped = true;
        break;
      }
      if (!clipped) return [];
    }

    if (remaining.length === 3) {
      const triangle = remaining.map(index => vertices[index]);
      triangles.push(orientation > 0
        ? triangle
        : [triangle[0], triangle[2], triangle[1]]);
    }
    return triangles;
  }

  function lineIntersection(start, end, clipStart, clipEnd) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const ex = clipEnd.x - clipStart.x;
    const ey = clipEnd.y - clipStart.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) <= NUMERIC_EPSILON_MM) return { x: end.x, y: end.y };
    const t = ((clipStart.x - start.x) * ey - (clipStart.y - start.y) * ex) / denominator;
    return { x: start.x + t * dx, y: start.y + t * dy };
  }

  function clipConvexPolygon(subjectValue, clipValue, epsilonMm = POLYGON_EPSILON_MM) {
    let output = normalizePolygonMm(subjectValue) || [];
    const clip = normalizePolygonMm(clipValue) || [];
    if (!output.length || !clip.length) return [];

    for (let index = 0; index < clip.length && output.length; index += 1) {
      const clipStart = clip[index];
      const clipEnd = clip[(index + 1) % clip.length];
      const input = output;
      output = [];
      for (let cursor = 0; cursor < input.length; cursor += 1) {
        const start = input[cursor];
        const end = input[(cursor + 1) % input.length];
        const startInside = cross(clipStart, clipEnd, start) >= -epsilonMm;
        const endInside = cross(clipStart, clipEnd, end) >= -epsilonMm;
        if (startInside && endInside) output.push(end);
        else if (startInside && !endInside) output.push(lineIntersection(start, end, clipStart, clipEnd));
        else if (!startInside && endInside) {
          output.push(lineIntersection(start, end, clipStart, clipEnd));
          output.push(end);
        }
      }
    }
    return output;
  }

  function polygonIntersectionFragmentsMm(leftValue, rightValue, epsilonMm = POLYGON_EPSILON_MM) {
    const left = normalizePolygonMm(leftValue);
    const right = normalizePolygonMm(rightValue);
    if (!left || !right) return [];
    const leftTriangles = triangulatePolygon(left, epsilonMm);
    const rightTriangles = triangulatePolygon(right, epsilonMm);
    const fragments = [];

    leftTriangles.forEach(leftTriangle => {
      rightTriangles.forEach(rightTriangle => {
        const clipped = clipConvexPolygon(leftTriangle, rightTriangle, epsilonMm);
        if (clipped.length >= 3 && polygonArea(clipped) > epsilonMm ** 2) fragments.push(clipped);
      });
    });
    return fragments;
  }

  function validateSlopePlacement(value) {
    const x = finite(value?.positionMm?.x);
    const y = finite(value?.positionMm?.y);
    const rotationDeg = normalizeAngleDeg(value?.rotationDeg);
    return {
      ready: x != null && y != null && rotationDeg != null,
      positionMm: x == null || y == null ? null : { x, y },
      rotationDeg,
      missing: [
        ...(x == null ? ['slopePlacement.positionMm.x'] : []),
        ...(y == null ? ['slopePlacement.positionMm.y'] : []),
        ...(rotationDeg == null ? ['slopePlacement.rotationDeg'] : [])
      ]
    };
  }

  function worldPointToSlopeLocalMm(pointValue, slopePlacementValue) {
    const point = normalizePointMm(pointValue);
    const placement = validateSlopePlacement(slopePlacementValue);
    if (!point || !placement.ready) return null;
    const dx = point.x - placement.positionMm.x;
    const dy = point.y - placement.positionMm.y;
    const radians = placement.rotationDeg * Math.PI / 180;
    return {
      x: dx * Math.cos(radians) + dy * Math.sin(radians),
      y: -dx * Math.sin(radians) + dy * Math.cos(radians)
    };
  }

  function slopeLocalXFromLowEndMm(pointValue, slopePlacementValue) {
    const local = worldPointToSlopeLocalMm(pointValue, slopePlacementValue);
    const horizontalMm = finite(PROFILE?.horizontalMm);
    if (!local || horizontalMm == null || horizontalMm <= 0) return null;
    return local.x + horizontalMm / 2;
  }

  function indeterminate(reasonCode, missing = []) {
    return Object.freeze({
      status: 'indeterminate',
      reasonCode,
      overlapAreaMm2: null,
      overlapMinXMm: null,
      overlapMaxXMm: null,
      blockedThroughXMm: finite(PROFILE?.underpassBlockedThroughXMm),
      intersectionFragmentsMm: [],
      missing: [...new Set(missing)]
    });
  }

  function classifySlopeUnderpassPolygonOverlap(input = {}) {
    if (!PROFILE || PROFILE.status !== 'verified'
      || typeof PROFILE.classifyUnderpassLongitudinalRange !== 'function'
      || finite(PROFILE.horizontalMm) == null
      || finite(PROFILE.underpassBlockedThroughXMm) == null) {
      return indeterminate('slope-profile-unavailable', ['slope-longitudinal-profile']);
    }

    const placement = validateSlopePlacement(input.slopePlacement);
    const slopePolygon = normalizePolygonMm(input.slopeFootprintPolygonMm);
    const lowerPolygon = normalizePolygonMm(input.lowerCoursePolygonMm);
    const missing = [
      ...placement.missing,
      ...(!slopePolygon ? ['slopeFootprintPolygonMm'] : []),
      ...(!lowerPolygon ? ['lowerCoursePolygonMm'] : [])
    ];
    if (missing.length) return indeterminate('invalid-input', missing);

    const fragments = polygonIntersectionFragmentsMm(slopePolygon, lowerPolygon);
    if (!fragments.length) {
      return Object.freeze({
        status: 'no-overlap',
        reasonCode: 'xy-polygons-separated',
        overlapAreaMm2: 0,
        overlapMinXMm: null,
        overlapMaxXMm: null,
        blockedThroughXMm: PROFILE.underpassBlockedThroughXMm,
        intersectionFragmentsMm: [],
        missing: []
      });
    }

    const overlapAreaMm2 = fragments.reduce((sum, fragment) => sum + polygonArea(fragment), 0);
    const xs = fragments.flatMap(fragment => fragment.map(point => slopeLocalXFromLowEndMm(point, input.slopePlacement)));
    if (!xs.length || xs.some(value => value == null || !Number.isFinite(value))) {
      return indeterminate('projection-failed', ['intersectionFragmentsMm->slopeLocalX']);
    }

    const overlapMinXMm = Math.min(...xs);
    const overlapMaxXMm = Math.max(...xs);
    const range = PROFILE.classifyUnderpassLongitudinalRange(overlapMinXMm, overlapMaxXMm);
    if (!range) return indeterminate('range-classification-failed', ['classifyUnderpassLongitudinalRange']);

    return Object.freeze({
      status: range.status,
      reasonCode: range.status === 'blocked-by-underpass-zone'
        ? 'overlap-enters-272mm-blocked-zone'
        : (range.status === 'clear-by-approved-rule'
          ? 'overlap-entirely-beyond-272mm'
          : 'xy-polygons-separated'),
      overlapAreaMm2,
      overlapMinXMm: range.minXMm,
      overlapMaxXMm: range.maxXMm,
      blockedThroughXMm: range.blockedThroughXMm,
      intersectionFragmentsMm: fragments.map(fragment => fragment.map(point => Object.freeze({ x: point.x, y: point.y }))),
      missing: []
    });
  }

  return Object.freeze({
    NUMERIC_EPSILON_MM,
    POLYGON_EPSILON_MM,
    normalizeAngleDeg,
    normalizePointMm,
    normalizePolygonMm,
    polygonSignedArea,
    polygonArea,
    triangulatePolygon,
    clipConvexPolygon,
    polygonIntersectionFragmentsMm,
    validateSlopePlacement,
    worldPointToSlopeLocalMm,
    slopeLocalXFromLowEndMm,
    classifySlopeUnderpassPolygonOverlap
  });
});
