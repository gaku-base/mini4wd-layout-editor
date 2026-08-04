const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function functionBody(name, nextName) {
  const start = appSource.indexOf(`function ${name}`);
  const end = appSource.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return appSource.slice(start, end);
}

test('PNG export includes ordinary obstacles but not transient placement state', () => {
  const exportBody = functionBody('drawExport', 'drawFrame');

  assert.match(exportBody, /drawObstacles\(c, \{ exportMode: true \}\)/);
  assert.doesNotMatch(exportBody, /drawObstaclePlacementGhost/);
});

test('interactive canvas renders both placed obstacles and the placement ghost', () => {
  const frameBody = functionBody('drawFrame', 'drawRoomShape');

  assert.match(frameBody, /drawObstacles\(ctx\)/);
  assert.match(frameBody, /drawObstaclePlacementGhost\(ctx\)/);
});
