'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_KEY,
  CURRENT_VERSION,
  SUPPORTED_LEGACY_VERSIONS,
  createLayoutStore
} = require('./persistence.js');

const LEGACY_VERSION = '1.0.0-RC1';
const options = {
  app: 'mini4wd-course-layout-mouse-flow',
  version: CURRENT_VERSION,
  partTypes: ['straight', 'corner45'],
  colorKeys: ['default', 'red', 'blue', 'orange', 'green', 'white']
};

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.setCount = 0;
    this.removeCount = 0;
  }

  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }

  setItem(key, value) {
    this.setCount += 1;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removeCount += 1;
    this.values.delete(key);
  }
}

function layoutFixture({ version = CURRENT_VERSION, includeOrigin = true } = {}) {
  const field = { widthCm: 600, heightCm: 400, gridCm: 10 };
  if (includeOrigin) Object.assign(field, { originX: -20, originY: -10 });
  return {
    app: options.app,
    version,
    field,
    parts: [
      { id: 'straight-1', type: 'straight', x: -7, y: 200, rotation: 0, routeIndex: 0, colorKey: 'red', zIndex: 1 },
      { id: 'straight-2', type: 'straight', x: 47, y: 200, rotation: 45, routeIndex: 0, colorKey: 'blue', zIndex: 2 },
      { id: 'corner-1', type: 'corner45', x: 96, y: 210, rotation: 90, routeIndex: 0, colorKey: 'orange', zIndex: 3 }
    ],
    start: { x: -61, y: 200, rotation: 45 },
    startPhase: 'position',
    selectedType: 'straight',
    rotation: 90,
    activeConnection: { x: 126, y: 240, heading: 135, sourceId: 'corner-1', sourceType: 'corner45', endpointIndex: 1, label: 'B' }
  };
}

function legacyLayoutFixture() {
  return layoutFixture({ version: LEGACY_VERSION, includeOrigin: false });
}

function emptyLayout() {
  return {
    app: options.app,
    version: CURRENT_VERSION,
    field: { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    parts: [],
    start: null,
    startPhase: 'position',
    selectedType: 'start',
    rotation: 0,
    activeConnection: null
  };
}

function restoredCurrent(layout = layoutFixture()) {
  return { status: 'restored', versionStatus: 'current', layout };
}

test('uses the same stable localStorage key for RC1 and RC2', () => {
  const store = createLayoutStore(new MemoryStorage(), options);
  assert.equal(STORAGE_KEY, 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1');
  assert.equal(store.key, STORAGE_KEY);
  assert.equal(CURRENT_VERSION, '1.1.0-RC2');
  assert.deepEqual([...SUPPORTED_LEGACY_VERSIONS], [LEGACY_VERSION]);
});

test('restores a current layout after app reinitialization', () => {
  const storage = new MemoryStorage();
  const firstApp = createLayoutStore(storage, options);
  assert.equal(firstApp.restore().status, 'empty');
  assert.equal(firstApp.save(layoutFixture()).status, 'saved');
  assert.deepEqual(createLayoutStore(storage, options).restore(), restoredCurrent());
});

test('round-trips Start, Straight, Corner, pose, color, order, and connection', () => {
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  store.save(layoutFixture());
  const restored = createLayoutStore(storage, options).restore();
  assert.deepEqual(restored.layout.start, layoutFixture().start);
  assert.deepEqual(restored.layout.parts, layoutFixture().parts);
  assert.deepEqual(restored.layout.activeConnection, layoutFixture().activeConnection);
});

test('does not overwrite saved data before restore completes', () => {
  const saved = JSON.stringify(layoutFixture());
  const storage = new MemoryStorage([[STORAGE_KEY, saved]]);
  const store = createLayoutStore(storage, options);
  assert.equal(store.save(emptyLayout()).status, 'not-ready');
  assert.equal(storage.getItem(STORAGE_KEY), saved);
  assert.deepEqual(store.restore(), restoredCurrent());
});

test('an initialized stale tab does not overwrite another tab without an edit', () => {
  const storage = new MemoryStorage();
  const staleTab = createLayoutStore(storage, options);
  const editingTab = createLayoutStore(storage, options);
  assert.equal(staleTab.restore().status, 'empty');
  assert.equal(editingTab.restore().status, 'empty');
  assert.equal(editingTab.save(layoutFixture()).status, 'saved');
  assert.deepEqual(createLayoutStore(storage, options).restore(), restoredCurrent());
});

test('removes malformed JSON and can subsequently save an empty layout', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, '{broken-json']]);
  const store = createLayoutStore(storage, options);
  assert.equal(store.restore().status, 'corrupt');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(store.save(emptyLayout()).status, 'saved');
});

test('persists an explicitly initialized empty layout', () => {
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  assert.equal(store.save(emptyLayout()).status, 'saved');
  const restored = createLayoutStore(storage, options).restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.layout.start, null);
  assert.deepEqual(restored.layout.parts, []);
});

test('does not persist selection, hover, ghost, or history state', () => {
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
  for (const field of ['selectedIds', 'hoveredPartId', 'ghost', 'history', 'future']) {
    assert.equal(field in raw, false);
  }
});

test('1. RC1 localStorage is restored successfully', () => {
  const legacy = legacyLayoutFixture();
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);
  const restored = createLayoutStore(storage, options).restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.versionStatus, 'supportedLegacy');
});

test('2. RC1 restore status is not corrupt', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacyLayoutFixture())]]);
  assert.notEqual(createLayoutStore(storage, options).restore().status, 'corrupt');
});

test('3. RC1 stored bytes are not deleted or changed during restore', () => {
  const raw = JSON.stringify(legacyLayoutFixture());
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  createLayoutStore(storage, options).restore();
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.removeCount, 0);
});

test('4. RC1 restore supplies zero field origin in memory', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacyLayoutFixture())]]);
  const restored = createLayoutStore(storage, options).restore();
  assert.equal(restored.layout.field.originX, 0);
  assert.equal(restored.layout.field.originY, 0);
});

test('5. RC1 part and connection information remains identical', () => {
  const legacy = legacyLayoutFixture();
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);
  const restored = createLayoutStore(storage, options).restore();
  assert.deepEqual(restored.layout.parts, legacy.parts);
  assert.deepEqual(restored.layout.start, legacy.start);
  assert.deepEqual(restored.layout.activeConnection, legacy.activeConnection);
  assert.equal(restored.layout.selectedType, legacy.selectedType);
  assert.equal(restored.layout.rotation, legacy.rotation);
});

test('6. RC1 restore does not immediately write an empty or RC2 layout', () => {
  const raw = JSON.stringify(legacyLayoutFixture());
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  createLayoutStore(storage, options).restore();
  assert.equal(storage.setCount, 0);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('7. the next confirmed edit saves the layout as RC2', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacyLayoutFixture())]]);
  const store = createLayoutStore(storage, options);
  const restored = store.restore();
  const edited = {
    ...restored.layout,
    version: CURRENT_VERSION,
    parts: restored.layout.parts.map((part, index) => index === 0 ? { ...part, x: part.x + 10 } : part)
  };
  assert.equal(store.save(edited).status, 'saved');
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.version, CURRENT_VERSION);
  assert.equal(saved.field.originX, 0);
  assert.equal(saved.field.originY, 0);
  assert.equal(saved.parts[0].x, legacyLayoutFixture().parts[0].x + 10);
});

test('8. an RC2 layout saved after migration restores again', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacyLayoutFixture())]]);
  const migratingStore = createLayoutStore(storage, options);
  const legacy = migratingStore.restore();
  assert.equal(migratingStore.save({ ...legacy.layout, version: CURRENT_VERSION }).status, 'saved');
  const restored = createLayoutStore(storage, options).restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.versionStatus, 'current');
  assert.equal(restored.layout.version, CURRENT_VERSION);
});

test('9. only genuinely corrupt JSON is deleted', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, '{"version":']]);
  assert.equal(createLayoutStore(storage, options).restore().status, 'corrupt');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.removeCount, 1);
});

test('10. an unknown future version is retained and cannot be overwritten', () => {
  const future = layoutFixture({ version: '9.0.0-RC1' });
  const raw = JSON.stringify(future);
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  const store = createLayoutStore(storage, options);
  const restored = store.restore();
  assert.deepEqual(restored, {
    status: 'unsupported-version',
    versionStatus: 'unsupportedFuture',
    version: '9.0.0-RC1'
  });
  assert.equal(store.isWriteBlocked(), true);
  assert.equal(store.save(emptyLayout()).status, 'blocked-unsupported-version');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.removeCount, 0);
});

test('11. existing RC2 data still restores without a write', () => {
  const current = layoutFixture();
  const raw = JSON.stringify(current);
  const storage = new MemoryStorage([[STORAGE_KEY, raw]]);
  const restored = createLayoutStore(storage, options).restore();
  assert.deepEqual(restored, restoredCurrent(current));
  assert.equal(storage.setCount, 0);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('12. RC2 additive height, zOrder, and multiple connection edges round-trip', () => {
  const layout = layoutFixture();
  layout.start = { ...layout.start, zMm: 230, zOrder: 0 };
  layout.parts = layout.parts.map((part, index) => ({
    ...part,
    zMm: index === 2 ? 345 : 230,
    pitchDeg: 0,
    bankAngleDeg: index === 1 ? 20 : 0,
    zOrder: index + 1
  }));
  layout.connections = [
    { partAId: 'start', connectorAId: 'b', partBId: 'straight-1', connectorBId: 'a', createdOrder: 1 },
    { partAId: 'straight-1', connectorAId: 'b', partBId: 'straight-2', connectorBId: 'a', createdOrder: 2 },
    { partAId: 'straight-1', connectorAId: 'b', partBId: 'corner-1', connectorBId: 'a', createdOrder: 3 }
  ];
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, options);
  store.restore();
  assert.equal(store.save(layout).status, 'saved');
  assert.deepEqual(createLayoutStore(storage, options).restore().layout, layout);
});

test('13. unknown connector references are rejected when catalog connector IDs are supplied', () => {
  const layout = layoutFixture();
  layout.connections = [{ partAId: 'start', connectorAId: 'missing', partBId: 'straight-1', connectorBId: 'a' }];
  const strictOptions = { ...options, connectorIdsByType: { start: ['a', 'b'], straight: ['a', 'b'], corner45: ['a', 'b'] } };
  const storage = new MemoryStorage();
  const store = createLayoutStore(storage, strictOptions);
  store.restore();
  assert.equal(store.save(layout).status, 'failed');
});
