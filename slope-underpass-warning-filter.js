(function (root, factory) {
  'use strict';
  const policy = typeof module === 'object' && module.exports
    ? require('./slope-underpass-pair-policy.js')
    : root?.M4WD_SLOPE_UNDERPASS_PAIR_POLICY;
  const api = factory(policy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SLOPE_UNDERPASS_WARNING_FILTER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (POLICY) {
  'use strict';

  const CM_TO_MM = 10;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  function polygonCmToMm(value) {
    if (!Array.isArray(value) || value.length < 3) return null;
    const points = value.map(point => {
      const x = finite(point?.x);
      const y = finite(point?.y);
      return x == null || y == null ? null : { x: x * CM_TO_MM, y: y * CM_TO_MM };
    });
    return points.some(point => point == null) ? null : points;
  }

  function partMap(parts) {
    const map = new Map();
    (Array.isArray(parts) ? parts : []).forEach(part => {
      if (part?.id == null) return;
      const id = String(part.id);
      if (!id || map.has(id)) return;
      map.set(id, part);
    });
    return map;
  }

  function slopePair(partsById, warning, catalog) {
    const ids = Array.isArray(warning?.partIds) ? warning.partIds.map(String) : [];
    if (ids.length !== 2) return null;
    const first = partsById.get(ids[0]);
    const second = partsById.get(ids[1]);
    if (!first || !second) return null;
    const firstDefinition = catalog?.[first.type];
    const secondDefinition = catalog?.[second.type];
    const firstSlope = Boolean(firstDefinition?.slope || first.type === 'slope');
    const secondSlope = Boolean(secondDefinition?.slope || second.type === 'slope');
    if (firstSlope === secondSlope) return null;
    return firstSlope
      ? { slope: first, lower: second, slopeDefinition: firstDefinition, lowerDefinition: secondDefinition }
      : { slope: second, lower: first, slopeDefinition: secondDefinition, lowerDefinition: firstDefinition };
  }

  function classifyWarning(warning, partsById, catalog, occupancyPolygon) {
    if (warning?.type !== 'interference') return null;
    if (!POLICY || typeof POLICY.classifyApprovedSlopeUnderpassPair !== 'function') return null;
    if (typeof occupancyPolygon !== 'function') return null;
    const pair = slopePair(partsById, warning, catalog);
    if (!pair) return null;

    const slopePolygonCm = occupancyPolygon(pair.slope, pair.slopeDefinition);
    const lowerPolygonCm = occupancyPolygon(pair.lower, pair.lowerDefinition);
    const slopeFootprintPolygonMm = polygonCmToMm(slopePolygonCm);
    const lowerCoursePolygonMm = polygonCmToMm(lowerPolygonCm);
    if (!slopeFootprintPolygonMm || !lowerCoursePolygonMm) {
      return Object.freeze({ status: 'indeterminate', reasonCode: 'occupancy-polygon-invalid' });
    }

    return POLICY.classifyApprovedSlopeUnderpassPair({
      slopePart: pair.slope,
      lowerPart: pair.lower,
      slopeDefinition: pair.slopeDefinition,
      lowerDefinition: pair.lowerDefinition,
      slopeFootprintPolygonMm,
      lowerCoursePolygonMm
    });
  }

  function filterApprovedSlopeUnderpassWarnings(warnings, options = {}) {
    const source = Array.isArray(warnings) ? warnings : [];
    const partsById = partMap(options.parts);
    const catalog = options.catalog && typeof options.catalog === 'object' ? options.catalog : {};
    const occupancyPolygon = options.occupancyPolygon;

    return source.flatMap(warning => {
      const classification = classifyWarning(warning, partsById, catalog, occupancyPolygon);
      if (!classification) return [warning];
      if (classification.status === 'clear-underpass') return [];
      if (classification.status === 'blocked-underpass') {
        return [{
          ...warning,
          slopeUnderpass: Object.freeze({
            status: classification.status,
            reasonCode: classification.reasonCode,
            blockedThroughXMm: classification.xy?.blockedThroughXMm ?? null,
            overlapMinXMm: classification.xy?.overlapMinXMm ?? null,
            overlapMaxXMm: classification.xy?.overlapMaxXMm ?? null,
            overlapAreaMm2: classification.xy?.overlapAreaMm2 ?? null,
            intersectionFragmentsMm: classification.xy?.intersectionFragmentsMm || []
          })
        }];
      }
      return [warning];
    });
  }

  return Object.freeze({
    CM_TO_MM,
    polygonCmToMm,
    partMap,
    slopePair,
    classifyWarning,
    filterApprovedSlopeUnderpassWarnings
  });
});
