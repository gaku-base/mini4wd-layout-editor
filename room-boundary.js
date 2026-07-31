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

  // This geometry intentionally uses the full cutout bounds, not its
  // intersection with the site boundary. Negative distances communicate how
  // far a wall extends outside the room.
  function wallDimensionGeometry(siteBoundary, cutout) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    const bounds = rotatedBounds(cutout);
    return { boundary, bounds, distances: distancesToBoundary(siteBoundary, cutout) };
  }

  // Dimension labels are presentation-only, but keeping their anchor points
  // here makes their midpoint rule testable and independent of canvas zoom.
  function dimensionMidpoint(lineStart = {}, lineEnd = {}) {
    return {
      x: (number(lineStart.x) + number(lineEnd.x)) / 2,
      y: (number(lineStart.y) + number(lineEnd.y)) / 2
    };
  }

  function horizontalDimensionLabelPoint(lineStart = {}, lineEnd = {}) {
    return dimensionMidpoint(lineStart, lineEnd);
  }

  function verticalDimensionLabelPoint(lineStart = {}, lineEnd = {}) {
    return dimensionMidpoint(lineStart, lineEnd);
  }

  function pointKey(point = {}) {
    return `${round10mm(point.x)},${round10mm(point.y)}`;
  }

  function cutoutCornerPoints(cutout) {
    const bounds = rotatedBounds(cutout);
    return [
      { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }
    ].map(point => ({ ...point, key: pointKey(point) }));
  }

  // Build the boundary of siteBoundary - union(cutouts) from the rectangular
  // arrangement. This preserves only edges that actually separate usable room
  // from non-room, so hidden and union-internal cutout corners never appear.
  function effectiveRoomCornerCandidates(siteBoundary, cutouts = [], options = {}) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    const excludedId = options.excludeCutoutId;
    const masks = normalizeRoomCutouts(cutouts)
      .filter(cutout => cutout.visible && cutout.id !== excludedId)
      .map(rotatedBounds)
      .map(bounds => intersection(boundary, bounds))
      .filter(Boolean);
    const xs = [...new Set([boundary.left, boundary.right, ...masks.flatMap(mask => [mask.left, mask.right])])].sort((a, b) => a - b);
    const ys = [...new Set([boundary.top, boundary.bottom, ...masks.flatMap(mask => [mask.top, mask.bottom])])].sort((a, b) => a - b);
    const isRoom = (xIndex, yIndex) => {
      if (xIndex < 0 || yIndex < 0 || xIndex >= xs.length - 1 || yIndex >= ys.length - 1) return false;
      const x = (xs[xIndex] + xs[xIndex + 1]) / 2;
      const y = (ys[yIndex] + ys[yIndex + 1]) / 2;
      return !masks.some(mask => x > mask.left && x < mask.right && y > mask.top && y < mask.bottom);
    };
    const points = new Map();
    const adjacency = new Map();
    const addPoint = (point) => {
      const normalized = { x: round10mm(point.x), y: round10mm(point.y) };
      const key = pointKey(normalized);
      if (!points.has(key)) points.set(key, { ...normalized, key });
      if (!adjacency.has(key)) adjacency.set(key, new Set());
      return key;
    };
    const addEdge = (a, b) => {
      const aKey = addPoint(a); const bKey = addPoint(b);
      adjacency.get(aKey).add(bKey); adjacency.get(bKey).add(aKey);
    };
    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
        if (!isRoom(xIndex, yIndex)) continue;
        const left = xs[xIndex], right = xs[xIndex + 1], top = ys[yIndex], bottom = ys[yIndex + 1];
        if (!isRoom(xIndex - 1, yIndex)) addEdge({ x: left, y: top }, { x: left, y: bottom });
        if (!isRoom(xIndex + 1, yIndex)) addEdge({ x: right, y: top }, { x: right, y: bottom });
        if (!isRoom(xIndex, yIndex - 1)) addEdge({ x: left, y: top }, { x: right, y: top });
        if (!isRoom(xIndex, yIndex + 1)) addEdge({ x: left, y: bottom }, { x: right, y: bottom });
      }
    }
    return [...points.values()]
      .filter(point => {
        const neighbors = [...(adjacency.get(point.key) || [])].map(key => points.get(key));
        if (neighbors.length !== 2) return true;
        // A degree-two vertex on one straight edge is merely a grid split,
        // not an exterior or concave corner.
        return !((neighbors[0].x === point.x && neighbors[1].x === point.x)
          || (neighbors[0].y === point.y && neighbors[1].y === point.y));
      })
      .sort((a, b) => a.x - b.x || a.y - b.y);
  }

  // The same Boolean boundary represented as normalized axis-aligned segments.
  // This is intentionally separate from raw cutout edges: only a real room
  // boundary is eligible for line snapping.
  function effectiveRoomBoundarySegments(siteBoundary, cutouts = [], options = {}) {
    const boundary = rectFrom(normalizeSiteBoundary(siteBoundary));
    const excludedId = options.excludeCutoutId;
    const masks = normalizeRoomCutouts(cutouts)
      .filter(cutout => cutout.visible && cutout.id !== excludedId)
      .map(rotatedBounds).map(bounds => intersection(boundary, bounds)).filter(Boolean);
    const xs = [...new Set([boundary.left, boundary.right, ...masks.flatMap(mask => [mask.left, mask.right])])].sort((a, b) => a - b);
    const ys = [...new Set([boundary.top, boundary.bottom, ...masks.flatMap(mask => [mask.top, mask.bottom])])].sort((a, b) => a - b);
    const isRoom = (xIndex, yIndex) => {
      if (xIndex < 0 || yIndex < 0 || xIndex >= xs.length - 1 || yIndex >= ys.length - 1) return false;
      const x = (xs[xIndex] + xs[xIndex + 1]) / 2;
      const y = (ys[yIndex] + ys[yIndex + 1]) / 2;
      return !masks.some(mask => x > mask.left && x < mask.right && y > mask.top && y < mask.bottom);
    };
    const edges = new Map();
    const add = (a, b) => {
      const horizontal = a.y === b.y;
      const start = horizontal
        ? (a.x <= b.x ? a : b)
        : (a.y <= b.y ? a : b);
      const end = start === a ? b : a;
      const x1 = round10mm(start.x), y1 = round10mm(start.y), x2 = round10mm(end.x), y2 = round10mm(end.y);
      if (x1 === x2 && y1 === y2) return;
      const orientation = y1 === y2 ? 'horizontal' : 'vertical';
      const key = `${orientation}:${x1},${y1}:${x2},${y2}`;
      edges.set(key, { id: key, orientation, x1, y1, x2, y2 });
    };
    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
        if (!isRoom(xIndex, yIndex)) continue;
        const left = xs[xIndex], right = xs[xIndex + 1], top = ys[yIndex], bottom = ys[yIndex + 1];
        if (!isRoom(xIndex - 1, yIndex)) add({ x: left, y: top }, { x: left, y: bottom });
        if (!isRoom(xIndex + 1, yIndex)) add({ x: right, y: top }, { x: right, y: bottom });
        if (!isRoom(xIndex, yIndex - 1)) add({ x: left, y: top }, { x: right, y: top });
        if (!isRoom(xIndex, yIndex + 1)) add({ x: left, y: bottom }, { x: right, y: bottom });
      }
    }
    const merged = [];
    ['horizontal', 'vertical'].forEach(orientation => {
      const groups = new Map();
      [...edges.values()].filter(edge => edge.orientation === orientation).forEach(edge => {
        const fixed = orientation === 'horizontal' ? edge.y1 : edge.x1;
        if (!groups.has(fixed)) groups.set(fixed, []);
        groups.get(fixed).push(edge);
      });
      groups.forEach(group => {
        group.sort((a, b) => (orientation === 'horizontal' ? a.x1 - b.x1 : a.y1 - b.y1));
        let current = { ...group[0] };
        group.slice(1).forEach(edge => {
          const contiguous = orientation === 'horizontal' ? edge.x1 <= current.x2 : edge.y1 <= current.y2;
          if (contiguous) {
            if (orientation === 'horizontal') current.x2 = Math.max(current.x2, edge.x2);
            else current.y2 = Math.max(current.y2, edge.y2);
          } else { merged.push(current); current = { ...edge }; }
        });
        merged.push(current);
      });
    });
    return merged.map(edge => ({ ...edge, id: `${edge.orientation}:${edge.x1},${edge.y1}:${edge.x2},${edge.y2}` }))
      .sort((a, b) => a.orientation.localeCompare(b.orientation) || a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2);
  }

  function closestPointOnBoundarySegment(point = {}, segment = {}) {
    const x = number(point.x), y = number(point.y);
    if (segment.orientation === 'vertical' || number(segment.x1) === number(segment.x2)) {
      return { x: number(segment.x1), y: clampNumber(y, Math.min(number(segment.y1), number(segment.y2)), Math.max(number(segment.y1), number(segment.y2))) };
    }
    return { x: clampNumber(x, Math.min(number(segment.x1), number(segment.x2)), Math.max(number(segment.x1), number(segment.x2))), y: number(segment.y1) };
  }

  function clampNumber(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function selectScreenCornerSnap(pointer = {}, candidates = [], options = {}) {
    const enterPx = number(options.enterPx, 12);
    const exitPx = number(options.exitPx, 18);
    const activeKey = options.activeKey || null;
    const ranked = candidates.map(candidate => ({
      candidate,
      distancePx: Math.hypot(number(candidate.x) - number(pointer.x), number(candidate.y) - number(pointer.y))
    })).sort((a, b) => a.distancePx - b.distancePx || number(a.candidate.x) - number(b.candidate.x) || number(a.candidate.y) - number(b.candidate.y) || String(a.candidate.key).localeCompare(String(b.candidate.key)));
    const active = ranked.find(item => item.candidate.key === activeKey);
    if (active && active.distancePx <= exitPx) return active;
    return ranked.find(item => item.distancePx <= enterPx) || null;
  }

  // Canvas pointer coordinates are CSS pixels relative to the canvas. They
  // must not be multiplied by DPR: the view transform is also in CSS pixels.
  function screenToWorld(point = {}, view = {}) {
    const scale = number(view.scale, 1) || 1;
    return {
      x: (number(point.x) - number(view.offsetX)) / scale,
      y: (number(point.y) - number(view.offsetY)) / scale
    };
  }

  function worldToScreen(point = {}, view = {}) {
    const scale = number(view.scale, 1) || 1;
    return {
      x: number(point.x) * scale + number(view.offsetX),
      y: number(point.y) * scale + number(view.offsetY)
    };
  }

  function beginCutoutDrag(cutout, pointerMm = {}, pointerId = null) {
    const item = normalizeCutout(cutout, { id: cutout?.id || 'cutout-1' });
    return {
      kind: 'move', pointerId, cutoutId: item.id,
      startPointerMm: { x: round10mm(pointerMm.x), y: round10mm(pointerMm.y) },
      startCutoutX: item.x, startCutoutY: item.y
    };
  }

  function cutoutPositionForDrag(drag = {}, pointerMm = {}) {
    return {
      x: round10mm(number(drag.startCutoutX) + round10mm(pointerMm.x) - number(drag.startPointerMm?.x)),
      y: round10mm(number(drag.startCutoutY) + round10mm(pointerMm.y) - number(drag.startPointerMm?.y))
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
    intersection, unionArea, visibleCutoutIntersections, effectiveRoomMetrics, distancesToBoundary, wallDimensionGeometry,
    dimensionMidpoint, horizontalDimensionLabelPoint, verticalDimensionLabelPoint, cutoutCornerPoints, effectiveRoomCornerCandidates, effectiveRoomBoundarySegments, closestPointOnBoundarySegment, selectScreenCornerSnap,
    screenToWorld, worldToScreen, beginCutoutDrag, cutoutPositionForDrag,
    cutoutFromDrag, moveCutout, duplicateCutout, fieldFromSiteBoundary
  });
});
