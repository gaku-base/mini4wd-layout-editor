(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_OBSTACLES = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Obstacles use millimetres at rest.  Their drawing and interaction layer
  // converts only at the canvas boundary, just like room-cutout CAD data.
  const GRID_MM = 10;
  const MIN_SIZE_MM = 10;
  const ROTATIONS = Object.freeze([0, 90, 180, 270]);

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round10mm(value) {
    const result = Math.round(number(value) / GRID_MM) * GRID_MM;
    return Object.is(result, -0) ? 0 : result;
  }

  function size(value, fallback = MIN_SIZE_MM) {
    return Math.max(MIN_SIZE_MM, round10mm(Math.abs(number(value, fallback))));
  }

  function rotation(value) {
    const result = ((Math.round(number(value) / 90) * 90) % 360 + 360) % 360;
    return ROTATIONS.includes(result) ? result : 0;
  }

  function nextObstacleId(values = []) {
    const ids = new Set(values.map(value => String(value?.id || '')));
    let index = 1;
    while (ids.has(`obstacle-${index}`)) index += 1;
    return `obstacle-${index}`;
  }

  function normalizeObstacle(value = {}, options = {}) {
    const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : (options.id || 'obstacle-1');
    return {
      id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : '障害物',
      type: 'obstacle',
      shape: 'rectangle',
      x: round10mm(number(value.x)),
      y: round10mm(number(value.y)),
      width: size(value.width, 500),
      depth: size(value.depth, 500),
      rotation: rotation(value.rotation),
      visible: value.visible !== false,
      locked: value.locked === true
    };
  }

  function normalizeObstacles(values) {
    if (!Array.isArray(values)) return [];
    const ids = new Set();
    return values.map((value, index) => {
      const item = normalizeObstacle(value, { id: `obstacle-${index + 1}` });
      let id = item.id;
      let suffix = 2;
      while (ids.has(id)) id = `${item.id}-${suffix++}`;
      ids.add(id);
      return { ...item, id };
    });
  }

  // The model keeps x/y as the unrotated top-left.  At 90/270 degrees the
  // footprint is rotated around its centre, so its axis-aligned bounds swap.
  function bounds(value) {
    const obstacle = normalizeObstacle(value, { id: value?.id || 'obstacle' });
    if (obstacle.rotation === 0 || obstacle.rotation === 180) {
      return { left: obstacle.x, top: obstacle.y, right: obstacle.x + obstacle.width, bottom: obstacle.y + obstacle.depth };
    }
    const centerX = obstacle.x + obstacle.width / 2;
    const centerY = obstacle.y + obstacle.depth / 2;
    return {
      left: centerX - obstacle.depth / 2,
      top: centerY - obstacle.width / 2,
      right: centerX + obstacle.depth / 2,
      bottom: centerY + obstacle.width / 2
    };
  }

  function intersects(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  function containsPoint(value, point) {
    const box = bounds(value);
    return number(point?.x) >= box.left && number(point?.x) <= box.right
      && number(point?.y) >= box.top && number(point?.y) <= box.bottom;
  }

  function isOutside(value, boundary) {
    const box = bounds(value);
    const room = { left: number(boundary?.x), top: number(boundary?.y), right: number(boundary?.x) + number(boundary?.width), bottom: number(boundary?.y) + number(boundary?.height) };
    return box.left < room.left || box.top < room.top || box.right > room.right || box.bottom > room.bottom;
  }

  function duplicateObstacle(value, existing = []) {
    const item = normalizeObstacle(value);
    return normalizeObstacle({ ...item, id: nextObstacleId(existing), name: `${item.name} コピー`, x: item.x + GRID_MM, y: item.y + GRID_MM });
  }

  return Object.freeze({
    GRID_MM, MIN_SIZE_MM, ROTATIONS, round10mm, normalizeRotation: rotation,
    nextObstacleId, normalizeObstacle, normalizeObstacles, bounds, intersects,
    containsPoint, isOutside, duplicateObstacle
  });
});
