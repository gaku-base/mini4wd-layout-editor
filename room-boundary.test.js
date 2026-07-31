const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ROOM = require('./room-boundary.js');

test('site boundary rounds to 10mm, accepts negative origins, and enforces 10mm sizes', () => {
  assert.deepEqual(ROOM.normalizeSiteBoundary({ x: -14, y: -15, width: 4, height: -7 }), {
    name: '設置範囲', shape: 'rectangle', x: -10, y: -10, width: 10, height: 10, visible: true
  });
});

test('legacy field creates a backwards-compatible site boundary', () => {
  assert.deepEqual(ROOM.defaultSiteBoundary({ originX: -20, originY: 10, widthCm: 900, heightCm: 600 }), {
    name: '設置範囲', shape: 'rectangle', x: -200, y: 100, width: 9000, height: 6000, visible: true
  });
});

test('reverse drag creates a minimum rounded rectangle', () => {
  const cutout = ROOM.cutoutFromDrag({ x: 95, y: 205 }, { x: -4, y: 101 });
  assert.deepEqual({ x: cutout.x, y: cutout.y, width: cutout.width, height: cutout.height }, { x: 0, y: 100, width: 100, height: 110 });
});

test('outside cutouts are allowed and only their overlap removes room area', () => {
  const boundary = { width: 9000, height: 6000 };
  const metrics = ROOM.effectiveRoomMetrics(boundary, [{ id: 'x', x: 6000, y: -1000, width: 5000, height: 3500 }]);
  assert.equal(metrics.cutoutArea, 3000 * 2500);
  assert.equal(metrics.effectiveArea, 9000 * 6000 - 3000 * 2500);
  assert.equal(ROOM.effectiveRoomMetrics(boundary, [{ id: 'outside', x: 10000, y: 0, width: 100, height: 100 }]).cutoutArea, 0);
});

test('visible cutout paint rectangles are independently clipped to the site boundary', () => {
  const boundary = { x: 0, y: 0, width: 9000, height: 6000 };
  const rects = ROOM.visibleCutoutIntersections(boundary, [
    { id: 'upper', x: 6000, y: -1000, width: 5000, height: 3500 },
    { id: 'lower', x: 1000, y: 4000, width: 2000, height: 2500 },
    { id: 'outside', x: 10000, y: 0, width: 100, height: 100 }
  ]);
  assert.deepEqual(rects, [
    { left: 6000, top: 0, right: 9000, bottom: 2500 },
    { left: 1000, top: 4000, right: 3000, bottom: 6000 }
  ]);
  assert.equal(ROOM.unionArea(rects), 11500000);
});

test('overlapping cutout mask remains a union while disconnected rectangles stay disconnected', () => {
  const boundary = { width: 1000, height: 1000 };
  const rects = ROOM.visibleCutoutIntersections(boundary, [
    { id: 'a', x: 0, y: 0, width: 600, height: 600 },
    { id: 'b', x: 400, y: 400, width: 600, height: 600 }
  ]);
  assert.equal(rects.length, 2);
  assert.equal(ROOM.unionArea(rects), 680000);
});

test('overlapping cutouts are unioned once and invisible cutouts do not exclude space', () => {
  const boundary = { width: 1000, height: 1000 };
  const base = [{ id: 'a', x: 0, y: 0, width: 600, height: 600 }, { id: 'b', x: 400, y: 400, width: 600, height: 600 }];
  assert.equal(ROOM.effectiveRoomMetrics(boundary, base).cutoutArea, 680000);
  assert.equal(ROOM.effectiveRoomMetrics(boundary, [{ ...base[0], visible: false }]).cutoutArea, 0);
});

test('rotation uses an exterior rectangle for distances', () => {
  const distances = ROOM.distancesToBoundary({ width: 1000, height: 800 }, { id: 'a', x: 100, y: 200, width: 400, height: 200, rotation: 90 });
  assert.deepEqual(distances, { left: 200, right: 600, top: 100, bottom: 300 });
});

test('screen and world coordinates round-trip independently of zoom, pan, and DPR', () => {
  [0.5, 1, 2].forEach(scale => {
    const view = { scale, offsetX: 137, offsetY: -53 };
    const world = { x: 321.25, y: -48.5 };
    const screen = ROOM.worldToScreen(world, view);
    assert.deepEqual(ROOM.screenToWorld(screen, view), world);
  });
});

test('cutout dragging uses the start position plus one total rounded delta', () => {
  const drag = ROOM.beginCutoutDrag({ id: 'a', x: 1000, y: 2000, width: 400, height: 300 }, { x: 500, y: 700 }, 9);
  assert.deepEqual(ROOM.cutoutPositionForDrag(drag, { x: 540, y: 740 }), { x: 1040, y: 2040 });
  // The second event is still measured from the original pointer, not added
  // to the first event's already-updated cutout position.
  assert.deepEqual(ROOM.cutoutPositionForDrag(drag, { x: 560, y: 750 }), { x: 1060, y: 2050 });
});

test('wall dimensions use full cutout geometry even with no room intersection', () => {
  const geometry = ROOM.wallDimensionGeometry(
    { x: 0, y: 0, width: 9000, height: 6000 },
    { id: 'outside', x: 9000, y: -1000, width: 2000, height: 3000 }
  );
  assert.deepEqual(geometry.bounds, { left: 9000, top: -1000, right: 11000, bottom: 2000 });
  assert.deepEqual(geometry.distances, { left: 9000, right: -2000, top: -1000, bottom: 4000 });
  assert.equal(ROOM.visibleCutoutIntersections({ width: 9000, height: 6000 }, [{ id: 'outside', x: 9000, y: -1000, width: 2000, height: 3000 }]).length, 0);
});

test('cutouts normalize invalid shape and rotation, deduplicate ids, move and duplicate safely', () => {
  const cutouts = ROOM.normalizeRoomCutouts([{ id: 'a', shape: 'ellipse', rotation: 40 }, { id: 'a', width: 20, height: 30 }]);
  assert.deepEqual(cutouts.map(item => [item.id, item.shape, item.rotation]), [['a', 'rectangle', 0], ['a-2', 'rectangle', 0]]);
  assert.deepEqual(ROOM.moveCutout(cutouts[0], { x: -16, y: 24 }).x, -20);
  assert.equal(ROOM.duplicateCutout(cutouts[0], cutouts).id, 'cutout-1');
});

test('CAD model is loaded before app code and persisted field names remain additive', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const persistence = fs.readFileSync('persistence.js', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  assert.ok(index.indexOf('src="room-boundary.js"') < index.indexOf('src="app.js"'));
  assert.ok(index.indexOf('src="render-scheduler.js"') < index.indexOf('src="app.js"'));
  assert.match(persistence, /'siteBoundary', 'roomCutouts'/);
  assert.match(app, /visibleCutoutIntersections\(state\.siteBoundary, state\.roomCutouts\)/);
  assert.match(app, /c\.rect\(box\.x, box\.y, box\.w, box\.h\); c\.closePath\(\);/);
  assert.match(app, /ctx\.globalCompositeOperation = 'source-over';/);
  assert.match(app, /c\.clip\('nonzero'\)/);
  assert.match(app, /if \(els\.courseCanvas\.width !== nextWidth\)/);
  assert.match(app, /if \(els\.courseCanvas\.height !== nextHeight\)/);
  assert.match(app, /renderScheduler\.request\(drawFrame\)/);
  assert.doesNotMatch(app, /cancelAnimationFrame\(raf\)/);
  assert.match(app, /beginCutoutDrag\(hit, point, e\.pointerId\)/);
  assert.match(app, /cutoutPositionForDrag\(drag, point\)/);
  assert.match(app, /els\.courseCanvas\.setPointerCapture\(e\.pointerId\)/);
  assert.match(app, /if \(state\.mode === 'cutout'\) cancelCadDrag\(\)/);
  assert.match(app, /cutoutDimensionOverlay/);
});

test('canvas navigation is Ctrl-wheel zoom only and carries no pan state', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const index = fs.readFileSync('index.html', 'utf8');
  const wheel = app.slice(app.indexOf('function onWheel'), app.indexOf('function onKeyDown'));
  assert.match(app, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
  assert.match(wheel, /if \(!e\.ctrlKey\) return;\s*e\.preventDefault\(\);/);
  assert.match(wheel, /if \(state\.pointer\.down\) return;/);
  assert.match(wheel, /const before = screenToWorld\(sx, sy\);/);
  assert.match(wheel, /state\.view\.offsetX = sx - before\.x \* state\.view\.scale;/);
  assert.doesNotMatch(wheel, /rotateCurrent|cycleSnapTargetChoice/);
  assert.doesNotMatch(app, /spaceDown|pointer\.panning|is-panning|function onKeyUp/);
  assert.match(app, /if \(e\.button !== 0 && !state\.layoutMove\.active\) return;/);
  assert.doesNotMatch(index, /Space\+ドラッグ|Z \/ X \/ ホイール/);
});

test('dimension labels are centered on either orientation and retain their midpoint for negative distances', () => {
  const horizontal = ROOM.horizontalDimensionLabelPoint({ x: 840, y: 100 }, { x: -160, y: 100 });
  const vertical = ROOM.verticalDimensionLabelPoint({ x: 20, y: 900 }, { x: 20, y: -300 });
  assert.deepEqual(horizontal, { x: 340, y: 100 });
  assert.deepEqual(vertical, { x: 20, y: 300 });
  assert.deepEqual(ROOM.horizontalDimensionLabelPoint({ x: -160, y: 100 }, { x: 840, y: 100 }), horizontal);
  [0.5, 1, 2].forEach(scale => {
    const view = { scale, offsetX: 41, offsetY: -19 };
    const a = ROOM.worldToScreen({ x: -16, y: 10 }, view);
    const b = ROOM.worldToScreen({ x: 84, y: 10 }, view);
    assert.deepEqual(ROOM.horizontalDimensionLabelPoint(a, b), { x: (a.x + b.x) / 2, y: 10 * scale - 19 });
  });
});

test('effective room corners retain L-shape concave and convex corners only', () => {
  const corners = ROOM.effectiveRoomCornerCandidates(
    { x: 0, y: 0, width: 9000, height: 6000 },
    [{ id: 'upper-right', x: 6000, y: 0, width: 3000, height: 2500 }]
  );
  assert.deepEqual(corners.map(point => point.key), ['0,0', '0,6000', '6000,0', '6000,2500', '9000,2500', '9000,6000']);
});

test('effective room corners remove union-internal and hidden-cutout vertices', () => {
  const boundary = { x: 0, y: 0, width: 1000, height: 1000 };
  const corners = ROOM.effectiveRoomCornerCandidates(boundary, [
    { id: 'left', x: 200, y: 200, width: 400, height: 400 },
    { id: 'right', x: 500, y: 200, width: 300, height: 400 },
    { id: 'hidden', x: 0, y: 700, width: 200, height: 300, visible: false }
  ]);
  const keys = corners.map(point => point.key);
  assert.ok(!keys.includes('500,200'));
  assert.ok(!keys.includes('0,700'));
  assert.ok(keys.includes('200,200'));
  assert.ok(keys.includes('800,600'));
  const withoutLeft = ROOM.effectiveRoomCornerCandidates(boundary, [{ id: 'left', x: 200, y: 200, width: 400, height: 400 }], { excludeCutoutId: 'left' });
  assert.deepEqual(withoutLeft.map(point => point.key), ['0,0', '0,1000', '1000,0', '1000,1000']);
});

test('screen corner snapping uses enter/exit hysteresis and stable ordering', () => {
  const candidates = [{ key: 'a', x: 12, y: 0 }, { key: 'b', x: -12, y: 0 }];
  assert.equal(ROOM.selectScreenCornerSnap({ x: 0, y: 0 }, candidates, { enterPx: 12, exitPx: 18 }).candidate.key, 'b');
  assert.equal(ROOM.selectScreenCornerSnap({ x: 16, y: 0 }, candidates, { activeKey: 'a', enterPx: 12, exitPx: 18 }).candidate.key, 'a');
  assert.equal(ROOM.selectScreenCornerSnap({ x: 31, y: 0 }, candidates, { activeKey: 'a', enterPx: 12, exitPx: 18 }), null);
});

test('CAD pointer moves do not rebuild the sidebar or persist, and no-op resize does not paint', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const move = app.slice(app.indexOf('function onCadPointerMove'), app.indexOf('function onCadPointerUp'));
  const resize = app.slice(app.indexOf('function resizeCanvas'), app.indexOf('function fitView'));
  assert.doesNotMatch(move, /updateUI\(\)/);
  assert.doesNotMatch(move, /persistLocal\(\)/);
  assert.match(move, /updateCutoutDimensionOverlay\(\);\s*render\(\);/);
  assert.match(resize, /if \(!sizeChanged\) return false;/);
  assert.match(resize, /Math\.abs\(dpr - nextDpr\) > \.001/);
  assert.match(app, /renderScheduler\.request\(drawFrame\)/);
  assert.doesNotMatch(app, /new ResizeObserver/);
});

test('one common midpoint handles horizontal, vertical, diagonal, reverse, negative, and zoomed screen endpoints', () => {
  const start = { x: -50, y: 120 };
  const end = { x: 350, y: -80 };
  assert.deepEqual(ROOM.dimensionMidpoint(start, end), { x: 150, y: 20 });
  assert.deepEqual(ROOM.dimensionMidpoint(end, start), { x: 150, y: 20 });
  assert.deepEqual(ROOM.horizontalDimensionLabelPoint({ x: 20, y: 40 }, { x: 220, y: 40 }), { x: 120, y: 40 });
  assert.deepEqual(ROOM.verticalDimensionLabelPoint({ x: 20, y: 40 }, { x: 20, y: 240 }), { x: 20, y: 140 });
  [0.5, 1, 2].forEach(scale => {
    const view = { scale, offsetX: 17, offsetY: 29 };
    const a = ROOM.worldToScreen({ x: -5, y: 12 }, view);
    const b = ROOM.worldToScreen({ x: 35, y: -8 }, view);
    assert.deepEqual(ROOM.dimensionMidpoint(a, b), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  });
});

test('effective room boundary segments keep only actual outer and inner walls', () => {
  const rectangle = ROOM.effectiveRoomBoundarySegments({ x: 0, y: 0, width: 9000, height: 6000 });
  assert.deepEqual(rectangle.map(segment => [segment.orientation, segment.x1, segment.y1, segment.x2, segment.y2]), [
    ['horizontal', 0, 0, 9000, 0], ['horizontal', 0, 6000, 9000, 6000],
    ['vertical', 0, 0, 0, 6000], ['vertical', 9000, 0, 9000, 6000]
  ]);
  const lShape = ROOM.effectiveRoomBoundarySegments({ x: 0, y: 0, width: 9000, height: 6000 }, [{ id: 'upper-right', x: 6000, y: 0, width: 3000, height: 2500 }]);
  assert.ok(lShape.some(segment => segment.orientation === 'horizontal' && segment.y1 === 2500 && segment.x1 === 6000 && segment.x2 === 9000));
  assert.ok(lShape.some(segment => segment.orientation === 'vertical' && segment.x1 === 6000 && segment.y1 === 0 && segment.y2 === 2500));
  assert.ok(!ROOM.effectiveRoomBoundarySegments({ x: 0, y: 0, width: 9000, height: 6000 }, [{ id: 'hidden', x: 0, y: 0, width: 1000, height: 1000, visible: false }]).some(segment => segment.x1 === 1000 || segment.y1 === 1000));
});

test('boundary segment projection clamps to segment ends without using an extension', () => {
  assert.deepEqual(ROOM.closestPointOnBoundarySegment({ x: 40, y: 99 }, { orientation: 'horizontal', x1: 100, y1: 50, x2: 300, y2: 50 }), { x: 100, y: 50 });
  assert.deepEqual(ROOM.closestPointOnBoundarySegment({ x: 240, y: 99 }, { orientation: 'horizontal', x1: 100, y1: 50, x2: 300, y2: 50 }), { x: 240, y: 50 });
  assert.deepEqual(ROOM.closestPointOnBoundarySegment({ x: 99, y: 700 }, { orientation: 'vertical', x1: 40, y1: 100, x2: 40, y2: 500 }), { x: 40, y: 500 });
});

test('dimension overlay shares the canvas guide-line endpoints and uses a centered HTML transform', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const draw = app.slice(app.indexOf('function drawCadDimensions'), app.indexOf('function resolvePartDef'));
  const overlay = app.slice(app.indexOf('function updateCutoutDimensionOverlay'), app.indexOf('function makeId'));
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(draw, /cadDimensionLines\(cutout\)/);
  assert.match(overlay, /cadDimensionLines\(cutout\)\.map/);
  assert.match(overlay, /worldToScreen\(line\.start\.x, line\.start\.y\)/);
  assert.match(overlay, /worldToScreen\(line\.end\.x, line\.end\.y\)/);
  assert.match(css, /\.cutout-dimension-overlay span \{[^}]*translate\(-50%, -50%\)/);
});
