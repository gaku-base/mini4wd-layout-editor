const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('all course parts use registered SVG visuals', () => {
  const catalog = fs.readFileSync('part-catalog.js', 'utf8');
  const expected = [
    'assets/templates/straight.svg',
    'assets/templates/corner45-exact.svg',
    'assets/templates/lane-change.svg',
    'assets/templates/wave.svg',
    'assets/templates/start.svg',
    'assets/templates/slope.svg',
    'assets/templates/bank20.svg',
    'assets/templates/lc-jump.svg',
    'assets/templates/burning-lc.svg'
  ];
  for (const asset of expected) assert.equal(catalog.includes(asset), true, asset);
  assert.doesNotMatch(catalog, /assets\/parts\/[^'\"]+\.png/);
});

test('lane-change SVG does not draw false dead-end cap lines', () => {
  const svg = fs.readFileSync('assets/templates/lane-change.svg', 'utf8');
  assert.doesNotMatch(svg, /M36 24 V36/);
  assert.doesNotMatch(svg, /M126 0 V12/);
});

test('SVG renderer supports palette variants and mirrored canonical assets', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /function colorizedSvgText\(/);
  assert.match(app, /cornerVariant === 'left'/);
  assert.match(app, /bankRole === 'exit'/);
  assert.match(app, /Object\.values\(PARTS\)\.forEach\(def => queueAsset/);
});
