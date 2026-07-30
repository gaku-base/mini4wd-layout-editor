(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_ROOM_BOUNDARY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Room CAD data is deliberately independent of the legacy course field.
  // All persisted CAD values are millimetres; the app converts at its canvas edge.
  const GRID_MM = 10;
  const MIN_SIZE_MM = 10;
  const RECTANGLE = 'rectangle';
  const CUTOUT_TYPE = 'room-cutout';

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round10mm(value) {
    const rounded = Math.round(number(value) / GRID_MM) * GRID_MM;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function positiveSize(value, fallback = MIN_SIZE_MM) {
    return Math.max(MIN_SIZE_MM, round10mm(Math.abs(number(value, fallback))));
  }

  function normalizeRotation(value) {
    const normalized = ((Math.round(number(value) / 90) * 90) % 360 + 360) % 360;
    return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
  }

  function defaultSiteBoundary(field = {}) {
    return normalizeSiteBoundary({
      name: '設置範囲',
      shape: RECTANGLE,
      x: number(field.originX) * 10,
      y: number(field.originY) * 10,
      width: number(field.widthCm, 600) * 10,
      height: number(field.heightCm, 400) * 10,
      visible: true
    });
  }

  function normalizeSiteBoundary(value = {}, fallback) {
    const base = fallback || { name: '設置範囲', x: 0, y: 0, width: 6000, height: 4000, visible: true };
    return {
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : base.name,
      shape: RECTANGLE,
      x: round10mm(number(value.x, base.x)),
      y: round10mm(number(value.y, base.y)),
      width: positiveSize(value.width, base.width),
      height: positiveSize(value.height, base.height),
      visible: value.visible !== false
    };
  }

  function nextCutoutId(existing = []) {
    const ids = new Set(existing.map(item => String(item?.id || '')));
    let index = 1;
    while (ids.has(`cutout-${index}`)) index += 1;
    return `cutout-${index}`;
  }

  function normalizeCutout(value = {}, options = {}) {
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : (options.id || 'cutout-1');
    return {
      id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : '部屋形状用切り抜き',
      type: CUTOUT_TYPE,
      shape: RECTANGLE,
      x: round10mm(number(value.x)),
      y: round10mm(number(value.y)),
      width: positiveSize(value.width),
      height: positiveSize(value.height),
      rotation: normalizeRotation(value.rotation),
      locked: value.locked === true,
      visible: value.visible !== false
    };
  }

  function normalizeRoomCutouts(values, options = {}) {
    if (!Array.isArray(values)) return [];
    const ids = new Set();
    const normalized = [];
    values.forEach((value, index) => {
      const candidate = normalizeCutout(value, { id: `cutout-${index + 1}` });
      let id = candidate.id;
      if (ids.has(id)) {
        let suffix = 2;
        while (ids.has(`${id}-${suffix}`)) suffix += 1;
        id = `${id}-${suffix}`;
      }
      ids.add(id);
      normalized.push({ ...candidate, id });
    });
    return normalized;
  }

  function rectFrom(object) {
    return {
      left: number(object?.x),
      top: number(object?.y),
      right: number(object?.x) + number(object?.width),
      bottom: number(object?.y) + number(object?.height)
    };
  }

  function rotatedBounds(cutout) {
    const item = normalizeCutout(cutout, { id: cutout?.id || 'cutout' });
    if (item.rotation === 0 || item.rotation === 180) return rectFrom(item);
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    return {
      left: centerX - item.height / 2,
      top: centerY - item.width / 2,
      right: centerX + item.height / 2,
      bottom: centerY + item.width / 2
    };
  }

  function intersection(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  function rectArea(rect) {
    return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
  }

  // Union area for axis-aligned rectangles. Rotation is represented by its
  // exterior bounds in this first rectangular CAD phase.
  function unionArea(rectangles) {
    const rects = rectangles.filter(Boolean);
    const xs = [...new Set(rects.flatMap(rect => [rect.left, rect.right]))].sort((a, b) => a - b);
    let area = 0;
    for (let index = 0; index < xs.length - 1; index += 1) {
      const left = xs[index];
      const right = xs[index + 1];
      if (right <= left) continue;
      const spans = rects.filter(rect => rect.left < right && rect.right > left).map(rect => [rect.top, rect.bottom]).sort((a, b) => a[0] - b[0]);
      let covered = 0;
      let start = null;
      let end = null;
      spans.forEach(([top, bottom]) => {
        if (start === null) { start = top; end = bottom; return; }
        if (top > end) { covered += end - start; start = top; end = bottom; }
        else end = Math.max(end, bottom);
      });
      if (start !== null) covered += end - start;
      area += (right - left) * covered;
    }
    return area;
  }

  // Keep paint geometry independent from Canvas state.  Each returned item is
  // an axis-aligned, closed rectangle inside the site boundary; callers must
  // not join their vertices with lineTo().
  function visibleCutoutIntersections(siteBoundary, cutouts = []) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    return normalizeRoomCutouts(cutouts)
      .filter(cutout => cutout.visible)
      .map(rotatedBounds)
      .map(bounds => intersection(boundary, bounds))
      .filter(Boolean);
  }

  function effectiveRoomMetrics(siteBoundary, cutouts = []) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    const overlaps = visibleCutoutIntersections(siteBoundary, cutouts);
    const cutoutArea = unionArea(overlaps);
    const boundaryArea = rectArea(boundary);
    return { boundary, boundaryArea, cutoutArea, effectiveArea: Math.max(0, boundaryArea - cutoutArea), overlaps };
  }

  function distancesToBoundary(siteBoundary, cutout) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    const bounds = rotatedBounds(cutout);
    return {
      left: round10mm(bounds.left - boundary.left),
      right: round10mm(boundary.right - bounds.right),
      top: round10mm(bounds.top - boundary.top),
      bottom: round10mm(boundary.bottom - bounds.bottom)
    };
  }

  function cutoutFromDrag(start, end, options = {}) {
    const startX = round10mm(start?.x);
    const startY = round10mm(start?.y);
    const endX = round10mm(end?.x);
    const endY = round10mm(end?.y);
    return normalizeCutout({
      ...options,
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.max(MIN_SIZE_MM, Math.abs(endX - startX)),
      height: Math.max(MIN_SIZE_MM, Math.abs(endY - startY))
    }, { id: options.id || 'cutout-1' });
  }

  function moveCutout(cutout, delta) {
    const item = normalizeCutout(cutout, { id: cutout?.id || 'cutout-1' });
    return { ...item, x: round10mm(item.x + number(delta?.x)), y: round10mm(item.y + number(delta?.y)) };
  }

  function duplicateCutout(cutout, existing = []) {
    const item = normalizeCutout(cutout, { id: nextCutoutId(existing) });
    return { ...item, id: nextCutoutId(existing), name: `${item.name}（複製）`, x: round10mm(item.x + 100), y: round10mm(item.y + 100) };
  }

  function fieldFromSiteBoundary(siteBoundary, field = {}) {
    const boundary = normalizeSiteBoundary(siteBoundary);
    return { ...field, originX: boundary.x / 10, originY: boundary.y / 10, widthCm: boundary.width / 10, heightCm: boundary.height / 10 };
  }

  return Object.freeze({
    GRID_MM, MIN_SIZE_MM, RECTANGLE, CUTOUT_TYPE,
    round10mm, normalizeRotation, defaultSiteBoundary, normalizeSiteBoundary,
    normalizeCutout, normalizeRoomCutouts, nextCutoutId, rotatedBounds,
    intersection, unionArea, visibleCutoutIntersections, effectiveRoomMetrics, distancesToBoundary,
    cutoutFromDrag, moveCutout, duplicateCutout, fieldFromSiteBoundary
  });
});
