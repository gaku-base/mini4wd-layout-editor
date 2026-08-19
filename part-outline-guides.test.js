const test = require('node:test');
const assert = require('node:assert/strict');
const pose = require('./part-render-pose.js');

const START_WIDTH_CM = 54;
const START_HEIGHT_CM = 36;

test('Start outline guide keeps the source AABB center but uses the verified Start dimensions', () => {
  const geometry = pose.startOutlineGuideGeometry(
    { w: START_WIDTH_CM, h: START_HEIGHT_CM },
    { x: 10, y: 20, w: 63.64, h: 63.64 },
    45,
    2
  );
  assert.deepEqual(geometry.center, { x: 41.82, y: 51.82 });
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

test('only the dashed green/red Start placement rectangle is replaced', () => {
  const documentValue = { getElementById: () => ({ textContent: '45°' }) };
  const makeContext = ({ mode = true, dash = [6, 4], strokeStyle = '#249b74' } = {}) => ({
    canvas: { id: 'courseCanvas', classList: { contains: () => mode } },
    getLineDash: () => dash,
    strokeStyle
  });
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext(), documentValue), true);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ strokeStyle: '#de3445' }), documentValue), true);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ dash: [] }), documentValue), false);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ strokeStyle: '#6e716d' }), documentValue), false);
  assert.equal(pose.shouldReplaceStartGuideStroke(makeContext({ mode: false }), documentValue), false);
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
  context.strokeRect(10, 20, 64, 64);
  assert.deepEqual(context.calls[0], ['save']);
  assert.deepEqual(context.calls[1], ['translate', 42, 52]);
  assert.equal(context.calls[2][0], 'rotate');
  assert.ok(Math.abs(context.calls[2][1] - Math.PI / 4) < 1e-12);
  assert.deepEqual(context.calls[3], ['native', -29, -20, 58, 40]);
  assert.deepEqual(context.calls[4], ['restore']);
});

test('hook leaves unrelated strokeRect calls unchanged', () => {
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
  context.strokeRect(1, 2, 3, 4);
  assert.deepEqual(context.calls, [['native', 1, 2, 3, 4]]);
});