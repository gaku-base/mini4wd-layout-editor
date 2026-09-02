(function (root, factory) {
  'use strict';
  const overlap = typeof module === 'object' && module.exports
    ? require('./slope-underpass-overlap.js')
    : root?.M4WD_SLOPE_UNDERPASS_OVERLAP;
  const api = factory(overlap);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_SLOPE_UNDERPASS_PAIR_POLICY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (OVERLAP) {
  'use strict';

  const CM_TO_MM = 10;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  function connectorRecords(definition) {
    const connectors = definition?.geometry?.connectors;
    if (!Array.isArray(connectors) || connectors.length === 0) return [];
    const metadata = Array.isArray(definition?.geometry?.connectorMetadata)
      ? definition.geometry.connectorMetadata
      : [];
    return connectors.map((connector, index) => ({
      ...connector,
      ...(metadata[index] || {})
    }));
  }

  function isApprovedFlatLowerDefinition(definition) {
    if (!definition || typeof definition !== 'object') return false;
    if (definition.slope || definition.bank20 || definition.lcjump || definition.burning) return false;
    const connectors = connectorRecords(definition);
    if (connectors.length < 2) return false;
    return connectors.every(connector => {
      const localZMm = finite(connector.localZMm);
      const pitchDeg = finite(connector.pitchDeg);
      const bankAngleDeg = finite(connector.bankAngleDeg);
      const bankTransitionToDeg = connector.bankTransitionToDeg == null
        ? 0
        : finite(connector.bankTransitionToDeg);
      return localZMm === 0
        && pitchDeg === 0
        && bankAngleDeg === 0
        && bankTransitionToDeg === 0;
    });
  }

  function slopePlacementMmFromEditorPart(part) {
    const x = finite(part?.x);
    const y = finite(part?.y);
    const rotationDeg = finite(part?.rotation);
    if (x == null || y == null || rotationDeg == null) return null;
    return {
      positionMm: { x: x * CM_TO_MM, y: y * CM_TO_MM },
      rotationDeg
    };
  }

  function baseLevelRelation(slopePart, lowerPart) {
    const slopeBaseZMm = finite(slopePart?.zMm);
    const lowerBaseZMm = finite(lowerPart?.zMm);
    if (slopeBaseZMm == null || lowerBaseZMm == null) {
      return Object.freeze({ status: 'indeterminate', slopeBaseZMm, lowerBaseZMm });
    }
    return Object.freeze({
      status: slopeBaseZMm === lowerBaseZMm ? 'same-base-level' : 'different-base-level',
      slopeBaseZMm,
      lowerBaseZMm
    });
  }

  function classifyApprovedSlopeUnderpassPair(input = {}) {
    if (!OVERLAP || typeof OVERLAP.classifySlopeUnderpassPolygonOverlap !== 'function') {
      return Object.freeze({
        status: 'indeterminate',
        reasonCode: 'polygon-overlap-classifier-unavailable',
        xy: null
      });
    }

    const slopePart = input.slopePart;
    const lowerPart = input.lowerPart;
    const slopeDefinition = input.slopeDefinition;
    const lowerDefinition = input.lowerDefinition;
    const isSlope = Boolean(slopeDefinition?.slope || slopePart?.type === 'slope');
    if (!isSlope) {
      return Object.freeze({ status: 'not-applicable', reasonCode: 'upper-part-is-not-slope', xy: null });
    }
    if (!isApprovedFlatLowerDefinition(lowerDefinition)) {
      return Object.freeze({ status: 'not-applicable', reasonCode: 'lower-part-not-approved-flat-course', xy: null });
    }

    const level = baseLevelRelation(slopePart, lowerPart);
    if (level.status === 'indeterminate') {
      return Object.freeze({ status: 'indeterminate', reasonCode: 'base-level-unknown', level, xy: null });
    }
    if (level.status !== 'same-base-level') {
      return Object.freeze({ status: 'not-applicable', reasonCode: 'base-level-differs', level, xy: null });
    }

    const slopePlacement = slopePlacementMmFromEditorPart(slopePart);
    if (!slopePlacement) {
      return Object.freeze({ status: 'indeterminate', reasonCode: 'slope-editor-pose-invalid', level, xy: null });
    }

    const xy = OVERLAP.classifySlopeUnderpassPolygonOverlap({
      slopePlacement,
      slopeFootprintPolygonMm: input.slopeFootprintPolygonMm,
      lowerCoursePolygonMm: input.lowerCoursePolygonMm
    });

    if (xy.status === 'clear-by-approved-rule') {
      return Object.freeze({ status: 'clear-underpass', reasonCode: 'same-level-flat-course-beyond-272mm', level, xy });
    }
    if (xy.status === 'blocked-by-underpass-zone') {
      return Object.freeze({ status: 'blocked-underpass', reasonCode: 'same-level-flat-course-enters-272mm-zone', level, xy });
    }
    if (xy.status === 'no-overlap') {
      return Object.freeze({ status: 'no-overlap', reasonCode: 'xy-polygons-separated', level, xy });
    }
    return Object.freeze({ status: 'indeterminate', reasonCode: 'xy-classification-indeterminate', level, xy });
  }

  return Object.freeze({
    CM_TO_MM,
    connectorRecords,
    isApprovedFlatLowerDefinition,
    slopePlacementMmFromEditorPart,
    baseLevelRelation,
    classifyApprovedSlopeUnderpassPair
  });
});
