const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const VERSION = 'v1.1-rc4-20260820-toolbar-trash1';

test('sub-edit overlap suppression is static and critical UI assets are cache-busted', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const wheel = fs.readFileSync('wheel-rotation.js', 'utf8');

  assert.match(
    index,
    /<style id="criticalUiOverlapFix">[\s\S]*#subEditModeBar:not\(\[hidden\]\) ~ \.instruction-card \{ display: none !important; \}[\s\S]*<\/style>/
  );
  assert.match(index, new RegExp(`styles\\.css\\?v=${VERSION}`));
  assert.match(index, new RegExp(`wheel-rotation\\.js\\?v=${VERSION}`));
  assert.match(wheel, new RegExp(`simple-ui\\.js\\?v=${VERSION}`));
  assert.doesNotMatch(
    wheel,
    /body\.simple-ui-enabled #subEditModeBar:not\(\[hidden\]\) ~ \.instruction-card/
  );
});
