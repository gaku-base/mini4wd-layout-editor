const test = require('node:test');
const assert = require('node:assert/strict');
const pose = require('./part-render-pose.js');

const START_WIDTH_CM = 54;
const START_HEIGHT_CM = 36;
const START_DEF = { w: START_WIDTH_CM, h: START_HEIGHT_CM };

function rotatedSize(rotation) {
  return pose.rotatedRectSize(START_WIDTH_CM, START_HEIGHT_CM, rotation);
}

function startModeCanvas(enabled = true) {
  return { id: 'courseCanvas', classList: { contains: name => name === 'mode-start-position' && enabled } };
}

test('Start outline guide keeps the source AABB center and offsets by half the stroke width', () => {
  const sourceSize = rotatedSize(45);
  const geometry = pose.startOutlineGuideGeometry(
    START_DEF,
    { x: 10, y: 20, w: sourceSize.w, h: sourceSize.h },
    45,
    2
  );
  assert.deepEqual(geometry.center, { x: 10 + sourceSize.w / 2, y: 20 + sourceSize.h / 2 });
  assert.equal(geometry.rotationDeg, 45);
  assert.deepEqual(geometry.rect, { x: -28, y: -19, w: 56, h: 38 });
});

test('Start outline geometry preserves horizontal, vertical and diagonal rotations', () => {
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const geometry = pose.startOutlineGuideGeometry(
      START_DEF,
      { x: 0, y: 0, w: 100, h: 100 },
      rotation,
      1
    );
    assert.equal(geometry.rotationDeg, rotation);
    assert.deepEqual(geometry.center, { x: 50, y: 50 });
  }
});

test('rotated Start AABB matching is exact for all 45-degree orientations', () => {
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const size = rotatedSize(rotation);
    assert.equal(pose.sourceRectMatchesRotatedStart(START_DEF, { w: size.w, h: size.h }, rotation), true);
    assert.equal(pose.sourceRectMatchesRotatedStart(START_DEF, { w: size.w + 0.01, h: size.h }, rotation), false);
  }
});

test('solid physical Start body stroke is the one-shot discriminator', () => {
  const context = {
    canvas: startModeCanvas(true),
    getLineDash: () => []
  };
  const bodyRect = { x: -27, y: -18, w: 54, h: 36 };
  assert.equal(pose.sourceRectIsPhysicalStartBody(START_DEF, bodyRect), true);
  assert.equal(pose.isPhysicalStartBodyStroke(context, START_DEF, bodyRect), true);
  assert.equal(pose.isPhysicalStartBodyStroke({ ...context, getLineDash: () => [6, 4] }, START_DEF, bodyRect), false);
  assert.equal(pose.isPhysicalStartBodyStroke({ ...context, canvas: startModeCanvas(false) }, START_DEF, bodyRect), false);
  assert.equal(pose.sourceRectIsPhysicalStartBody(START_DEF, { ...bodyRect, w: 53.9 }), false);
});

test('dashed Start-sized rectangle is replaced only when a body stroke armed the next call', () => {
  const size = rotatedSize(45);
  const documentValue = { getElementById: () => ({ textContent: '45°' }) };
  const context = {
    canvas: startModeCanvas(true),
    getLineDash: () => [6, 4]
  };
  assert.equal(pose.shouldReplaceStartGuideStroke(context, documentValue, START_DEF, { x: 0, y: 0, ...size }, true), true);
  assert.equal(pose.shouldReplaceStartGuideStroke(context, documentValue, START_DEF, { x: 0, y: 0, ...size }, false), false);
  assert.equal(pose.shouldReplaceStartGuideStroke({ ...context, getLineDash: () => [] }, documentValue, START_DEF, { x: 0, y: 0, ...size }, true), false);
  assert.equal(pose.shouldReplaceStartGuideStroke(context, documentValue, START_DEF, { x: 0, y: 0, w: 500, h: 500 }, true), false);
});

test('installed hook replaces only the guide immediately following the physical Start body', () => {
  class FakeContext {
    constructor() {
      this.canvas = startModeCanvas(true);
      this.strokeStyle = '#249b74';
      this.lineWidth = 2;
      this.dash = [];
      this.calls = [];
    }
    getLineDash() { return this.dash; }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    translate(x, y) { this.calls.push(['translate', x, y]); }
    rotate(value) { this.calls.push(['rotate', value]); }
    strokeRect(x, y, w, h) { this.calls.push(['native', x, y, w, h]); }
  }
  const root = {
    CanvasRenderingContext2D: FakeContext,
    M4WD_PART_CATALOG: { PARTS: { start: START_DEF } },
    document: { getElementById: () => ({ textContent: '45°' }) }
  };
  assert.equal(pose.installStartPlacementOutlineGuide(root), true);
  const context = new FakeContext();
  const size = rotatedSize(45);

  context.strokeRect(-27, -18, 54, 36);
  context.dash = [6, 4];
  context.strokeRect(10, 20, size.w, size.h);

  assert.deepEqual(context.calls[0], ['native', -27, -18, 54, 36]);
  assert.deepEqual(context.calls[1], ['save']);
  assert.ok(Math.abs(context.calls[2][1] - (10 + size.w / 2)) < 1e-12);
  assert.ok(Math.abs(context.calls[2][2] - (20 + size.h / 2)) < 1e-12);
  assert.equal(context.calls[3][0], 'rotate');
  assert.ok(Math.abs(context.calls[3][1] - Math.PI / 4) < 1e-12);
  assert.deepEqual(context.calls[4], ['native', -28, -19, 56, 38]);
  assert.deepEqual(context.calls[5], ['restore']);
});

test('same-sized dashed site boundary before the Start body is never replaced', () => {
  class FakeContext {
    constructor() {
      this.canvas = startModeCanvas(true);
      this.lineWidth = 1.6;
      this.dash = [8, 5];
      this.calls = [];
    }
    getLineDash() { return this.dash; }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    translate(x, y) { this.calls.push(['translate', x, y]); }
    rotate(value) { this.calls.push(['rotate', value]); }
    strokeRect(x, y, w, h) { this.calls.push(['native', x, y, w, h]); }
  }
  const root = {
    CanvasRenderingContext2D: FakeContext,
    M4WD_PART_CATALOG: { PARTS: { start: START_DEF } },
    document: { getElementById: () => ({ textContent: '0°' }) }
  };
  pose.installStartPlacementOutlineGuide(root);
  const context = new FakeContext();
  context.strokeRect(100, 200, 54, 36);
  assert.deepEqual(context.calls, [['native', 100, 200, 54, 36]]);
});

test('an unrelated stroke after the body consumes the one-shot marker fail-safe', () => {
  class FakeContext {
    constructor() {
      this.canvas = startModeCanvas(true);
      this.lineWidth = 2;
      this.dash = [];
      this.calls = [];
    }
    getLineDash() { return this.dash; }
    save() { this.calls.push(['save']); }
    restore() { this.calls.push(['restore']); }
    translate(x, y) { this.calls.push(['translate', x, y]); }
    rotate(value) { this.calls.push(['rotate', value]); }
    strokeRect(x, y, w, h) { this.calls.push(['native', x, y, w, h]); }
  }
  const root = {
    CanvasRenderingContext2D: FakeContext,
    M4WD_PART_CATALOG: { PARTS: { start: START_DEF } },
    document: { getElementById: () => ({ textContent: '0°' }) }
  };
  pose.installStartPlacementOutlineGuide(root);
  const context = new FakeContext();
  context.strokeRect(-27, -18, 54, 36);
  context.dash = [8, 5];
  context.strokeRect(1, 2, 500, 500);
  context.dash = [6, 4];
  context.strokeRect(10, 20, 54, 36);
  assert.deepEqual(context.calls, [
    ['native', -27, -18, 54, 36],
    ['native', 1, 2, 500, 500],
    ['native', 10, 20, 54, 36]
  ]);
});