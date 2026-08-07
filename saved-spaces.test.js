'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STORAGE_KEY, VERSION, deepClone, normalizeLibrary, uniqueName,
  createSavedSpaceStore
} = require('./saved-spaces.js');

class MemoryStorage {
  constructor(entries = []) { this.map = new Map(entries); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function deterministicOptions() {
  let id = 0;
  let time = 0;
  return {
    makeId: prefix => `${prefix}-${++id}`,
    now: () => `2026-08-08T00:00:0${time++}.000Z`
  };
}

function input(name = '大会会場') {
  return {
    name,
    field: { widthCm: 500, heightCm: 800, gridCm: 10 },
    unavailableAreas: [{
      name: '柱', x: 120, y: 200, widthCm: 80, depthCm: 60,
      rotation: 27, visible: true, locked: false
    }]
  };
}

test('saved spaces use a storage key independent from course layout persistence', () => {
  assert.equal(STORAGE_KEY, 'mini4wd-layout-saved-spaces-v1');
  assert.equal(VERSION, 1);
  assert.doesNotMatch(STORAGE_KEY, /course-layout-mouse-flow/);
});

test('empty restore starts with an empty saved-space library', () => {
  const store = createSavedSpaceStore(new MemoryStorage(), deterministicOptions());
  assert.deepEqual(store.restore(), { status: 'empty', spaces: [] });
  assert.deepEqual(store.list(), []);
});

test('create, save, and reload preserve field and arbitrary integer rotation', () => {
  const storage = new MemoryStorage();
  const store = createSavedSpaceStore(storage, deterministicOptions());
  store.restore();
  const created = store.create(input());
  assert.equal(created.status, 'created');
  assert.equal(created.space.unavailableAreas[0].rotation, 27);
  const reloaded = createSavedSpaceStore(storage, deterministicOptions());
  const restored = reloaded.restore();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.spaces[0].field.heightCm, 800);
  assert.equal(restored.spaces[0].unavailableAreas[0].rotation, 27);
});

test('returned spaces are deep clones and do not share nested data', () => {
  const storage = new MemoryStorage();
  const store = createSavedSpaceStore(storage, deterministicOptions());
  store.restore();
  store.create(input());
  const first = store.list();
  const second = store.list();
  first[0].field.widthCm = 999;
  first[0].unavailableAreas[0].name = '変更';
  assert.equal(second[0].field.widthCm, 500);
  assert.equal(second[0].unavailableAreas[0].name, '柱');
  assert.notStrictEqual(first[0].unavailableAreas[0], second[0].unavailableAreas[0]);
  assert.deepEqual(deepClone(second), second);
});

test('create and duplicate issue unique IDs and names without shared objects', () => {
  const storage = new MemoryStorage();
  const store = createSavedSpaceStore(storage, deterministicOptions());
  store.restore();
  const original = store.create(input()).space;
  const firstCopy = store.duplicate(original.id).space;
  const secondCopy = store.duplicate(original.id).space;
  assert.equal(firstCopy.name, '大会会場 コピー');
  assert.equal(secondCopy.name, '大会会場 コピー2');
  assert.notEqual(firstCopy.id, original.id);
  assert.notEqual(firstCopy.unavailableAreas[0].id, original.unavailableAreas[0].id);
  assert.equal(uniqueName('大会会場', [original, firstCopy, secondCopy]), '大会会場 コピー3');
});

test('rename rejects empty and duplicate names and persists a valid name', () => {
  const storage = new MemoryStorage();
  const store = createSavedSpaceStore(storage, deterministicOptions());
  store.restore();
  const first = store.create(input('大会会場')).space;
  store.create(input('第2会場'));
  assert.equal(store.rename(first.id, '  ').reason, 'invalid-name');
  assert.equal(store.rename(first.id, '第2会場').reason, 'duplicate-name');
  assert.equal(store.rename(first.id, '本会場').status, 'updated');
  assert.equal(store.get(first.id).name, '本会場');
});

test('delete removes only the template and cannot mutate an existing course copy', () => {
  const storage = new MemoryStorage();
  const store = createSavedSpaceStore(storage, deterministicOptions());
  store.restore();
  const original = store.create(input()).space;
  const courseDraft = deepClone(original);
  assert.equal(store.delete(original.id).status, 'deleted');
  assert.equal(store.list().length, 0);
  assert.equal(courseDraft.unavailableAreas[0].name, '柱');
});

test('same-name creation is rejected consistently', () => {
  const store = createSavedSpaceStore(new MemoryStorage(), deterministicOptions());
  store.restore();
  assert.equal(store.create(input('大会会場')).status, 'created');
  assert.equal(store.create(input('大会会場')).reason, 'duplicate-name');
});

test('corrupted storage is reported safely without overwriting the bytes', () => {
  const storage = new MemoryStorage([[STORAGE_KEY, '{broken']]);
  const store = createSavedSpaceStore(storage, deterministicOptions());
  assert.equal(store.restore().status, 'corrupt');
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
  assert.deepEqual(store.list(), []);
});

test('template update does not mutate a course copy created before the edit', () => {
  const store = createSavedSpaceStore(new MemoryStorage(), deterministicOptions());
  store.restore();
  const space = store.create(input()).space;
  const courseCopy = deepClone(space);
  const editedAreas = deepClone(space.unavailableAreas);
  editedAreas[0].x = 300;
  assert.equal(store.update(space.id, { unavailableAreas: editedAreas }).status, 'updated');
  assert.equal(store.get(space.id).unavailableAreas[0].x, 300);
  assert.equal(courseCopy.unavailableAreas[0].x, 120);
});

test('invalid decimal rotations and malformed libraries are rejected', () => {
  const library = {
    version: VERSION,
    spaces: [{
      id: 'space-1', name: '会場', field: { widthCm: 500, heightCm: 500, gridCm: 10 },
      unavailableAreas: [{ id: 'area-1', name: '柱', x: 100, y: 100, widthCm: 20, depthCm: 20, rotation: 2.5 }],
      createdAt: 'now', updatedAt: 'now'
    }]
  };
  assert.equal(normalizeLibrary(library), null);
});
