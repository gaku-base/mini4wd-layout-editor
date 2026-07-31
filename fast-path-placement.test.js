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
    const physicalPointerOrigin = { x: 24, y: 36 };
    const selectionPoint = lateral => ({
      x: exit.x + forward.x * 16 + right.x * lateral,
      y: exit.y + forward.y * 16 + right.y * lateral
    });
    const physicalPoint = lateral => ({
      x: physicalPointerOrigin.x + forward.x * 16 + right.x * lateral,
      y: physicalPointerOrigin.y + forward.y * 16 + right.y * lateral
    });
    const fastPath = {
      activePlacementAnchor: { x: 1, y: 1, heading },
      physicalPointerOrigin,
      selectionPointerOrigin: exit
    };
    const rightMove = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalPoint(35), selectionPointerScreen: selectionPoint(35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    const centerMove = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalPoint(0), selectionPointerScreen: selectionPoint(0), ghostExitScreen: exit, currentType: FAST.RIGHT });
    const leftMove = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalPoint(-35), selectionPointerScreen: selectionPoint(-35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
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

test('selection pointer applies the physical delta to a distinct ghost-exit origin', () => {
  const physicalPointerOrigin = { x: 10, y: 10 };
  const selectionPointerOrigin = { x: 500, y: 500 };
  const physicalPointerCurrent = { x: 10, y: 45 };
  const selectionPointerScreen = FAST.selectionPointerFromPhysicalDelta({
    physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent
  });
  assert.deepEqual(selectionPointerScreen, { x: 500, y: 535 });
  const fastPath = { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin, selectionPointerOrigin };
  const result = FAST.runtimeTransitionForPointer({
    fastPath,
    physicalPointerScreen: physicalPointerCurrent,
    selectionPointerScreen,
    ghostExitScreen: { x: 500, y: 500, heading: 0 },
    currentType: FAST.STRAIGHT
  });
  assert.equal(result.phase, FAST.SELECT);
  assert.equal(result.type, FAST.RIGHT);
  assert.equal(result.forwardPx, 0);
  assert.equal(result.lateralPx, 35);
});

test('zero physical delta retains the current repeat type even when origins differ', () => {
  const pointer = { x: 35, y: 85 };
  const selection = FAST.selectionPointerFromPhysicalDelta({
    physicalPointerOrigin: pointer,
    selectionPointerOrigin: { x: 480, y: 260 },
    physicalPointerCurrent: pointer
  });
  const result = FAST.runtimeTransitionForPointer({
    fastPath: { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin: pointer },
    physicalPointerScreen: pointer,
    selectionPointerScreen: selection,
    ghostExitScreen: { x: 480, y: 260, heading: 0 },
    currentType: FAST.RIGHT
  });
  assert.equal(result.phase, FAST.REPEAT);
  assert.equal(result.type, FAST.RIGHT);
});

test('relative lateral deltas select the exact 30px left and right thresholds', () => {
  const physicalPointerOrigin = { x: 40, y: 80 };
  const selectionPointerOrigin = { x: 420, y: 260 };
  const fastPath = { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin, selectionPointerOrigin };
  const selectAt = lateral => {
    const physicalPointerScreen = { x: physicalPointerOrigin.x + 16, y: physicalPointerOrigin.y + lateral };
    const selectionPointerScreen = FAST.selectionPointerFromPhysicalDelta({
      physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent: physicalPointerScreen
    });
    return FAST.runtimeTransitionForPointer({
      fastPath, physicalPointerScreen, selectionPointerScreen,
      ghostExitScreen: { ...selectionPointerOrigin, heading: 0 }, currentType: FAST.STRAIGHT
    });
  };
  assert.equal(selectAt(30).type, FAST.RIGHT);
  assert.equal(selectAt(-30).type, FAST.LEFT);
  assert.equal(selectAt(0).type, FAST.STRAIGHT);
});

test('a reattached session selects from its fresh ghost exit, not the prior exit', () => {
  const physicalPointerOrigin = { x: 720, y: 160 };
  const freshSelectionPointerOrigin = { x: 180, y: 420 };
  const physicalPointerCurrent = { x: 736, y: 195 };
  const selectionPointerScreen = FAST.selectionPointerFromPhysicalDelta({
    physicalPointerOrigin,
    selectionPointerOrigin: freshSelectionPointerOrigin,
    physicalPointerCurrent
  });
  assert.deepEqual(selectionPointerScreen, { x: 196, y: 455 });
  const result = FAST.runtimeTransitionForPointer({
    fastPath: { activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin, selectionPointerOrigin: freshSelectionPointerOrigin },
    physicalPointerScreen: physicalPointerCurrent,
    selectionPointerScreen,
    ghostExitScreen: { ...freshSelectionPointerOrigin, heading: 0 },
    currentType: FAST.STRAIGHT
  });
  assert.equal(result.phase, FAST.SELECT);
  assert.equal(result.type, FAST.RIGHT);
});

test('a fixed selection frame keeps center → right → center attached', () => {
  const physicalPointerOrigin = { x: 80, y: 100 };
  const selectionPointerOrigin = { x: 420, y: 300 };
  const fastPath = {
    activePlacementAnchor: { x: 1, y: 1, heading: 0 },
    physicalPointerOrigin,
    releasePointerOrigin: physicalPointerOrigin,
    selectionPointerOrigin,
    selectionFrameHeading: 0
  };
  const run = (lateral, currentType) => {
    const physicalPointerScreen = { x: physicalPointerOrigin.x + 16, y: physicalPointerOrigin.y + lateral };
    const selectionPointerScreen = FAST.selectionPointerFromPhysicalDelta({
      physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent: physicalPointerScreen
    });
    return FAST.runtimeTransitionForPointer({
      fastPath, physicalPointerScreen, selectionPointerScreen,
      // The selected Right ghost has a different exit heading, which must not
      // rotate this placement cycle's selection or release frame.
      ghostExitScreen: { x: 450, y: 330, heading: 45 }, currentType
    });
  };
  const right = run(35, FAST.STRAIGHT);
  const center = run(0, FAST.RIGHT);
  assert.equal(right.phase, FAST.SELECT);
  assert.equal(right.type, FAST.RIGHT);
  assert.equal(center.phase, FAST.SELECT);
  assert.equal(center.type, FAST.STRAIGHT);
});

test('a fixed selection frame supports left → center and right → left without release', () => {
  const physicalPointerOrigin = { x: 160, y: 220 };
  const selectionPointerOrigin = { x: 560, y: 160 };
  const fastPath = {
    activePlacementAnchor: { x: 1, y: 1, heading: 0 }, physicalPointerOrigin,
    selectionPointerOrigin, selectionFrameHeading: 0
  };
  const run = (lateral, currentType) => {
    const physicalPointerScreen = { x: physicalPointerOrigin.x + 16, y: physicalPointerOrigin.y + lateral };
    return FAST.runtimeTransitionForPointer({
      fastPath, physicalPointerScreen,
      selectionPointerScreen: FAST.selectionPointerFromPhysicalDelta({ physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent: physicalPointerScreen }),
      ghostExitScreen: { x: 590, y: 190, heading: 315 }, currentType
    });
  };
  const left = run(-35, FAST.STRAIGHT);
  const center = run(0, FAST.LEFT);
  const right = run(35, FAST.LEFT);
  assert.equal(left.phase, FAST.SELECT);
  assert.equal(left.type, FAST.LEFT);
  assert.equal(center.phase, FAST.SELECT);
  assert.equal(center.type, FAST.STRAIGHT);
  assert.equal(right.phase, FAST.SELECT);
  assert.equal(right.type, FAST.RIGHT);
});

for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
  test(`fixed selection frame remains stable across ghost exits at ${heading} degrees`, () => {
    const radians = heading * Math.PI / 180;
    const forward = { x: Math.cos(radians), y: Math.sin(radians) };
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const physicalPointerOrigin = { x: 120, y: 140 };
    const selectionPointerOrigin = { x: 500, y: 360 };
    const fastPath = {
      activePlacementAnchor: { x: 1, y: 1, heading }, physicalPointerOrigin,
      selectionPointerOrigin, selectionFrameHeading: heading
    };
    const run = (lateral, currentType) => {
      const physicalPointerScreen = {
        x: physicalPointerOrigin.x + forward.x * 16 + right.x * lateral,
        y: physicalPointerOrigin.y + forward.y * 16 + right.y * lateral
      };
      return FAST.runtimeTransitionForPointer({
        fastPath, physicalPointerScreen,
        selectionPointerScreen: FAST.selectionPointerFromPhysicalDelta({ physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent: physicalPointerScreen }),
        ghostExitScreen: { x: 530, y: 390, heading: (heading + 45) % 360 }, currentType
      });
    };
    const center = run(0, FAST.RIGHT);
    const rightTurn = run(35, FAST.STRAIGHT);
    const leftTurn = run(-35, FAST.STRAIGHT);
    assert.equal(center.phase, FAST.SELECT);
    assert.equal(center.type, FAST.STRAIGHT);
    assert.equal(rightTurn.type, FAST.RIGHT);
    assert.equal(leftTurn.type, FAST.LEFT);
  });
}

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
    const physicalPointerOrigin = { x: 40, y: 60 };
    const fastPath = { phase: FAST.SELECT, activePlacementAnchor: { x: 1, y: 1, heading }, physicalPointerOrigin, selectionPointerOrigin: exit };
    const physicalAt = lateral => ({ x: physicalPointerOrigin.x + forward.x * 200 + right.x * lateral, y: physicalPointerOrigin.y + forward.y * 200 + right.y * lateral });
    const selectionAt = lateral => FAST.selectionPointerFromPhysicalDelta({
      physicalPointerOrigin, selectionPointerOrigin: exit, physicalPointerCurrent: physicalAt(lateral)
    });
    const center = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalAt(0), selectionPointerScreen: selectionAt(0), ghostExitScreen: exit, currentType: FAST.RIGHT });
    const rightTurn = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalAt(35), selectionPointerScreen: selectionAt(35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
    const leftTurn = FAST.runtimeTransitionForPointer({ fastPath, physicalPointerScreen: physicalAt(-35), selectionPointerScreen: selectionAt(-35), ghostExitScreen: exit, currentType: FAST.STRAIGHT });
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

test('app lifecycle fixes the selection frame at activation and keeps it through type changes', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const fast = fs.readFileSync('fast-path-placement.js', 'utf8');
  const activateStart = app.indexOf('function activateFastPathPlacement');
  const activateEnd = app.indexOf('function fastPathGhostExitScreen', activateStart);
  const applyStart = app.indexOf('function applyFastPathSelectionResult');
  const applyEnd = app.indexOf('function updateFastPathTypeForPointer', applyStart);
  const activate = app.slice(activateStart, activateEnd);
  const apply = app.slice(applyStart, applyEnd);
  assert.match(activate, /selectionFrameHeading = normalizeRotation\(anchor\.heading\)/);
  assert.match(fast, /headingDeg: selectionFrameHeading/);
  assert.match(app, /Number\.isFinite\(fast\.selectionFrameHeading\)\r?\n      \? fast\.selectionFrameHeading/);
  assert.doesNotMatch(apply, /rebaseFastPathSelectionPointer/);
});
