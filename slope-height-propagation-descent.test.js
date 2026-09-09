'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('./layout-graph.js');
const runtime = require('./slope-height-propagation-runtime.js');

function connector(id, x, localZMm, heading) {
  return {
    id,
    label: id,
    x,
    y: 0,
    localZMm,
    heading,
    pitchDeg: 0,
    bankAngleDeg: 0,
    shape: 'jcjc-3lane',
    laneCount: 3
  };
}

const straightGeometry = Object.freeze({
  width: 54,
  height: 36,
  connectors: Object.freeze([
    Object.freeze(connector('a', -27, 0, 180)),
    Object.freeze(connector('b', 27, 0, 0))
  ]),
  bounds: Object.freeze({ minX: -27, maxX: 27, minY: -18, maxY: 18 })
});

const catalog = Object.freeze({
  start: Object.freeze({ w: 54, h: 36, geometry: straightGeometry }),
  straight: Object.freeze({ w: 54, h: 36, geometry: straightGeometry }),
  slope: Object.freeze({
    w: 54,
    h: 36,
    slope: true,
    geometry: Object.freeze({
      width: 54,
      height: 36,
      connectors: Object.freeze([
        Object.freeze(connector('a', -27, 0, 180)),
        Object.freeze(connector('b', 27, 115, 0))
      ]),
      bounds: Object.freeze({ minX: -27, maxX: 27, minY: -18, maxY: 18 })
    })
  })
});

function part(id, type, x, y = 100, rotation = 0, zMm = 0) {
  return { id, type, x, y, rotation, zMm, pitchDeg: 0, bankAngleDeg: 0, zOrder: 1 };
}

function edge(partAId, connectorAId, partBId, connectorBId, createdOrder) {
  return { partAId, connectorAId, partBId, connectorBId, createdOrder };
}

function interferenceWarnings(parts, edges) {
  return graph.interferenceWarnings(
    parts,
    catalog,
    value => graph.polygonBounds(graph.occupancyPolygon(value, catalog[value.type])),
    { edges }
  );
}

test('後付けの下りスロープは115mmの既存下流コース全体を0mmへ1段下げる', () => {
  const start = part('start', 'start', 100, 100, 0, 0);
  const slopeUp = part('slope-up', 'slope', 154, 100, 0, 0);
  const highApproach = part('high-approach', 'straight', 208, 100, 0, 115);
  const slopeDown = part('slope-down', 'slope', 262, 100, 180, 0);
  const downstream1 = part('down-1', 'straight', 316, 100, 0, 115);
  const downstream2 = part('down-2', 'straight', 370, 100, 0, 115);
  const elevatedCrossing = part('elevated-cross', 'straight', 316, 100, 90, 115);
  const parts = [start, slopeUp, highApproach, slopeDown, downstream1, downstream2, elevatedCrossing];
  const edges = [
    edge('start', 'b', 'slope-up', 'a', 1),
    edge('slope-up', 'b', 'high-approach', 'a', 2),
    edge('high-approach', 'b', 'slope-down', 'b', 3),
    edge('down-1', 'b', 'down-2', 'a', 4)
  ];

  assert.ok(interferenceWarnings(parts, edges).some(warning => warning.type === 'interference'
    && warning.partIds.includes('down-1') && warning.partIds.includes('elevated-cross')),
  '補正前は既存下流コースと115mmの交差コースが同じ高さなので干渉する');

  const root = { M4WD_LAYOUT_GRAPH: graph };
  assert.equal(runtime.install(root), true);
  const edgeWarnings = root.M4WD_LAYOUT_GRAPH.validateEdges(parts, catalog, edges);

  assert.equal(start.zMm, 0, 'Startは地上のまま');
  assert.equal(slopeUp.zMm, 0, '先行する上りスロープは変更しない');
  assert.equal(highApproach.zMm, 115, '下りスロープ手前の高架区間は115mmを維持する');
  assert.equal(slopeDown.zMm, 0, '下りスロープは高端115mm・低端0mmを維持する');
  assert.equal(downstream1.zMm, 0, '下りスロープ直後の既存コースを115mmから0mmへ下げる');
  assert.equal(downstream2.zMm, 0, '既に接続済みの下流コース全体を0mmへ下げる');
  assert.equal(elevatedCrossing.zMm, 115, '下流コンポーネント外の高架交差コースは動かさない');
  assert.ok(edges.some(value => {
    const ids = new Set([value.partAId, value.partBId]);
    return ids.has('slope-down') && ids.has('down-1');
  }), '下りスロープ低端と0mmへ下げた既存コースを正式edgeで接続する');
  assert.equal(edgeWarnings.some(warning => warning.type === 'height-mismatch'), false,
    '下り補正後の正式接続に高さ不一致がない');
  assert.equal(interferenceWarnings(parts, edges).some(warning => warning.type === 'interference'
    && warning.partIds.includes('down-1') && warning.partIds.includes('elevated-cross')), false,
  '1段下がった後は115mm側に残った古い干渉警告が消える');

  const zBeforeSecondPass = parts.map(value => [value.id, value.zMm]);
  root.M4WD_LAYOUT_GRAPH.validateEdges(parts, catalog, edges);
  assert.deepEqual(parts.map(value => [value.id, value.zMm]), zBeforeSecondPass,
    '再計算しても二重に-115mmしない');
});
