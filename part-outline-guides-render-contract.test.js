const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const appSource = fs.readFileSync(require.resolve('./app.js'), 'utf8');
const catalogSource = fs.readFileSync(require.resolve('./part-catalog.js'), 'utf8');

function sourceBlock(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `missing source start: ${startPattern}`);
  const tail = source.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `missing source end: ${endPattern}`);
  return tail.slice(0, end);
}

test('Start default rendering uses the registered SVG before Canvas fallback', () => {
  assert.match(
    catalogSource,
    /visual:\s*\{\s*file:\s*['"]assets\/templates\/start\.svg['"]/
  );

  const drawPartAsset = sourceBlock(
    appSource,
    /function drawPartAsset\(/,
    /\n  function partDisplayName/
  );
  assert.match(drawPartAsset, /assetRecordFor\(def, colorKey\)/);
  assert.match(drawPartAsset, /c\.drawImage\(record\.image/);
});

test('drawStartLane requests the SVG renderer before drawing the physical Start fallback body', () => {
  const drawStartLane = sourceBlock(
    appSource,
    /function drawStartLane\(/,
    /\n  function startBounds\(/
  );
  assert.match(drawStartLane, /drawPartAsset\(c, START_DEF, ['"]default['"]\)/);
  assert.match(
    drawStartLane,
    /strokeRect\(-START_DEF\.w \/ 2, -START_DEF\.h \/ 2, START_DEF\.w, START_DEF\.h\)/
  );
});
