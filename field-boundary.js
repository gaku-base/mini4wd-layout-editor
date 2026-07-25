(() => {
  'use strict';

  const DEFAULT_MIN_SIZE_CM = 100;
  const DEFAULT_EPSILON_CM = 0.01;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeField(field = {}) {
    return {
      originX: finite(field.originX, 0),
      originY: finite(field.originY, 0),
      widthCm: Math.max(1, finite(field.widthCm, 600)),
      heightCm: Math.max(1, finite(field.heightCm, 400)),
      gridCm: Math.max(1, finite(field.gridCm, 10))
    };
  }

  function fieldBounds(field = {}) {
    const normalized = normalizeField(field);
    return {
      minX: normalized.originX,
      minY: normalized.originY,
      maxX: normalized.originX + normalized.widthCm,
      maxY: normalized.originY + normalized.heightCm,
      w: normalized.widthCm,
      h: normalized.heightCm
    };
  }

  function normalizeBounds(bounds = {}) {
    const rawMinX = finite(bounds.minX, 0);
    const rawMinY = finite(bounds.minY, 0);
    const rawMaxX = finite(bounds.maxX, rawMinX);
    const rawMaxY = finite(bounds.maxY, rawMinY);
    const minX = Math.min(rawMinX, rawMaxX);
    const minY = Math.min(rawMinY, rawMaxY);
    const maxX = Math.max(rawMinX, rawMaxX);
    const maxY = Math.max(rawMinY, rawMaxY);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function containsBounds(field, bounds, epsilonCm = DEFAULT_EPSILON_CM) {
    const frame = fieldBounds(field);
    const target = normalizeBounds(bounds);
    const epsilon = Math.max(0, finite(epsilonCm, DEFAULT_EPSILON_CM));
    return target.minX >= frame.minX - epsilon
      && target.minY >= frame.minY - epsilon
      && target.maxX <= frame.maxX + epsilon
      && target.maxY <= frame.maxY + epsilon;
  }

  function fitFieldToBounds(field, bounds, options = {}) {
    const current = normalizeField(field);
    const target = normalizeBounds(bounds);
    const gridCm = Math.max(1, finite(options.gridCm, current.gridCm));
    const marginCm = Math.max(0, finite(options.marginCm, gridCm));
    const minSizeCm = Math.max(gridCm, finite(options.minSizeCm, DEFAULT_MIN_SIZE_CM));
    const originX = Math.floor((target.minX - marginCm) / gridCm) * gridCm;
    const originY = Math.floor((target.minY - marginCm) / gridCm) * gridCm;
    const requiredMaxX = Math.ceil((target.maxX + marginCm) / gridCm) * gridCm;
    const requiredMaxY = Math.ceil((target.maxY + marginCm) / gridCm) * gridCm;
    return {
      originX,
      originY,
      widthCm: Math.max(minSizeCm, requiredMaxX - originX),
      heightCm: Math.max(minSizeCm, requiredMaxY - originY),
      gridCm
    };
  }

  function sameField(a, b, epsilonCm = 0.0001) {
    const left = normalizeField(a);
    const right = normalizeField(b);
    return ['originX', 'originY', 'widthCm', 'heightCm', 'gridCm']
      .every(key => Math.abs(left[key] - right[key]) <= epsilonCm);
  }

  const api = Object.freeze({
    DEFAULT_MIN_SIZE_CM,
    DEFAULT_EPSILON_CM,
    normalizeField,
    fieldBounds,
    normalizeBounds,
    containsBounds,
    fitFieldToBounds,
    sameField
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.M4WD_FIELD_BOUNDARY = api;
})();
