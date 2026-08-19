const test = require('node:test');
const assert = require('node:assert/strict');
const pose = require('./part-render-pose.js');

const START_WIDTH_CM = 54;
const START_HEIGHT_CM = 36;

function rotatedSize(rotation) {
  return pose.rotatedRectSize(START_WIDTH_CM, START_HEIGHT_CM, rotation);
}

test('Start outline guide keeps the source AABB center but uses the verified Start dimensions', () => {
  const sourceSize = rotatedSize(45);
  const geometry = pose.startOutlineGuideGeometry(
    { w: START_WIDTH_CM, h: START_HEIGHT_CM },
    { x: 10, y: 20, w: sourceSize.w, h: sourceSize.h },
    45,
    2
  );
  assert.deepEqual(geometry.center, { x: 10 + sourceSize.w / 2, y: 20 + sourceSize.h / 2 });
  assert.equal(geometry.rotationDeg, 45);
  assert.deepEqual(geometry.rect, { x: -29, y: -20, w: 58, h: 40 });
});

test('Start outline geometry preserves horizontal, vertical and diagonal rotations', () => {
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const geometry = pose.startOutlineGuideGeometry(
      { w: START_WIDTH_CM, h: START_HEIGHT_CM },
      { x: 0, y: 0, w: 100, h: 100 },
      rotation,
      1
    );
    assert.equal(geometry.rotationDeg, rotation);
    assert.deepEqual(geometry.center, { x: 50, y: 50 });
  }
});

test('rotated Start AABB matching is exact for all 45-degree orientations', () => {
  const definition = { w: START_WIDTH_CM, h: START_HEIGHT_CM };
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const size = rotatedSize(rotation);
    assert.equal(pose.sourceRectMatchesRotatedStart(definition, { w: size.w, h: size.h }, rotation), true);
    assert.equal(pose.sourceRectMatchesRotatedStart(definition, { w: size.w + 0.01, h: size.h }, rotation), false);
  }
});

test('only a dashed rotated-Start-sized rectangle in Start mode is replaced', () => {
  const definition = { w: START_WIDTH_CM, h: START_HEIGHT_CM };
  const size = rotatedSize(45);
  const documentValue = { getElementById: () => ({ textContent: '45°' }) };
  const makeContext = ({ mode = true, dash = [6, 4] } = {}) => ({
    canvas: { id: 'courseCanvas', classList: { contains: () => mode } },
    getLineDash: () => dash
  });
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext(), documentValue, definition, { x: 0, y: 0, ...size }), true);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ dash: [] }), documentValue, definition, { x: 0, y: 0, ...size }), false);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ mode: false }), documentValue, definition, { x: 0, y: 0, ...size }), false);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext(), documentValue, definition, { x: 0, y: 0, w: 500, h: 500 }), false);
});

test('installed hook draws a rotated physical Start rectangle instead of the supplied AABB', () => {
  class FakeContext {
    constructor() {
      this.canvas = { id: 'courseCanvas', classList: { contains: () => true } };
      this.strokeStyle = '#249b74';
      this.lineWidth = 2;
      this.calls = [];
    }
    getLineDash() { return [6, 4]; }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    translate(x, y) { this.calls.push(['translate', x, y]); }
    rotate(value) { this.calls.push(['rotate', value]); }
    strokeRect(x, y, w, h) { this.calls.push(['native', x, y, w, h]); }
  }
  const root = {
    CanvasRenderingContext2D: FakeContext,
    M4WD_PART_CATALOG: { PARTS: { start: { w: START_WIDTH_CM, h: START_HEIGHT_CM } } },
    document: { getElementById: () => ({ textContent: '45°' }) }
  };
  assert.equal(pose.installStartPlacementOutlineGuide(root), true);
  const context = new FakeContext();
  const size = rotatedSize(45);
  context.strokeRect(10, 20, size.w, size.h);
  assert.deepEqual(context.calls[0], ['save']);
  assert.ok(Math.abs(context.calls[1][1] - (10 + size.w / 2)) < 1e-12);
  assert.ok(Math.abs(context.calls[1][2] - (20 + size.h / 2)) < 1e-12);
  assert.equal(context.calls[2][0], 'rotate');
  assert.ok(Math.abs(context.calls[2][1] - Math.PI / 4) < 1e-12);
  assert.deepEqual(context.calls[3], ['native', -29, -20, 58, 40]);
  assert.deepEqual(context.calls[4], ['restore']);
});

test('hook leaves unrelated dashed rectangles unchanged', () => {
  class FakeContext {
    constructor() {
      this.canvas = { id: 'courseCanvas', classList: { contains: () => true } };
      this.strokeStyle = '#6e716d';
      this.lineWidth = 2;
      this.calls = [];
    }
    getLineDash() { return [8, 5]; }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    translate(x, y) { this.calls.push(['translate', x, y]); }
    rotate(value) { this.calls.push(['rotate', value]); }
    strokeRect(x, y, w, h) { this.calls.push(['native', x, y, w, h]); }
  }
  const root = {
    CanvasRenderingContext2D: FakeContext,
    M4WD_PART_CATALOG: { PARTS: { start: { w: START_WIDTH_CM, h: START_HEIGHT_CM } } },
    document: { getElementById: () => ({ textContent: '45°' }) }
  };
  pose.installStartPlacementOutlineGuide(root);
  const context = new FakeContext();
  context.strokeRect(1, 2, 500, 500);
  assert.deepEqual(context.calls, [['native', 1, 2, 500, 500]]);
});
