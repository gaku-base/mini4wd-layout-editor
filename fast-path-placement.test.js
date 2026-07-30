'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  assert.equal(FAST.FAST_PATH_RELEASE_PX, 90);
  assert.equal(phaseAt(189), FAST.SELECT);
  assert.equal(phaseAt(190), FAST.SELECT);
  assert.equal(phaseAt(191), FAST.FREE);
});

test('repeat and select retain the same anchor; only free placement releases it', () => {
  const anchor = { x: 540, y: 115, heading: 45 };
  const state = { activePlacementAnchor: anchor, physicalPointerOrigin: { x: 100, y: 100 } };
  for (const point of [{ x: 110, y: 100 }, { x: 190, y: 100 }]) {
    const next = FAST.transitionForPointer(state, point);
    assert.notEqual(next.phase, FAST.FREE);
    assert.equal(next.activePlacementAnchor, anchor);
  }
  assert.equal(FAST.transitionForPointer(state, { x: 191, y: 100 }).activePlacementAnchor, null);
});

for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
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

test('pointer components use the ghost exit heading for forward and lateral selection', () => {
  const exit = { x: 400, y: 300 };
  for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const radians = heading * Math.PI / 180;
    const forward = { x: Math.cos(radians), y: Math.sin(radians) };
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const point = (forwardPx, lateralPx) => ({
      x: exit.x + forward.x * forwardPx + right.x * lateralPx,
      y: exit.y + forward.y * forwardPx + right.y * lateralPx
    });
    const center = FAST.pointerComponents(exit, point(12, 0), heading);
    const rightSide = FAST.pointerComponents(exit, point(12, 31), heading);
    const leftSide = FAST.pointerComponents(exit, point(12, -31), heading);
    assert.ok(FAST.isInForwardSelectionZone(center.forwardPx));
    assert.equal(FAST.typeForPointer({ currentType: FAST.RIGHT, anchorScreen: exit, pointerScreen: point(12, 0), headingDeg: heading }).type, FAST.STRAIGHT);
    assert.equal(FAST.typeForPointer({ currentType: FAST.STRAIGHT, anchorScreen: exit, pointerScreen: point(12, 31), headingDeg: heading }).type, FAST.RIGHT);
    assert.equal(FAST.typeForPointer({ currentType: FAST.STRAIGHT, anchorScreen: exit, pointerScreen: point(12, -31), headingDeg: heading }).type, FAST.LEFT);
    assert.ok(rightSide.lateralPx > 30 && leftSide.lateralPx < -30);
  }
});

test('a pointer behind the ghost exit never qualifies for automatic side selection', () => {
  assert.equal(FAST.isInForwardSelectionZone(FAST.MIN_FORWARD_PX - .01), false);
  assert.equal(FAST.isInForwardSelectionZone(FAST.MIN_FORWARD_PX), true);
});

for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
  test(`runtime pointer flow updates the rendered fast-path type at ${heading} degrees`, () => {
    const radians = heading * Math.PI / 180;
    const forward = { x: Math.cos(radians), y: Math.sin(radians) };
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const exit = { x: 100, y: 100, heading };
    const point = lateral => ({
      x: exit.x + forward.x * 4 + right.x * lateral,
      y: exit.y + forward.y * 4 + right.y * lateral
    });
    const fastPath = {
      activePlacementAnchor: { x: 1, y: 1, heading },
      // The physical movement must first leave the 10px repeat zone, while
      // the selection itself remains measured from the ghost exit.
      physicalPointerOrigin: { x: exit.x - forward.x * 16, y: exit.y - forward.y * 16 }
    };
    const rightMove = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: point(35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    const centerMove = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: point(0), ghostExitScreen: exit, currentType: FAST.RIGHT });
    const leftMove = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: point(-35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    assert.equal(rightMove.phase, FAST.SELECT);
    assert.equal(rightMove.type, FAST.RIGHT);
    assert.equal(centerMove.type, FAST.STRAIGHT);
    assert.equal(leftMove.type, FAST.LEFT);
    assert.equal(rightMove.activePlacementAnchor, fastPath.activePlacementAnchor);
  });
}

test('runtime pointer flow keeps an anchored ghost beyond 90px while the pointer leads forward', () => {
  const fastPath = { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin: { x: 0, y: 0 } };
  const exit = { x: 0, y: 0, heading: 0 };
  assert.equal(FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: { x: 90, y: 0 }, ghostExitScreen: exit, currentType: FAST.STRAIGHT }).phase, FAST.SELECT);
  for (const forwardPx of [91, 150, 200]) {
    const leading = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: { x: forwardPx, y: 0 }, ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    assert.equal(leading.phase, FAST.SELECT);
    assert.equal(leading.activePlacementAnchor, fastPath.activePlacementAnchor);
  }
});

test('runtime flow uses the actual leading pointer for both release and side selection', () => {
  const fastPath = { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin: { x: 10, y: 10 } };
  const result = FAST.runtimeTransitionForPointer({
    fastPath,
    physicalPointerScreen: { x: 500, y: 535 },
    selectionPointerScreen: { x: 500, y: 535 },
    ghostExitScreen: { x: 500, y: 500, heading: 0 },
    currentType: FAST.STRAIGHT
  });
  assert.equal(result.phase, FAST.SELECT);
  assert.equal(result.type, FAST.RIGHT);
  assert.equal(result.forwardPx, 0);
  assert.equal(result.lateralPx, 35);
});

test('the 20-30px transition band keeps the current ghost type', () => {
  const anchor = { x: 0, y: 0 };
  assert.equal(FAST.typeForPointer({ currentType: FAST.LEFT, anchorScreen: anchor, pointerScreen: { x: 0, y: -25 }, headingDeg: 0 }).type, FAST.LEFT);
  assert.equal(FAST.typeForPointer({ currentType: FAST.RIGHT, anchorScreen: anchor, pointerScreen: { x: 0, y: 25 }, headingDeg: 0 }).type, FAST.RIGHT);
});

test('leading-pointer release is directional and has lateral/backward hysteresis', () => {
  const anchor = { x: 1, y: 1, heading: 0 };
  const fastPath = { phase: FAST.SELECT, activePlacementAnchor: anchor, physicalPointerOrigin: { x: 0, y: 0 } };
  const exit = { x: 0, y: 0, heading: 0 };
  const runtime = point => FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: point, ghostExitScreen: exit, currentType: FAST.STRAIGHT });
  assert.equal(runtime({ x: 200, y: 0 }).phase, FAST.SELECT);
  assert.equal(runtime({ x: 200, y: 90 }).phase, FAST.SELECT);
  assert.equal(runtime({ x: 200, y: 100 }).phase, FAST.SELECT);
  assert.equal(runtime({ x: 200, y: 111 }).phase, FAST.FREE);
  assert.equal(runtime({ x: -40, y: 0 }).phase, FAST.SELECT);
  assert.equal(runtime({ x: -51, y: 0 }).phase, FAST.FREE);
});

for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
  test(`leading pointer stays anchored and selects left/center/right at ${heading} degrees`, () => {
    const radians = heading * Math.PI / 180;
    const forward = { x: Math.cos(radians), y: Math.sin(radians) };
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const exit = { x: 400, y: 300, heading };
    const fastPath = { phase: FAST.SELECT, activePlacementAnchor: { x: 1, y: 1, heading }, physicalPointerOrigin: { x: 0, y: 0 } };
    const pointerAt = lateral => ({ x: exit.x + forward.x * 200 + right.x * lateral, y: exit.y + forward.y * 200 + right.y * lateral });
    const center = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: pointerAt(0), ghostExitScreen: exit, currentType: FAST.RIGHT });
    const rightTurn = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: pointerAt(35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    const leftTurn = FAST.runtimeTransitionForPointer({ fastPath, pointerScreen: pointerAt(-35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    for (const result of [center, rightTurn, leftTurn]) assert.equal(result.phase, FAST.SELECT);
    assert.equal(center.type, FAST.STRAIGHT);
    assert.equal(rightTurn.type, FAST.RIGHT);
    assert.equal(leftTurn.type, FAST.LEFT);
  });
}

test('the fast-path guide is an HTML overlay and hides outside anchored placement', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  const styles = fs.readFileSync('styles.css', 'utf8');
  assert.match(index, /id="fastPathGuide"/);
  assert.match(styles, /\.fast-path-guide/);
  assert.match(app, /fast\.phase !== FAST_PATH\.FREE/);
  assert.match(app, /state\.mode === 'place'/);
  assert.match(app, /guide\.hidden = !visible/);
  assert.match(app, /fast\.guideVisible = false/);
});
