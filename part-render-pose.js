(() => {
  'use strict';

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const normalizeAngle = value => ((finite(value) % 360) + 360) % 360;

  function resolvePartPose(part = {}) {
    return Object.freeze({
      rotation: finite(part.rotation),
      cornerMirror: Boolean(part.cornerMirror),
      handedness: part.appliedHandedness || part.handedness || part.cornerHandedness || null
    });
  }

  function cornerGeometry(definition) {
    const trackWidth = finite(definition?.geometry?.outerRadius) - finite(definition?.geometry?.innerRadius);
    const r = finite(definition?.geometry?.centerlineRadius, finite(definition?.radius, 54));
    const angle = Math.PI / 4;
    const ri = finite(definition?.geometry?.innerRadius, r - trackWidth / 2);
    const ro = finite(definition?.geometry?.outerRadius, r + trackWidth / 2);
    const radialCentroid = (4 * Math.sin(angle / 2) / (3 * angle)) * ((ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2));
    const bisector = -3 * Math.PI / 8;
    const center = { x: -radialCentroid * Math.cos(bisector), y: -radialCentroid * Math.sin(bisector) };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI / 4;
    const entry = { x: center.x + r * Math.cos(startAngle), y: center.y + r * Math.sin(startAngle) };
    const exit = { x: center.x + r * Math.cos(endAngle), y: center.y + r * Math.sin(endAngle) };
    const points = localCornerPath(definition, 48, { r, ri, ro, center, startAngle, endAngle });
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    return { r, ri, ro, entry, exit, center, startAngle, endAngle, bounds: { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY } };
  }

  function localCornerPath(definition, samples = 48, resolvedGeometry = null) {
    const g = resolvedGeometry || cornerGeometry(definition);
    const count = Math.max(1, Math.round(finite(samples, 48)));
    const points = [];
    for (let index = 0; index <= count; index++) {
      const angle = g.startAngle + (g.endAngle - g.startAngle) * index / count;
      points.push({ x: g.center.x + g.ro * Math.cos(angle), y: g.center.y + g.ro * Math.sin(angle) });
    }
    for (let index = count; index >= 0; index--) {
      const angle = g.startAngle + (g.endAngle - g.startAngle) * index / count;
      points.push({ x: g.center.x + g.ri * Math.cos(angle), y: g.center.y + g.ri * Math.sin(angle) });
    }
    return points;
  }

  function transformPoint(part, point) {
    const pose = resolvePartPose(part);
    const localX = finite(point?.x);
    const localY = pose.cornerMirror ? -finite(point?.y) : finite(point?.y);
    const radians = pose.rotation * Math.PI / 180;
    return {
      x: finite(part?.x) + localX * Math.cos(radians) - localY * Math.sin(radians),
      y: finite(part?.y) + localX * Math.sin(radians) + localY * Math.cos(radians)
    };
  }

  function tracePartPath(definition, part, samples = 48) {
    if (!definition) return [];
    const local = definition.corner45
      ? localCornerPath(definition, samples)
      : [
          { x: finite(definition.geometry?.bounds?.minX, -finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.minY, -finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.maxX, finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.minY, -finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.maxX, finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.maxY, finite(definition.h) / 2) },
          { x: finite(definition.geometry?.bounds?.minX, -finite(definition.w) / 2), y: finite(definition.geometry?.bounds?.maxY, finite(definition.h) / 2) }
        ];
    return local.map(point => transformPoint(part, point));
  }

  function traceConnectors(definition, part) {
    return (definition?.geometry?.connectors || []).map((connector, index) => {
      const pose = resolvePartPose(part);
      const point = transformPoint(part, { x: connector.x, y: connector.y });
      const localHeading = pose.cornerMirror ? -finite(connector.heading) : finite(connector.heading);
      return {
        id: connector.id || (index === 0 ? 'a' : 'b'),
        x: point.x,
        y: point.y,
        heading: normalizeAngle(localHeading + pose.rotation)
      };
    });
  }

  function tracePart(definition, part, samples = 48) {
    return {
      pose: resolvePartPose(part),
      shapeVariant: definition?.renderKind || part?.type || null,
      path: tracePartPath(definition, part, samples),
      connectors: traceConnectors(definition, part)
    };
  }

  const api = Object.freeze({
    resolvePartPose,
    cornerGeometry,
    localCornerPath,
    transformPoint,
    tracePartPath,
    traceConnectors,
    tracePart
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.M4WD_PART_RENDER_POSE = api;
})();
