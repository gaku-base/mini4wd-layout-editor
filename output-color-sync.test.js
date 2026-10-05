'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const RENDERER = require('./presentation-renderer.js');
const GEOMETRY = require('./part-geometry3d.js');

function loadCatalog() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('part-catalog.js', 'utf8'), context, { filename:'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = loadCatalog();

test('LAYOUT and OUTPUT use one shared course color authority', () => {
  assert.deepEqual(
    Array.from(CATALOG.COURSE_COLORS, color => color.key),
    ['default','red','blue','orange','green','white']
  );
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /const COLORS = CATALOG\.COURSE_COLORS;/);
});

test('OUTPUT 2D resolves every placed colorKey from the shared catalog', () => {
  for (const color of CATALOG.COURSE_COLORS) {
    const resolved = RENDERER.paletteFor({ colorKey:color.key }, CATALOG);
    assert.equal(resolved.base, color.base, color.key);
    assert.equal(resolved.lane, color.lane, color.key);
    assert.equal(resolved.edge, color.edge, color.key);
  }
});

test('OUTPUT 3D resolves every placed colorKey from the shared catalog', () => {
  for (const color of CATALOG.COURSE_COLORS) {
    const model = GEOMETRY.buildPart3D('straight', { colorKey:color.key }, CATALOG);
    assert.equal(model.colors.base, color.base, color.key);
    assert.equal(model.colors.lane, color.lane, color.key);
    assert.equal(model.colors.edge, color.edge, color.key);
  }
});

test('Start colorKey is created, restored and therefore available to OUTPUT', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /colorKey: 'default', pitchDeg: 0, bankAngleDeg: 0, zOrder: 0/);
  assert.match(app, /colorKey: COLORS\.some\(c => c\.key === data\.start\.colorKey\) \? data\.start\.colorKey : 'default'/);
});
