const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const appSource = fs.readFileSync(require.resolve('./app.js'), 'utf8');

function sourceBlock(startPattern, endPattern) {
  const start = appSource.search(startPattern);
  assert.notEqual(start, -1, `missing source start: ${startPattern}`);
  const tail = appSource.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `missing source end: ${endPattern}`);
  return tail.slice(0, end);
}

test('Start default rendering is pinned to the vector path', () => {
  const vectorKinds = sourceBlock(
    /const VECTOR_DEFAULT_RENDER_KINDS = new Set\(\[/,
    /\]\);/
  );
  assert.match(vectorKinds, /['"]start['"]/);

  const drawPartAsset = sourceBlock(
    /function drawPartAsset\(/,
    /\n  function / 
  );
  assert.match(
    drawPartAsset,
    /if \(VECTOR_DEFAULT_RENDER_KINDS\.has\(def\?\.renderKind\)\) return false;/
  );
});

test('drawStartLane requests the default renderer before drawing the physical Start body', () => {
  const drawStartLane = sourceBlock(
    /function drawStartLane\(/,
    /\n  function startBounds\(/
  );
  assert.match(drawStartLane, /drawPartAsset\(c, START_DEF, ['"]default['"]\)/);
  assert.match(
    drawStartLane,
    /strokeRect\(-START_DEF\.w \/ 2, -START_DEF\.h \/ 2, START_DEF\.w, START_DEF\.h\)/
  );
});
