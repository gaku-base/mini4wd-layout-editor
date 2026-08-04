(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_PART_SEAMS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_STYLE = Object.freeze({
    enabled: true,
    color: 'rgba(73, 77, 75, .58)',
    selectedColor: 'rgba(30, 121, 158, .78)',
    lineWidth: 0.52,
    selectedLineWidth: 0.72,
    edgeInset: 0
  });

  const DEFAULT_CONNECTION_WIDTH_MM = 370;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // The heading points along travel; the connection face is perpendicular to
  // it and therefore remains correct for mirrored and rotated corners.
  function connectorFace(endpoint, options = {}) {
    const widthMm = finite(endpoint?.connectionWidthMm, finite(options.connectionWidthMm, DEFAULT_CONNECTION_WIDTH_MM));
    const insetCm = Math.max(0, finite(options.edgeInsetCm));
    const halfWidthCm = Math.max(0, widthMm / 20 - insetCm);
    const headingDeg = finite(endpoint?.heading ?? endpoint?.directionDeg);
    const headingRad = headingDeg * Math.PI / 180;
    const perpendicular = { x: -Math.sin(headingRad), y: Math.cos(headingRad) };
    const center = { x: finite(endpoint?.x), y: finite(endpoint?.y) };
    return {
      center,
      headingDeg,
      widthMm,
      start: { x: center.x - perpendicular.x * halfWidthCm, y: center.y - perpendicular.y * halfWidthCm },
      end: { x: center.x + perpendicular.x * halfWidthCm, y: center.y + perpendicular.y * halfWidthCm }
    };
  }

  function findConnectedSeams(endpoints, connects) {
    if (!Array.isArray(endpoints) || typeof connects !== 'function') return [];
    const paired = new Set();
    const seams = [];

    for (let i = 0; i < endpoints.length; i++) {
      if (paired.has(i)) continue;
      let bestIndex = -1;
      let bestDistance = Infinity;
      for (let j = i + 1; j < endpoints.length; j++) {
        if (paired.has(j) || !connects(endpoints[i], endpoints[j])) continue;
        const distance = Math.hypot(
          endpoints[i].x - endpoints[j].x,
          endpoints[i].y - endpoints[j].y
        );
        if (distance < bestDistance) {
          bestIndex = j;
          bestDistance = distance;
        }
      }
      if (bestIndex < 0) continue;

      paired.add(i);
      paired.add(bestIndex);
      const first = endpoints[i];
      const second = endpoints[bestIndex];
      seams.push({
        point: {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2
        },
        heading: first.heading,
        endpoints: [first, second]
      });
    }

    return seams;
  }

  function resolveStyle(options = {}) {
    const style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    if (options.enabled === false || style.enabled === false) return null;
    // PNG出力では呼び出し側の選択状態に関係なく通常の継ぎ目に固定する。
    const selected = !!options.selected && !options.exportMode;
    return {
      color: selected ? style.selectedColor : style.color,
      lineWidth: selected ? style.selectedLineWidth : style.lineWidth,
      edgeInset: style.edgeInset
    };
  }

  return Object.freeze({ DEFAULT_STYLE, DEFAULT_CONNECTION_WIDTH_MM, connectorFace, findConnectedSeams, resolveStyle });
});
