'use strict';

const assert = require('assert');
const boundary = require('./field-boundary.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('legacy field gets zero origin', () => {
  assert.deepStrictEqual(boundary.normalizeField({ widthCm: 600, heightCm: 400, gridCm: 10 }), {
    originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10
  });
});

test('negative-coordinate part is detected outside', () => {
  assert.strictEqual(boundary.containsBounds(
    { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    { minX: -1, minY: 20, maxX: 40, maxY: 60 }
  ), false);
});

test('part touching creation-area border remains inside', () => {
  assert.strictEqual(boundary.containsBounds(
    { originX: -100, originY: -50, widthCm: 700, heightCm: 500, gridCm: 10 },
    { minX: -100, minY: -50, maxX: 600, maxY: 450 }
  ), true);
});

test('auto fit expands in all directions with grid margin', () => {
  const fitted = boundary.fitFieldToBounds(
    { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    { minX: -37, minY: -12, maxX: 713, maxY: 466 },
    { marginCm: 20 }
  );
  assert.deepStrictEqual(fitted, {
    originX: -60, originY: -40, widthCm: 800, heightCm: 530, gridCm: 10
  });
  assert.strictEqual(boundary.containsBounds(fitted, { minX: -37, minY: -12, maxX: 713, maxY: 466 }), true);
});

test('auto fit is idempotent', () => {
  const bounds = { minX: -37, minY: -12, maxX: 713, maxY: 466 };
  const once = boundary.fitFieldToBounds({ widthCm: 600, heightCm: 400, gridCm: 10 }, bounds, { marginCm: 20 });
  const twice = boundary.fitFieldToBounds(once, bounds, { marginCm: 20 });
  assert.strictEqual(boundary.sameField(once, twice), true);
});

test('auto fit keeps minimum one-metre creation area', () => {
  const fitted = boundary.fitFieldToBounds(
    { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 5 },
    { minX: 10, minY: 10, maxX: 20, maxY: 20 },
    { marginCm: 5 }
  );
  assert.strictEqual(fitted.widthCm, 100);
  assert.strictEqual(fitted.heightCm, 100);
});

test('rotated-part AABB is accepted without modifying coordinates', () => {
  const bounds = { minX: -24.4, minY: 30.2, maxX: 84.7, maxY: 139.3 };
  const original = JSON.parse(JSON.stringify(bounds));
  const fitted = boundary.fitFieldToBounds({ gridCm: 10 }, bounds, { marginCm: 10 });
  assert.deepStrictEqual(bounds, original);
  assert.strictEqual(boundary.containsBounds(fitted, bounds), true);
});

test('field comparison includes origin', () => {
  assert.strictEqual(boundary.sameField(
    { originX: 0, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 },
    { originX: -10, originY: 0, widthCm: 600, heightCm: 400, gridCm: 10 }
  ), false);
});

let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(error.stack || error);
  }
}

console.log(`${tests.length - failed}/${tests.length} tests passed`);
if (failed) process.exitCode = 1;
