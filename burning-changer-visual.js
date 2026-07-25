(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_BURNING_CHANGER_VISUAL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROFILE_VERSION = 'rc1-formal-v1';

  function finite(value, label) {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
    return value;
  }

  function pointOnCubic(curve, t) {
    const u = 1 - t;
    return {
      x: u ** 3 * curve.start.x + 3 * u ** 2 * t * curve.control1.x +
        3 * u * t ** 2 * curve.control2.x + t ** 3 * curve.end.x,
      y: u ** 3 * curve.start.y + 3 * u ** 2 * t * curve.control1.y +
        3 * u * t ** 2 * curve.control2.y + t ** 3 * curve.end.y
    };
  }

  function tangentOnCubic(curve, t) {
    const u = 1 - t;
    return {
      x: 3 * u ** 2 * (curve.control1.x - curve.start.x) +
        6 * u * t * (curve.control2.x - curve.control1.x) +
        3 * t ** 2 * (curve.end.x - curve.control2.x),
      y: 3 * u ** 2 * (curve.control1.y - curve.start.y) +
        6 * u * t * (curve.control2.y - curve.control1.y) +
        3 * t ** 2 * (curve.end.y - curve.control2.y)
    };
  }

  function perpendicularSeam(point, tangent, width) {
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const dx = -tangent.y / length * width / 2;
    const dy = tangent.x / length * width / 2;
    return Object.freeze({
      start: Object.freeze({ x: point.x - dx, y: point.y - dy }),
      end: Object.freeze({ x: point.x + dx, y: point.y + dy })
    });
  }

  function createGeometry(source) {
    if (!source || typeof source !== 'object') throw new Error('burning changer geometry is required');
    const width = finite(source.width, 'width');
    const height = finite(source.height, 'height');
    const trackWidth = finite(source.trackWidth, 'trackWidth');
    const centerlineRadius = finite(source.centerlineRadius, 'centerlineRadius');
    const innerRadius = finite(source.innerRadius, 'innerRadius');
    const outerRadius = finite(source.outerRadius, 'outerRadius');
    const leftX = finite(source.endpointX, 'endpointX');
    const endpointY = finite(source.endpointY, 'endpointY');
    const arcCenterX = finite(source.arcCenterX, 'arcCenterX');
    if (width <= 0 || height <= 0 || trackWidth <= 0) throw new Error('burning changer dimensions must be positive');
    if (innerRadius <= 0 || centerlineRadius <= innerRadius || outerRadius <= centerlineRadius) {
      throw new Error('burning changer radii are inconsistent');
    }

    const laneWidth = trackWidth / 3;
    const topY = -endpointY;
    const bottomY = endpointY;
    const straightSeamX = leftX + (arcCenterX - leftX) / 2;
    const bridgeApproachX = leftX + (arcCenterX - leftX) * .35;
    const bridgeControlX = arcCenterX - laneWidth;
    const bridgeTopY = topY + laneWidth;
    const bridgeBottomY = bottomY - laneWidth;
    const curve = Object.freeze({
      start: Object.freeze({ x: bridgeApproachX, y: bridgeTopY }),
      control1: Object.freeze({ x: bridgeControlX, y: bridgeTopY }),
      control2: Object.freeze({ x: bridgeControlX, y: bridgeBottomY }),
      end: Object.freeze({ x: bridgeApproachX, y: bridgeBottomY })
    });

    const radialSeam = angle => Object.freeze({
      start: Object.freeze({
        x: arcCenterX + innerRadius * Math.cos(angle),
        y: innerRadius * Math.sin(angle)
      }),
      end: Object.freeze({
        x: arcCenterX + outerRadius * Math.cos(angle),
        y: outerRadius * Math.sin(angle)
      })
    });
    const straightSeam = y => Object.freeze({
      start: Object.freeze({ x: straightSeamX, y: y - trackWidth / 2 }),
      end: Object.freeze({ x: straightSeamX, y: y + trackWidth / 2 })
    });

    const bridgeSeams = [
      perpendicularSeam(curve.start, { x: 1, y: 0 }, laneWidth),
      perpendicularSeam(pointOnCubic(curve, .32), tangentOnCubic(curve, .32), laneWidth),
      perpendicularSeam(pointOnCubic(curve, .68), tangentOnCubic(curve, .68), laneWidth),
      perpendicularSeam(curve.end, { x: -1, y: 0 }, laneWidth)
    ];

    const connectors = Array.from(source.connectors || [
      { x: leftX, y: topY, heading: 180 },
      { x: leftX, y: bottomY, heading: 180 }
    ], connector => Object.freeze({
      x: finite(connector.x, 'connector.x'),
      y: finite(connector.y, 'connector.y'),
      heading: finite(connector.heading, 'connector.heading')
    }));

    return Object.freeze({
      version: PROFILE_VERSION,
      width,
      height,
      trackWidth,
      laneWidth,
      leftX,
      topY,
      bottomY,
      arcCenterX,
      centerlineRadius,
      innerRadius,
      outerRadius,
      connectors: Object.freeze(connectors),
      laneOffsets: Object.freeze([-laneWidth / 2, laneWidth / 2]),
      baseSeams: Object.freeze([
        straightSeam(topY),
        ...[-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2].map(radialSeam),
        straightSeam(bottomY)
      ]),
      bridge: Object.freeze({
        start: Object.freeze({ x: leftX, y: bridgeTopY }),
        approachStart: curve.start,
        curve,
        approachEnd: curve.end,
        end: Object.freeze({ x: leftX, y: bridgeBottomY }),
        width: laneWidth,
        edgeWidth: laneWidth + 1.6,
        seams: Object.freeze(bridgeSeams)
      }),
      bounds: Object.freeze({
        minX: finite(source.bounds?.minX ?? leftX, 'bounds.minX'),
        maxX: finite(source.bounds?.maxX ?? arcCenterX + outerRadius, 'bounds.maxX'),
        minY: finite(source.bounds?.minY ?? -outerRadius, 'bounds.minY'),
        maxY: finite(source.bounds?.maxY ?? outerRadius, 'bounds.maxY')
      })
    });
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator)) : 0;
    return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
  }

  function distanceToBridge(point, bridge) {
    let distance = distanceToSegment(point, bridge.start, bridge.approachStart);
    let previous = bridge.curve.start;
    for (let index = 1; index <= 80; index++) {
      const current = pointOnCubic(bridge.curve, index / 80);
      distance = Math.min(distance, distanceToSegment(point, previous, current));
      previous = current;
    }
    return Math.min(distance, distanceToSegment(point, bridge.approachEnd, bridge.end));
  }

  function distanceToBase(point, geometry) {
    const top = distanceToSegment(point, { x: geometry.leftX, y: geometry.topY }, { x: geometry.arcCenterX, y: geometry.topY });
    const bottom = distanceToSegment(point, { x: geometry.arcCenterX, y: geometry.bottomY }, { x: geometry.leftX, y: geometry.bottomY });
    const dx = point.x - geometry.arcCenterX;
    const dy = point.y;
    const angle = Math.atan2(dy, dx);
    const arc = angle >= -Math.PI / 2 && angle <= Math.PI / 2
      ? Math.abs(Math.hypot(dx, dy) - geometry.centerlineRadius)
      : Infinity;
    return Math.min(top, bottom, arc);
  }

  function containsPoint(point, geometry, tolerance = 0) {
    return distanceToBase(point, geometry) <= geometry.trackWidth / 2 + tolerance ||
      distanceToBridge(point, geometry.bridge) <= geometry.bridge.edgeWidth / 2 + tolerance;
  }

  return Object.freeze({
    PROFILE_VERSION,
    createGeometry,
    containsPoint,
    pointOnCubic,
    tangentOnCubic
  });
});
