'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const burning = require('./burning-changer-visual.js');
const persistence = require('./persistence.js');
const seams = require('./part-seams.js');

function loadCatalog() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'part-catalog.js'), 'utf8'), context);
  return context.window.M4WD_PART_CATALOG;
}

function geometry() {
  return burning.createGeometry(loadCatalog().PARTS.burning.geometry);
}

function rotate(point, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  };
}

function connects(first, second) {
  if (first.sourceId === second.sourceId) return false;
  const close = Math.hypot(first.x - second.x, first.y - second.y) <= .01;
  const opposite = Math.abs((((first.heading - second.heading) % 360) + 360) % 360 - 180) <= .01;
  return close && opposite;
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('Burning Changerは既存の2接続端と位置・角度を維持する', () => {
  const definition = loadCatalog().PARTS.burning;
  const visual = geometry();
  const expected = [
    { x: -93, y: -54, heading: 180 },
    { x: -93, y: 54, heading: 180 }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(definition.geometry.connectors)), expected);
  assert.deepEqual(visual.connectors, expected);
  assert.equal(definition.visual.profile, burning.PROFILE_VERSION);
});

test('正式ベクターはU字本体7本と上層経路4本の内部継ぎ目を持つ', () => {
  const visual = geometry();
  assert.equal(visual.baseSeams.length, 7);
  assert.equal(visual.bridge.seams.length, 4);
  assert.equal(visual.baseSeams.length + visual.bridge.seams.length, 11);
});

test('両接続端へStraightを接続すると外部継ぎ目は2本だけ生成される', () => {
  const endpoints = geometry().connectors.map((connector, endpointIndex) => ({
    ...connector,
    sourceId: 'burning',
    sourceType: 'burning',
    endpointIndex
  }));
  endpoints.push(
    { x: -93, y: -54, heading: 0, sourceId: 'straight-top', sourceType: 'straight', endpointIndex: 1 },
    { x: -93, y: 54, heading: 0, sourceId: 'straight-bottom', sourceType: 'straight', endpointIndex: 1 }
  );
  assert.equal(seams.findConnectedSeams(endpoints, connects).length, 2);
});

test('0度・45度・90度回転後も接続端間距離と向きを維持する', () => {
  for (const rotation of [0, 45, 90]) {
    const rotated = geometry().connectors.map(connector => ({
      ...rotate(connector, rotation),
      heading: (connector.heading + rotation) % 360
    }));
    assert.ok(Math.abs(Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y) - 108) < 1e-9);
    assert.equal(rotated[0].heading, (180 + rotation) % 360);
    assert.equal(rotated[1].heading, (180 + rotation) % 360);
  }
});

test('当たり判定はU字本体と上層経路を含み中央の空白を除外する', () => {
  const visual = geometry();
  const bridgeMiddle = burning.pointOnCubic(visual.bridge.curve, .5);
  assert.equal(burning.containsPoint({ x: -70, y: visual.topY }, visual), true);
  assert.equal(burning.containsPoint(bridgeMiddle, visual), true);
  assert.equal(burning.containsPoint({ x: visual.arcCenterX, y: 0 }, visual), false);
});

test('保存・復元でBurning Changerの種類・位置・回転・色が一致する', () => {
  const options = {
    app: 'mini4wd-course-layout-mouse-flow',
    version: '1.0.0-RC1',
    partTypes: ['straight', 'burning'],
    colorKeys: ['default', 'red', 'blue', 'orange', 'green', 'white']
  };
  const layout = {
    app: options.app,
    version: options.version,
    field: { widthCm: 700, heightCm: 440, gridCm: 10 },
    parts: [{ id: 'burning-1', type: 'burning', x: 310, y: 220, rotation: 45, routeIndex: 1, colorKey: 'green', zIndex: 1 }],
    start: null,
    startPhase: 'position',
    selectedType: 'burning',
    rotation: 45,
    activeConnection: null
  };
  const storage = new MemoryStorage();
  const store = persistence.createLayoutStore(storage, options);
  store.restore();
  assert.equal(store.save(layout).status, 'saved');
  assert.deepEqual(persistence.createLayoutStore(storage, options).restore().layout.parts, layout.parts);
});

test('PNG出力は選択強調を除外し通常幅0.52の接続継ぎ目を使用する', () => {
  assert.deepEqual(
    seams.resolveStyle({ selected: true, exportMode: true }),
    seams.resolveStyle()
  );
  const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(appSource, /drawPartsInLayerOrder\(c, \{ exportMode: true \}\)/);
  assert.doesNotMatch(appSource, /drawPartsInLayerOrder\(c, \{ exportMode: true, selected: true \}\)/);
});

test('正式モデルは本番画面とQA画面でapp.jsより先に読み込まれる', () => {
  for (const filename of ['index.html', 'test-index.html']) {
    const html = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    assert.ok(html.indexOf('burning-changer-visual.js') < html.indexOf('app.js'));
  }
});

test('テンプレートSVGと同期PNGが正式モデルの表示資産になる', () => {
  const template = fs.readFileSync(path.join(__dirname, 'assets/templates/burning-lc.svg'), 'utf8');
  assert.match(template, /M0 18 H108 A54 54/);
  assert.match(template, /M0 30 H37\.8 C96 30 96 114 37\.8 114 H0/);

  const png = fs.readFileSync(path.join(__dirname, 'assets/parts/burning-lc.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1440);
  assert.equal(png.readUInt32BE(20), 1152);
});
