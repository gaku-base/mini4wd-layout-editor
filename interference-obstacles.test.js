'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const OBSTACLES = require('./interference-obstacles.js');

const source = { id: 'obstacle-1', name: '柱', x: 100, y: 100, widthCm: 40, depthCm: 20, rotation: 405, visible: true, locked: true };

test('normalization retains valid persisted obstacle fields and normalizes rotation', () => {
  assert.deepEqual(OBSTACLES.normalizeObstacle(source), { ...source, rotation: 45 });
});

test('invalid obstacle dimensions and non-finite positions are rejected', () => {
  assert.equal(OBSTACLES.normalizeObstacle({ ...source, widthCm: 0 }), null);
  assert.equal(OBSTACLES.normalizeObstacle({ ...source, depthCm: Infinity }), null);
  assert.equal(OBSTACLES.normalizeObstacle({ ...source, x: NaN }), null);
});

test('legacy layouts without obstacles normalize to an empty collection', () => {
  assert.deepEqual(OBSTACLES.normalizeObstacles(undefined), []);
});

test('editing preserves stable id and updates only valid values', () => {
  assert.deepEqual(OBSTACLES.updateObstacle(source, { x: 120, locked: false }), { ...source, x: 120, rotation: 45, locked: false });
});

test('editing can toggle visibility without changing geometry', () => {
  assert.deepEqual(OBSTACLES.updateObstacle(source, { visible: false }), { ...source, rotation: 45, visible: false });
});

test('duplication creates a new id, unlocks the copy, and offsets it', () => {
  const copy = OBSTACLES.duplicateObstacle({ ...source, rotation: 45 }, () => 'obstacle-2', () => true);
  assert.equal(copy.id, 'obstacle-2');
  assert.equal(copy.locked, false);
  assert.notDeepEqual({ x: copy.x, y: copy.y }, { x: source.x, y: source.y });
});
