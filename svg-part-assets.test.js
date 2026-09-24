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

test('lane-change bridge stroke runs to both connection faces without internal end caps', () => {
  const svg = fs.readFileSync('assets/templates/lane-change.svg', 'utf8');
  const fullSpanBridge = /M0 30 H36 C66 30 96 6 126 6 H162/;
  const matches = svg.match(new RegExp(fullSpanBridge.source, 'g')) || [];
  assert.equal(matches.length, 3, 'edge, deck and highlight strokes must all span the full part');
  assert.doesNotMatch(svg, /M36 30 C66 30 96 6 126 6/);

  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /c\.moveTo\(-def\.w \/ 2, bridge\.start\.y\)/);
  assert.match(app, /c\.lineTo\(def\.w \/ 2, bridge\.end\.y\)/);
});

test('20-degree bank default palette matches the slope height gradient', () => {
  const bank = fs.readFileSync('assets/templates/bank20.svg', 'utf8');
  for (const color of ['#1b7a5c', '#35bd8b', '#46c89a', '#82ddb9', '#156c4f', '#1b8964']) {
    assert.equal(bank.includes(color), true, color);
  }

  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /'#35bd8b': color\.base/);
  assert.match(app, /'#156c4f': color\.edge/);
  assert.match(app, /'#1b8964': color\.lane/);
});
