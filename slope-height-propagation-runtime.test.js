'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const graph = require('./layout-graph.js');
const runtime = require('./slope-height-propagation-runtime.js');

function connector(id, label, x, localZMm, heading) {
  return { id, label, x, y: 0, localZMm, heading, pitchDeg: 0, bankAngleDeg: 0, shape: 'jcjc-3lane', laneCount: 3 };
}

const straightGeometry = Object.freeze({
  width: 54,
  height: 36,
  connectors: Object.freeze([
    Object.freeze(connector('a', '左端', -27, 0, 180)),
    Object.freeze(connector('b', '右端', 27, 0, 0))
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
        Object.freeze(connector('a', '低端', -27, 0, 180)),
        Object.freeze(connector('b', '高端', 27, 115, 0))
      ]),
      bounds: Object.freeze({ minX: -27, maxX: 27, minY: -18, maxY: 18 })
    })
  })
});

function part(id, type, x, y = 100, rotation = 0, zMm = 0) {
  return { id, type, x, y, rotation, zMm, pitchDeg: 0, bankAngleDeg: 0, zOrder: 1 };
}

function edge(partAId, connectorAId, partBId, connectorBId, createdOrder = 1) {
  return { partAId, connectorAId, partBId, connectorBId, createdOrder };
}

function warnings(parts, edges) {
  return graph.interferenceWarnings(
    parts,
    catalog,
    value => graph.polygonBounds(graph.occupancyPolygon(value, catalog[value.type])),
    { edges }
  );
}

test('後付けスロープの高端が一意に既存コースへ合うと下流コンポーネント全体を115mm持ち上げる', () => {
  const start = part('start', 'start', 100);
  const slope = part('slope', 'slope', 154);
  const downstream1 = part('down-1', 'straight', 208);
  const downstream2 = part('down-2', 'straight', 262);
  const crossing = part('cross', 'straight', 208, 100, 90, 0);
  const parts = [start, slope, downstream1, downstream2, crossing];
  const edges = [
    edge('start', 'b', 'slope', 'a', 1),
    edge('down-1', 'b', 'down-2', 'a', 2)
  ];

  assert.ok(warnings(parts, edges).some(warning => warning.type === 'interference'
    && warning.partIds.includes('down-1') && warning.partIds.includes('cross')),
  '修正前は同じ高さで交差する既存コースに干渉警告がある');

  const result = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);

  assert.equal(result.changed, true);
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.adjustments[0].deltaMm, 115);
  assert.deepEqual(new Set(result.adjustments[0].shiftedPartIds), new Set(['down-1', 'down-2']));
  assert.equal(slope.zMm, 0, 'スロープ低端側の基準高さは変更しない');
  assert.equal(downstream1.zMm, 115, 'スロープの先頭パーツを1段上げる');
  assert.equal(downstream2.zMm, 115, '既に接続済みの下流コースも一緒に1段上げる');
  assert.equal(crossing.zMm, 0, '下流コンポーネント外の交差コースは動かさない');
  assert.equal(edges.length, 3, 'スロープ高端と既存コースの空き端を正式edgeで接続する');
  assert.ok(edges.some(value => [value.partAId, value.partBId].includes('slope')
    && [value.partAId, value.partBId].includes('down-1')));
  assert.equal(warnings(parts, edges).some(warning => warning.type === 'interference'
    && warning.partIds.includes('down-1') && warning.partIds.includes('cross')), false,
  '1段上がった後は元の高さ干渉警告が消える');

  const again = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
  assert.equal(again.changed, false, '同じレイアウトへ再適用しても二重に持ち上げない');
  assert.equal(downstream1.zMm, 115);
  assert.equal(downstream2.zMm, 115);
  assert.equal(edges.length, 3);
});

test('候補が2本ある曖昧な接続点では高さを勝手に変更しない', () => {
  const parts = [
    part('start', 'start', 100),
    part('slope', 'slope', 154),
    part('candidate-a', 'straight', 208),
    part('candidate-b', 'straight', 208)
  ];
  const edges = [edge('start', 'b', 'slope', 'a')];

  const result = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
  assert.equal(result.changed, false);
  assert.ok(result.skippedAmbiguous >= 1);
  assert.equal(parts[2].zMm, 0);
  assert.equal(parts[3].zMm, 0);
  assert.equal(edges.length, 1);
});

test('候補側コネクタが使用済みなら既存edgeを奪わず何もしない', () => {
  const parts = [
    part('start', 'start', 100),
    part('slope', 'slope', 154),
    part('candidate', 'straight', 208),
    part('owner', 'straight', 154)
  ];
  const edges = [
    edge('start', 'b', 'slope', 'a', 1),
    edge('candidate', 'a', 'owner', 'b', 2)
  ];

  const result = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
  assert.equal(result.changed, false);
  assert.equal(parts.find(value => value.id === 'candidate').zMm, 0);
  assert.equal(edges.length, 2);
});

test('スロープ側コンポーネントがStartにつながっていない場合は高さ伝播しない', () => {
  const parts = [
    part('start', 'start', 10),
    part('upstream', 'straight', 100),
    part('slope', 'slope', 154),
    part('candidate', 'straight', 208)
  ];
  const edges = [edge('upstream', 'b', 'slope', 'a')];

  const result = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
  assert.equal(result.changed, false);
  assert.equal(parts.find(value => value.id === 'candidate').zMm, 0);
  assert.equal(edges.length, 1);
});

test('1段下げる補正で下流が0mm未満になる場合はfail-closedで変更しない', () => {
  const start = part('start', 'start', 100, 100, 0, 0);
  const slope = part('slope', 'slope', 154, 100, 180, -115);
  const candidate = part('candidate', 'straight', 100, 100, 0, 0);
  const parts = [start, slope, candidate];
  const edges = [edge('start', 'b', 'slope', 'b')];

  const result = runtime.reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
  assert.equal(result.changed, false);
  assert.equal(candidate.zMm, 0);
});

test('validateEdges wrapper runs reconciliation before edge validation', () => {
  const root = { M4WD_LAYOUT_GRAPH: graph };
  assert.equal(runtime.install(root), true);
  assert.equal(root.M4WD_LAYOUT_GRAPH[runtime.WRAP_MARKER], true);

  const parts = [part('start', 'start', 100), part('slope', 'slope', 154), part('down', 'straight', 208)];
  const edges = [edge('start', 'b', 'slope', 'a')];
  const edgeWarnings = root.M4WD_LAYOUT_GRAPH.validateEdges(parts, catalog, edges);

  assert.equal(parts[2].zMm, 115);
  assert.equal(edges.length, 2);
  assert.equal(edgeWarnings.some(warning => warning.type === 'height-mismatch'), false);
});

test('parser preload installs slope height propagation before app.js can capture the graph', () => {
  const source = fs.readFileSync(require.resolve('./slope-underpass-runtime-preload.js'), 'utf8');
  assert.match(source, /M4WD_SLOPE_HEIGHT_PROPAGATION_RUNTIME/);
  assert.match(source, /slope-height-propagation-runtime\.js/);
  assert.ok(source.indexOf('slope-underpass-runtime.js') < source.indexOf('slope-height-propagation-runtime.js'));
});
