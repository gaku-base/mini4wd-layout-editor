(function attachUnavailableAreaTransform(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_UNAVAILABLE_AREA_TRANSFORM = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  'use strict';

  const CORNERS = Object.freeze([
    Object.freeze({ key: 'nw', sx: -1, sy: -1 }),
    Object.freeze({ key: 'ne', sx: 1, sy: -1 }),
    Object.freeze({ key: 'se', sx: 1, sy: 1 }),
    Object.freeze({ key: 'sw', sx: -1, sy: 1 })
  ]);

  function normalizeIntegerRotation(value) {
    const rotation = Number(value);
    if (!Number.isInteger(rotation)) return null;
    return ((rotation % 360) + 360) % 360;
  }

  function snapValue(value, gridCm, precise = false) {
    const step = precise ? 1 : Math.max(1, Number(gridCm) || 1);
    return Math.round(Number(value) / step) * step;
  }

  function axes(rotation) {
    const radians = (normalizeIntegerRotation(rotation) ?? 0) * Math.PI / 180;
    return {
      x: { x: Math.cos(radians), y: Math.sin(radians) },
      y: { x: -Math.sin(radians), y: Math.cos(radians) }
    };
  }

  function pointForSigns(area, sx, sy) {
    const basis = axes(area.rotation);
    return {
      x: Number(area.x) + basis.x.x * Number(area.widthCm) * sx / 2 + basis.y.x * Number(area.depthCm) * sy / 2,
      y: Number(area.y) + basis.x.y * Number(area.widthCm) * sx / 2 + basis.y.y * Number(area.depthCm) * sy / 2
    };
  }

  function cornerPoints(area) {
    return CORNERS.map(corner => ({ ...corner, ...pointForSigns(area, corner.sx, corner.sy) }));
  }

  function edgeGeometry(area, offsetCm = 0) {
    const basis = axes(area.rotation);
    const halfWidth = Number(area.widthCm) / 2;
    const halfDepth = Number(area.depthCm) / 2;
    const center = { x: Number(area.x), y: Number(area.y) };
    const make = (key, dimension, axis, normal, distance) => ({
      key, dimension,
      x: center.x + normal.x * (distance + offsetCm),
      y: center.y + normal.y * (distance + offsetCm),
      rotation: Math.atan2(axis.y, axis.x) * 180 / Math.PI
    });
    return [
      make('top', 'width', basis.x, { x: -basis.y.x, y: -basis.y.y }, halfDepth),
      make('right', 'depth', basis.y, basis.x, halfWidth),
      make('bottom', 'width', basis.x, basis.y, halfDepth),
      make('left', 'depth', basis.y, { x: -basis.x.x, y: -basis.x.y }, halfWidth)
    ];
  }

  function moveTo(area, pointer, offset, gridCm, precise = false) {
    if (!area || area.locked) return null;
    return {
      ...area,
      x: snapValue(Number(pointer.x) - Number(offset?.x || 0), gridCm, precise),
      y: snapValue(Number(pointer.y) - Number(offset?.y || 0), gridCm, precise)
    };
  }

  function resizeFromCorner(area, cornerKey, pointer, gridCm, precise = false, minimumCm = 1) {
    if (!area || area.locked) return null;
    const corner = CORNERS.find(item => item.key === cornerKey);
    if (!corner || !pointer) return null;
    const basis = axes(area.rotation);
    const opposite = pointForSigns(area, -corner.sx, -corner.sy);
    const dx = Number(pointer.x) - opposite.x;
    const dy = Number(pointer.y) - opposite.y;
    const signedWidth = dx * basis.x.x + dy * basis.x.y;
    const signedDepth = dx * basis.y.x + dy * basis.y.y;
    if (signedWidth * corner.sx <= 0 || signedDepth * corner.sy <= 0) return null;
    const widthCm = Math.max(minimumCm, snapValue(Math.abs(signedWidth), gridCm, precise));
    const depthCm = Math.max(minimumCm, snapValue(Math.abs(signedDepth), gridCm, precise));
    const dragged = {
      x: opposite.x + basis.x.x * corner.sx * widthCm + basis.y.x * corner.sy * depthCm,
      y: opposite.y + basis.x.y * corner.sx * widthCm + basis.y.y * corner.sy * depthCm
    };
    return {
      ...area,
      x: (opposite.x + dragged.x) / 2,
      y: (opposite.y + dragged.y) / 2,
      widthCm,
      depthCm
    };
  }

  function resizeAroundCenter(area, dimension, centimetres) {
    const size = Number(centimetres);
    if (!area || area.locked || !Number.isInteger(size) || size < 1) return null;
    if (dimension === 'width') return { ...area, widthCm: size };
    if (dimension === 'depth') return { ...area, depthCm: size };
    return null;
  }

  function hitCorner(area, point, radiusCm) {
    let best = null;
    for (const corner of cornerPoints(area)) {
      const distance = Math.hypot(Number(point.x) - corner.x, Number(point.y) - corner.y);
      if (distance <= radiusCm && (!best || distance < best.distance)) best = { ...corner, distance };
    }
    return best;
  }

  return Object.freeze({
    CORNERS, normalizeIntegerRotation, snapValue, axes, pointForSigns,
    cornerPoints, edgeGeometry, moveTo, resizeFromCorner, resizeAroundCenter, hitCorner
  });
}));
