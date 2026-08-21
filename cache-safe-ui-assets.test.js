const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const HEALTH_CACHE = 'v1.1-rc6-health1';

test('critical overlap fix stays static while all mutable UI entry assets share the current cache key', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const wheel = fs.readFileSync('wheel-rotation.js', 'utf8');
  const bootstrap = fs.readFileSync('editor-extensions-bootstrap.js', 'utf8');

  assert.match(
    index,
    /<style id="criticalUiOverlapFix">[\s\S]*#subEditModeBar:not\(\[hidden\]\) ~ \.instruction-card \{ display: none !important; \}[\s\S]*<\/style>/
  );
  assert.match(index, new RegExp(`styles\\.css\\?v=${HEALTH_CACHE}`));
  assert.match(index, new RegExp(`wheel-rotation\\.js\\?v=${HEALTH_CACHE}`));
  assert.doesNotMatch(index, /v1\.1-rc4-20260820-toolbar-trash1/);

  assert.match(wheel, new RegExp(`editor-extensions-bootstrap\\.js\\?v=${HEALTH_CACHE}`));
  assert.match(bootstrap, new RegExp(`const CACHE_KEY = '${HEALTH_CACHE}'`));
  assert.match(bootstrap, /simple-ui\.js\?v=\$\{CACHE_KEY\}/);
  assert.match(bootstrap, /presentation-mode\.css\?v=\$\{CACHE_KEY\}/);
  assert.doesNotMatch(wheel, /simple-ui\.js\?v=/);
  assert.doesNotMatch(wheel, /presentation-mode\.css\?v=/);
});
