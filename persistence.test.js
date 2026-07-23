'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_KEY,
  createLayoutStore
} = require('./persistence.js');

const options = {
  app: 'mini4wd-course-layout-mouse-flow',
  version: '1.0.0-RC1',
  partTypes: ['straight', 'corner45'],
  colorKeys: ['default', 'red', 'blue', 'orange', 'green', 'white']
};

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function layoutFixture() {
  return {
    app: options.app,
    version: options.version,
    field: { widthCm: 600, heightCm: 400, gridCm: 10 },
    parts: [
      { id: 'straight-1', type: 'straight', x: 327, y: 200, rotation: 0, routeIndex: 0, colorKey: 'red', zIndex: 1 },
      { id: 'straight-2', type: 'straight', x: 381, y: 200, rotation: 45, routeIndex: 0, colorKey: 'blue', zIndex: 2 },
      { id: 'corner-1', type: 'corner45', x: 430, y: 210, rotation: 90, routeIndex: 0, colorKey: 'orange', zIndex: 3 }
    ],
    start: { x: 273, y: 200, rotation: 45 },
    startPhase: 'position',
    selectedType: 'straight',
    rotation: 90,
    activeConnection: { x: 460, y: 240, heading: 135, sourceId: 'corner-1', sourceType: 'corner45', endpointIndex: 1, label: 'B' }
  };
}

function emptyLayout() {
  return {
    app: options.app,
    version: options.version,
    field: { widthCm: 600, heightCm: 400, gridCm: 10 },
    parts: [],
    start: null,
    startPhase: 'position',
    selectedType: 'start',
    rotation: 0,
    activeConnection: null
  };
}

test('保存側と復元側で同じ安定キーを使用する', () => {
  const store = createLayoutStore(new MemoryStorage(), options);
  assert.equal(STORAGE_KEY, 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1');
  assert.equal(store.key, STORAGE_KEY);
});

test('レイアウト保存後に再初期化したストアへ復元できる', () => {
  const storage = new MemoryStorage();
  const firstApp = createLayoutStore(storage, options);
  assert.equal(firstApp.restore().status, 'empty');
  assert.equal(firstApp.save(layoutFixture()).status, 'saved');

  const reinitializedApp = createLayoutStore(storage, options);
  assert.deepEqual(reinitializedApp.restore(), { status: 'restored', layout: layoutFixture() });
});

test('Start、Straight、Corner、位置、回転、色が往復一致する', () => {
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  store.save(layoutFixture());
  const restored = createLayoutStore(storage, options).restore();

  assert.equal(restored.status, 'restored');
  assert.deepEqual(restored.layout.start, layoutFixture().start);
  assert.deepEqual(restored.layout.parts, layoutFixture().parts);
});

test('起動時の正常データを復元前の空状態で上書きしない', () => {
  const saved = JSON.stringify(layoutFixture());
  const storage = new MemoryStorage([[STORAGE_KEY, saved]]);
  const store = createLayoutStore(storage, options);

  assert.equal(store.save(emptyLayout()).status, 'not-ready');
  assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.deepEqual(store.restore(), { status: 'restored', layout: layoutFixture() });
});

test('古い空状態のタブを閉じても新しい保存データを上書きしない', () => {
  const storage = new MemoryStorage();
  const staleTab = createLayoutStore(storage, options);
  const editingTab = createLayoutStore(storage, options);
  assert.equal(staleTab.restore().status, 'empty');
  assert.equal(editingTab.restore().status, 'empty');
  assert.equal(editingTab.save(layoutFixture()).status, 'saved');

  // 終了時の自動flushを持たないため、staleTabを閉じても保存処理は発生しない。
  const reopenedTab = createLayoutStore(storage, options);
  assert.deepEqual(reopenedTab.restore(), { status: 'restored', layout: layoutFixture() });
});

test('破損データは破棄して空状態で安全に起動できる', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, '{broken-json']]);
  const store = createLayoutStore(storage, options);

  assert.equal(store.restore().status, 'corrupt');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(store.save(emptyLayout()).status, 'saved');
});

test('初期化後は空レイアウトが保存される', () => {
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  assert.equal(store.save(emptyLayout()).status, 'saved');

  const restored = createLayoutStore(storage, options).restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.layout.start, null);
  assert.deepEqual(restored.layout.parts, []);
});

test('一時選択、ホバー、ゴースト、履歴は保存しない', () => {
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  store.save({
    ...layoutFixture(),
    selectedIds: ['straight-1'],
    hoveredPartId: 'straight-2',
    ghost: { type: 'corner45' },
    history: ['temporary'],
    future: ['temporary']
  });

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal('selectedIds' in raw, false);
  assert.equal('hoveredPartId' in raw, false);
  assert.equal('ghost' in raw, false);
  assert.equal('history' in raw, false);
  assert.equal('future' in raw, false);
});
