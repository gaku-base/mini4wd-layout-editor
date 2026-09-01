'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const laneChange = require('./lane-change-visual.js');
const seams = require('./part-seams.js');

const WIDTH = 162;
const TRACK_WIDTH = 36;

function loadCatalog() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'part-catalog.js'), 'utf8'),
    context
  );
  return context.window.M4WD_PART_CATALOG;
}

function rotate(point, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
}

function endpointsConnect(first, second) {
  if (first.sourceId === second.sourceId) return false;
  const close = Math.hypot(first.x - second.x, first.y - second.y) <= 0.01;
  const opposite = Math.abs((((first.heading - second.heading) % 360) + 360) % 360 - 180) <= 0.01;
  return close && opposite;
}

test('lane-changeの正式接続座標は従来どおり±81cmを維持する', () => {
  const geometry = laneChange.createGeometry(WIDTH, TRACK_WIDTH);
  const expected = [
    { x: -81, y: 0, heading: 180 },
    { x: 81, y: 0, heading: 0 }
  ];
  assert.deepEqual(geometry.connectors, expected);
  assert.deepEqual(
    JSON.parse(JSON.stringify(loadCatalog().PARTS.lanechange.geometry.connectors)),
    expected
  );
  assert.equal(loadCatalog().PARTS.lanechange.visual.profile, laneChange.PROFILE_VERSION);
});

test('3レーン境界はStraight接続面と同じ±6cmで始終端へ到達する', () => {
  const geometry = laneChange.createGeometry(WIDTH, TRACK_WIDTH);
  assert.deepEqual(
    geometry.guides.map(guide => [guide.start, guide.end]),
    [
      [{ x: -81, y: -6 }, { x: 81, y: 6 }],
      [{ x: -81, y: 6 }, { x: 81, y: -6 }]
    ]
  );
});

test('橋状レーンは1レーン幅で外周内に収まり左右対称になる', () => {
  const geometry = laneChange.createGeometry(WIDTH, TRACK_WIDTH);
  assert.equal(geometry.bridge.width, 12);
  assert.equal(geometry.bridge.start.x, -geometry.bridge.end.x);
  assert.equal(geometry.bridge.start.y, -geometry.bridge.end.y);
  assert.ok(geometry.bridge.caps.every(cap => cap.start.x === cap.end.x));
  assert.ok(geometry.support.every(point => Math.abs(point.y) < TRACK_WIDTH / 2));
});

test('Straightと前後接続したとき境界線は2本だけ生成される', () => {
  const geometry = laneChange.createGeometry(WIDTH, TRACK_WIDTH);
  const endpoints = [
    { ...geometry.connectors[0], sourceId: 'lane-change', sourceType: 'lanechange' },
    { ...geometry.connectors[1], sourceId: 'lane-change', sourceType: 'lanechange' },
    { x: -81, y: 0, heading: 0, sourceId: 'straight-before', sourceType: 'straight' },
    { x: 81, y: 0, heading: 180, sourceId: 'straight-after', sourceType: 'straight' }
  ];
  assert.equal(seams.findConnectedSeams(endpoints, endpointsConnect).length, 2);
});

test('45度回転後も接続面間距離162cmと反対向きを維持する', () => {
  const geometry = laneChange.createGeometry(WIDTH, TRACK_WIDTH);
  const rotated = geometry.connectors.map(connector => ({
    ...rotate(connector, 45),
    heading: (connector.heading + 45) % 360
  }));
  assert.ok(Math.abs(Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y) - WIDTH) < 1e-9);
  assert.equal(rotated[0].heading, 225);
  assert.equal(rotated[1].heading, 45);
});

test('テンプレートSVGと同期PNGが正式プロファイルの高解像度表示資産になる', () => {
  const template = fs.readFileSync(path.join(__dirname, 'assets/templates/lane-change.svg'), 'utf8');
  assert.match(template, /M0 12 H36 C66 12 96 24 126 24 H162/);
  assert.match(template, /stroke-width="13\.6"/);

  const png = fs.readFileSync(path.join(__dirname, 'assets/parts/lane-change.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1296);
  assert.equal(png.readUInt32BE(20), 288);
});

test('正式視覚モデルは本番画面でapp.jsより先に読み込まれる', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('lane-change-visual.js') < html.indexOf('app.js'));
});
