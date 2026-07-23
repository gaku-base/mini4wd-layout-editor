'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const seams = require('./part-seams.js');

function loadCatalog() {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, 'part-catalog.js'), 'utf8'),
    context
  );
  return context.window.M4WD_PART_CATALOG;
}

function normalizeRotation(value) {
  return ((value % 360) + 360) % 360;
}

function angularDistance(first, second) {
  const difference = Math.abs(normalizeRotation(first) - normalizeRotation(second));
  return Math.min(difference, 360 - difference);
}

function rotate(point, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
}

function buildEightCornerEndpoints() {
  const cornerDefinition = loadCatalog().PARTS.corner45;
  const angle = Math.PI / 4;
  const innerRadius = cornerDefinition.geometry.innerRadius;
  const outerRadius = cornerDefinition.geometry.outerRadius;
  const centerlineRadius = cornerDefinition.geometry.centerlineRadius;
  const radialCentroid = (4 * Math.sin(angle / 2) / (3 * angle)) *
    ((outerRadius ** 3 - innerRadius ** 3) / (outerRadius ** 2 - innerRadius ** 2));
  const bisector = -3 * Math.PI / 8;
  const center = {
    x: -radialCentroid * Math.cos(bisector),
    y: -radialCentroid * Math.sin(bisector)
  };
  const entry = { x: center.x, y: center.y - centerlineRadius, heading: 180 };
  const exit = {
    x: center.x + centerlineRadius * Math.cos(-Math.PI / 4),
    y: center.y + centerlineRadius * Math.sin(-Math.PI / 4),
    heading: 45
  };

  return Array.from({ length: 8 }, (_, index) => {
    const rotation = index * 45;
    const worldCenter = { x: 100, y: 100 };
    const centerOffset = rotate(center, rotation);
    const pose = { x: worldCenter.x - centerOffset.x, y: worldCenter.y - centerOffset.y };
    return [entry, exit].map((endpoint, endpointIndex) => {
      const offset = rotate(endpoint, rotation);
      return {
        sourceId: `corner-${index + 1}`,
        sourceType: 'corner45',
        endpointIndex,
        x: pose.x + offset.x,
        y: pose.y + offset.y,
        heading: normalizeRotation(endpoint.heading + rotation)
      };
    });
  });
}

function connects(first, second) {
  if (first.sourceId === second.sourceId) return false;
  const close = Math.hypot(first.x - second.x, first.y - second.y) <= 0.01;
  const opposite = Math.abs((((first.heading - second.heading) % 360) + 360) % 360 - 180) <= 0.01;
  return close && opposite;
}

test('接続済みパーツ境界を1接続につき1本だけ返す', () => {
  const endpoints = [
    { sourceId: 'a', x: 54, y: 20, heading: 0 },
    { sourceId: 'b', x: 54, y: 20, heading: 180 },
    { sourceId: 'b', x: 108, y: 20, heading: 0 },
    { sourceId: 'c', x: 108, y: 20, heading: 180 }
  ];
  const result = seams.findConnectedSeams(endpoints, connects);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.point), [{ x: 54, y: 20 }, { x: 108, y: 20 }]);
});

test('未接続端点や同一パーツ内の端点には継ぎ目を作らない', () => {
  const endpoints = [
    { sourceId: 'a', x: 0, y: 0, heading: 0 },
    { sourceId: 'a', x: 0, y: 0, heading: 180 },
    { sourceId: 'b', x: 100, y: 0, heading: 180 }
  ];
  assert.deepEqual(seams.findConnectedSeams(endpoints, connects), []);
});

test('RC1の全パーツ種別を除外せず接続境界として扱う', () => {
  const types = [
    'straight', 'corner45', 'lanechange', 'wave',
    'slope', 'bank20', 'lcjump', 'burning'
  ];
  const endpoints = types.flatMap((type, index) => [
    { sourceId: type, sourceType: type, x: index * 10, y: 0, heading: 0 },
    { sourceId: `mate-${type}`, sourceType: 'straight', x: index * 10, y: 0, heading: 180 }
  ]);
  const result = seams.findConnectedSeams(endpoints, connects);
  assert.deepEqual(
    result.map(item => item.endpoints[0].sourceType),
    types
  );
});

test('Corner 45°を8枚接続すると8境界で位置と角度が閉合する', () => {
  const cornerEndpoints = buildEightCornerEndpoints();
  const firstEntry = cornerEndpoints[0][0];
  const finalExit = cornerEndpoints[7][1];
  const positionError = Math.hypot(firstEntry.x - finalExit.x, firstEntry.y - finalExit.y);
  const headingError = angularDistance(firstEntry.heading, normalizeRotation(finalExit.heading + 180));
  const result = seams.findConnectedSeams(cornerEndpoints.flat(), connects);

  assert.equal(result.length, 8);
  assert.ok(positionError < 1e-9, `位置閉合誤差: ${positionError} cm`);
  assert.ok(headingError < 1e-9, `角度閉合誤差: ${headingError}°`);
});

test('Startの入口側と出口側をそれぞれStraightとの境界に含める', () => {
  const endpoints = [
    { sourceId: 'start', sourceType: 'start', endpointIndex: 0, x: 73, y: 100, heading: 180 },
    { sourceId: 'start', sourceType: 'start', endpointIndex: 1, x: 127, y: 100, heading: 0 },
    { sourceId: 'left', sourceType: 'straight', endpointIndex: 1, x: 73, y: 100, heading: 0 },
    { sourceId: 'right', sourceType: 'straight', endpointIndex: 0, x: 127, y: 100, heading: 180 }
  ];
  const result = seams.findConnectedSeams(endpoints, connects);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.point.x), [73, 127]);
});

test('継ぎ目はレーン線より細く、選択時だけ少し強調する', () => {
  const normal = seams.resolveStyle();
  const selected = seams.resolveStyle({ selected: true });
  assert.ok(normal.lineWidth < 0.8);
  assert.ok(selected.lineWidth > normal.lineWidth);
  assert.notEqual(selected.color, normal.color);
});

test('PNG出力では選択中でも通常幅0.52と通常色を使う', () => {
  const normal = seams.resolveStyle();
  const exported = seams.resolveStyle({ selected: true, exportMode: true });
  assert.equal(exported.lineWidth, 0.52);
  assert.deepEqual(exported, normal);
});

test('全6色で同じ中立色の継ぎ目を使用する', () => {
  const colors = ['default', 'red', 'blue', 'orange', 'green', 'white'];
  const styles = colors.map(colorKey => seams.resolveStyle({ colorKey }));
  assert.ok(styles.every(style => style.color === styles[0].color));
  assert.ok(styles.every(style => style.lineWidth === 0.52));
});

test('将来の表示切替用フラグで継ぎ目を無効化できる', () => {
  assert.equal(seams.resolveStyle({ enabled: false }), null);
});
