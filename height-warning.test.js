'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./layout-graph.js');

const source = fs.readFileSync('./app.js', 'utf8');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const warningSource = section('function drawLayoutWarnings', 'function drawInterferenceOutline');
const outlineSource = section('function drawInterferenceOutline', 'function normalizeConnection');
const shapeSource = section('function tracePartShapePath', 'function drawPartSelectionEffect');
const catalog = {
  straight: { geometry: { connectors: [] } },
  corner45: { geometry: { connectors: [] } },
  slope: { geometry: { connectors: [] } }
};
const part = (id, type = 'straight', zMm = 0, rotation = 0) => ({ id, type, x: 0, y: 0, zMm, rotation, pitchDeg: 0, bankAngleDeg: 0 });
const bounds = () => ({ minX: -27, maxX: 27, minY: -18, maxY: 18 });

test('1. height interference warning does not draw an AABB rectangle', () => assert.doesNotMatch(warningSource, /strokeRect|partBounds|startBounds/));
test('2. height interference warning reuses the part outline path', () => assert.match(outlineSource, /tracePartShapePath\(c, part\.type\)/));
test('3. both parts in an interfering pair receive warning IDs', () => {
  const warnings = G.interferenceWarnings([part('left'), part('right')], catalog, bounds);
  assert.deepEqual(warnings[0].partIds, ['left', 'right']);
});
test('4. non-interference warnings do not request an outline', () => assert.match(warningSource, /filter\(warning => warning\.type === 'interference'\)/));
test('5. resolving the interference removes the warning', () => assert.equal(G.interferenceWarnings([part('low'), part('high', 'straight', 230)], catalog, bounds).length, 0));
test('6. rotated part outlines use the placed rotation', () => assert.match(outlineSource, /c\.translate\(part\.x, part\.y\);[\s\S]*c\.rotate\(part\.rotation/));
test('7. corner warning outline follows the curved corner path', () => assert.match(shapeSource, /def\.corner45[\s\S]*c\.arc\(/));
test('8. wave warning outline shares the normal wave outer path', () => {
  assert.match(source, /function drawWave[\s\S]*traceWaveOuterPath\(c, def\)/);
  assert.match(shapeSource, /def\.wave\) return traceWaveOuterPath\(c, def\)/);
});
test('9. slope and lower track at the same height both warn', () => {
  const warnings = G.interferenceWarnings([part('slope', 'slope'), part('lower')], catalog, bounds);
  assert.deepEqual(warnings[0].partIds, ['slope', 'lower']);
});
test('10. same XY at separated heights does not warn', () => assert.equal(G.interferenceWarnings([part('low'), part('high', 'corner45', 230)], catalog, bounds).length, 0));
test('11. interference outline is drawn after selected part rendering', () => assert.match(source, /drawPart\(c, part,[\s\S]*drawOutOfBoundsWarnings\(c\);[\s\S]*drawLayoutWarnings\(c\)/));
test('12. warning outline changes no fill or lane-boundary color', () => {
  assert.doesNotMatch(outlineSource, /fill\(|fillStyle|\.lane|drawPart\(/);
  assert.match(outlineSource, /strokeStyle = '#d52f4d'/);
});
test('13. warning outline does not change connector rendering', () => assert.doesNotMatch(outlineSource, /connector|endpoint|connection/));
test('14. warning outline is a solid red line rather than a flashing or dashed box', () => assert.doesNotMatch(outlineSource, /setLineDash|strokeRect/));
test('15. warning drawing stays out of PNG export rendering', () => assert.match(source, /if \(!options\.exportMode\) drawLayoutWarnings\(c\)/));
