(function attachObstacleGeometry(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_OBSTACLE_GEOMETRY = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  const EPSILON = 1e-7;
  const finite = value => Number.isFinite(Number(value));
  const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;

  function normalizeRotation(value) {
    const rotation = number(value);
    return ((rotation % 360) + 360) % 360;
  }

  function corners(obstacle = {}) {
    const x = number(obstacle.x);
    const y = number(obstacle.y);
    const halfWidth = number(obstacle.widthCm) / 2;
    const halfDepth = number(obstacle.depthCm) / 2;
    const radians = normalizeRotation(obstacle.rotation) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return [
      { x: -halfWidth, y: -halfDepth }, { x: halfWidth, y: -halfDepth },
      { x: halfWidth, y: halfDepth }, { x: -halfWidth, y: halfDepth }
    ].map(point => ({ x: x + point.x * cos - point.y * sin, y: y + point.x * sin + point.y * cos }));
  }

  function pointInPolygon(point, polygon = []) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const a = polygon[index];
      const b = polygon[previous];
      const intersects = ((a.y > point.y) !== (b.y > point.y))
        && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function orientation(a, b, c) {
    const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return Math.abs(value) < EPSILON ? 0 : value > 0 ? 1 : -1;
  }

  function onSegment(a, point, b) {
    return point.x <= Math.max(a.x, b.x) + EPSILON && point.x + EPSILON >= Math.min(a.x, b.x)
      && point.y <= Math.max(a.y, b.y) + EPSILON && point.y + EPSILON >= Math.min(a.y, b.y);
  }

  function segmentsIntersect(a, b, c, d) {
    const one = orientation(a, b, c);
    const two = orientation(a, b, d);
    const three = orientation(c, d, a);
    const four = orientation(c, d, b);
    if (one !== two && three !== four) return true;
    return (one === 0 && onSegment(a, c, b)) || (two === 0 && onSegment(a, d, b))
      || (three === 0 && onSegment(c, a, d)) || (four === 0 && onSegment(c, b, d));
  }

  function polygonsIntersect(first = [], second = []) {
    if (first.length < 3 || second.length < 3) return false;
    if (first.some(point => pointInPolygon(point, second)) || second.some(point => pointInPolygon(point, first))) return true;
    return first.some((point, index) => second.some((other, otherIndex) => segmentsIntersect(
      point, first[(index + 1) % first.length], other, second[(otherIndex + 1) % second.length]
    )));
  }

  function rectanglePolygon(bounds = {}) {
    return [
      { x: number(bounds.left), y: number(bounds.top) }, { x: number(bounds.right), y: number(bounds.top) },
      { x: number(bounds.right), y: number(bounds.bottom) }, { x: number(bounds.left), y: number(bounds.bottom) }
    ];
  }

  function placementValidity(obstacle, siteBoundary, cutoutBounds = []) {
    const polygon = corners(obstacle);
    const boundary = rectanglePolygon(siteBoundary);
    if (!polygon.every(point => pointInPolygon(point, boundary) || pointOnPolygon(point, boundary))) return { valid: false, reason: 'outside-space', polygon };
    if (cutoutBounds.some(bounds => polygonsIntersect(polygon, rectanglePolygon(bounds)))) return { valid: false, reason: 'room-cutout', polygon };
    return { valid: true, reason: null, polygon };
  }

  function pointOnPolygon(point, polygon) {
    return polygon.some((corner, index) => orientation(corner, polygon[(index + 1) % polygon.length], point) === 0
      && onSegment(corner, point, polygon[(index + 1) % polygon.length]));
  }

  return Object.freeze({ normalizeRotation, corners, pointInPolygon, segmentsIntersect, polygonsIntersect, rectanglePolygon, placementValidity });
}));
