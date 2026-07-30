'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FAST = require('./fast-path-placement.js');

test('only Straight and the two concrete 45-degree corners use the fast path', () => {
  assert.equal(FAST.isFastPathType('straight'), true);
  assert.equal(FAST.isFastPathType('corner-45-right'), true);
  assert.equal(FAST.isFastPathType('corner-45-left'), true);
  for (const type of ['wave', 'slope', 'bank20', 'lanechange', 'burning', 'start']) assert.equal(FAST.isFastPathType(type), false);
});

test('pointer movement at or below 10px retains the anchored proposal', () => {
  const origin = { x: 100, y: 100 };
  assert.equal(FAST.hasMeaningfulPointerMove(origin, { x: 108, y: 106 }), false);
  assert.equal(FAST.hasMeaningfulPointerMove(origin, { x: 110, y: 100 }), false);
  assert.equal(FAST.hasMeaningfulPointerMove(origin, { x: 111, y: 100 }), true);
});

test('fast path separates repeat, selection, and free placement at the exact boundaries', () => {
  const origin = { x: 100, y: 100 };
  const phaseAt = x => FAST.phaseForPointer(origin, { x, y: 100 }).phase;
  assert.equal(phaseAt(100), FAST.REPEAT);
  assert.equal(phaseAt(110), FAST.REPEAT);
  assert.equal(phaseAt(111), FAST.SELECT);
  assert.equal(phaseAt(220), FAST.SELECT);
  assert.equal(phaseAt(221), FAST.FREE);
});

test('repeat and select retain the same anchor; only free placement releases it', () => {
  const anchor = { x: 540, y: 115, heading: 45 };
  const state = { activePlacementAnchor: anchor, physicalPointerOrigin: { x: 100, y: 100 } };
  for (const point of [{ x: 110, y: 100 }, { x: 220, y: 100 }]) {
    const next = FAST.transitionForPointer(state, point);
    assert.notEqual(next.phase, FAST.FREE);
    assert.equal(next.activePlacementAnchor, anchor);
  }
  assert.equal(FAST.transitionForPointer(state, { x: 221, y: 100 }).activePlacementAnchor, null);
});

for (const heading of [0, 45, 90, 180, 270]) {
  test(`relative center/right/left selection is screen-pixel stable at ${heading} degrees`, () => {
    const anchor = { x: 400, y: 300 };
    const radians = heading * Math.PI / 180;
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const point = side => ({ x: anchor.x + right.x * side, y: anchor.y + right.y * side });
    assert.equal(FAST.typeForPointer({ currentType: FAST.RIGHT, anchorScreen: anchor, pointerScreen: point(0), headingDeg: heading }).type, FAST.STRAIGHT);
    assert.equal(FAST.typeForPointer({ currentType: FAST.STRAIGHT, anchorScreen: anchor, pointerScreen: point(31), headingDeg: heading }).type, FAST.RIGHT);
    assert.equal(FAST.typeForPointer({ currentType: FAST.STRAIGHT, anchorScreen: anchor, pointerScreen: point(-31), headingDeg: heading }).type, FAST.LEFT);
  });
}

test('the 20-30px transition band keeps the current ghost type', () => {
  const anchor = { x: 0, y: 0 };
  assert.equal(FAST.typeForPointer({ currentType: FAST.LEFT, anchorScreen: anchor, pointerScreen: { x: 0, y: -25 }, headingDeg: 0 }).type, FAST.LEFT);
  assert.equal(FAST.typeForPointer({ currentType: FAST.RIGHT, anchorScreen: anchor, pointerScreen: { x: 0, y: 25 }, headingDeg: 0 }).type, FAST.RIGHT);
});
