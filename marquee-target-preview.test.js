const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hoverStyleForMode,
  normalizeRect,
  polygonIntersectsRect,
  targetPartsInRect
} = require('./marquee-target-preview.js');

test('marquee preview mirrors the existing hover colors for move, delete, and color modes', () => {
  assert.deepEqual(hoverStyleForMode('move'), {
    stroke: '#55d7ff',
    fill: 'rgba(85,215,255,.18)'
  });
  assert.deepEqual(hoverStyleForMode('delete'), {
    stroke: '#ff5268',
    fill: 'rgba(255,82,104,.22)'
  });
  assert.deepEqual(hoverStyleForMode('color'), {
    stroke: '#c888ff',
    fill: 'rgba(200,136,255,.20)'
  });
});

test('touching the marquee boundary counts as a target', () => {
  const polygon = [
    { x: 10, y: 10 }, { x: 20, y: 10 },
    { x: 20, y: 20 }, { x: 10, y: 20 }
  ];
  assert.equal(polygonIntersectsRect(polygon, normalizeRect({ x: 0, y: 0 }, { x: 10, y: 10 })), true);
  assert.equal(polygonIntersectsRect(polygon, normalizeRect({ x: 0, y: 0 }, { x: 9.99, y: 9.99 })), false);
});

test('targetPartsInRect includes touched regular parts and Start but excludes untouched parts', () => {
  const catalog = {
    PARTS: {
      start: { geometry: { bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 } } },
      straight: { geometry: { bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 } } }
    }
  };
  const graph = {
    occupancyPolygon(part, definition) {
      const bounds = definition.geometry.bounds;
      return [
        { x: part.x + bounds.minX, y: part.y + bounds.minY },
        { x: part.x + bounds.maxX, y: part.y + bounds.minY },
        { x: part.x + bounds.maxX, y: part.y + bounds.maxY },
        { x: part.x + bounds.minX, y: part.y + bounds.maxY }
      ];
    }
  };
  const layout = {
    start: { id: 'start', type: 'start', x: 0, y: 0, rotation: 0 },
    parts: [
      { id: 'part-a', type: 'straight', x: 30, y: 0, rotation: 0 },
      { id: 'part-b', type: 'straight', x: 100, y: 0, rotation: 0 }
    ]
  };
  const rect = normalizeRect({ x: 10, y: -20 }, { x: 40, y: 20 });
  const ids = targetPartsInRect(layout, rect, catalog, graph).map(part => part.id).sort();
  assert.deepEqual(ids, ['part-a', 'start']);
});

test('rotated regular-part bounds still participate in the same touch-based marquee rule', () => {
  const catalog = {
    PARTS: {
      start: { geometry: { bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 } } },
      straight: { geometry: { bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 } } }
    }
  };
  const graph = {
    occupancyPolygon(part, definition) {
      const bounds = definition.geometry.bounds;
      return [
        { x: part.x + bounds.minX, y: part.y + bounds.minY },
        { x: part.x + bounds.maxX, y: part.y + bounds.minY },
        { x: part.x + bounds.maxX, y: part.y + bounds.maxY },
        { x: part.x + bounds.minX, y: part.y + bounds.maxY }
      ];
    }
  };
  const layout = {
    start: null,
    parts: [{ id: 'rotated', type: 'straight', x: 0, y: 0, rotation: 90 }]
  };
  const ids = targetPartsInRect(layout, normalizeRect({ x: 4.9, y: 9.9 }, { x: 5, y: 10 }), catalog, graph)
    .map(part => part.id);
  assert.deepEqual(ids, ['rotated']);
});
