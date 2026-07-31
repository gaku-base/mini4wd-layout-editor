const test = require('node:test');
const assert = require('node:assert/strict');
const OBSTACLES = require('./obstacles.js');

test('obstacles normalize additive persisted fields in 10mm and 90 degree increments', () => {
  const obstacle = OBSTACLES.normalizeObstacle({ id: 'desk', x: -14, y: 16, width: 4, depth: -27, rotation: 84, visible: false, locked: true });
  assert.deepEqual(obstacle, { id: 'desk', name: '障害物', type: 'obstacle', shape: 'rectangle', x: -10, y: 20, width: 10, depth: 30, rotation: 90, visible: false, locked: true });
});

test('obstacle footprint rotates around its centre and hit testing uses its rendered bounds', () => {
  const rotated = { id: 'table', x: 100, y: 200, width: 400, depth: 200, rotation: 90 };
  assert.deepEqual(OBSTACLES.bounds(rotated), { left: 200, top: 100, right: 400, bottom: 500 });
  assert.equal(OBSTACLES.containsPoint(rotated, { x: 300, y: 300 }), true);
  assert.equal(OBSTACLES.containsPoint(rotated, { x: 190, y: 300 }), false);
});

test('obstacle collision and layout-space overflow are warnings based on visible geometry', () => {
  assert.deepEqual(OBSTACLES.intersects({ left: 0, top: 0, right: 100, bottom: 100 }, { left: 80, top: 50, right: 160, bottom: 150 }), { left: 80, top: 50, right: 100, bottom: 100 });
  assert.equal(OBSTACLES.isOutside({ x: -10, y: 0, width: 100, depth: 100 }, { x: 0, y: 0, width: 1000, height: 1000 }), true);
  assert.equal(OBSTACLES.isOutside({ x: 10, y: 10, width: 100, depth: 100 }, { x: 0, y: 0, width: 1000, height: 1000 }), false);
});

test('duplicate obstacle keeps data independent and assigns a unique id', () => {
  const copy = OBSTACLES.duplicateObstacle({ id: 'obstacle-1', name: '棚', x: 100, y: 200, width: 300, depth: 400 }, [{ id: 'obstacle-1' }]);
  assert.equal(copy.id, 'obstacle-2');
  assert.equal(copy.name, '棚 コピー');
  assert.deepEqual([copy.x, copy.y], [110, 210]);
});
