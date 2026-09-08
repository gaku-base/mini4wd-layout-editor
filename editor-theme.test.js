'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const theme = fs.readFileSync(require.resolve('./editor-theme.css'), 'utf8');
const bootstrap = fs.readFileSync(require.resolve('./editor-extensions-bootstrap.js'), 'utf8');

test('editor loads the shared orange-black theme after simple-ui installs', () => {
  assert.match(bootstrap, /loadScript\(`simple-ui\.js\?v=\$\{CACHE_KEY\}`/);
  assert.match(bootstrap, /function finishSimpleUiBoot\(\)[\s\S]*ensureStyleLink\('editorThemeStyles', `editor-theme\.css\?v=\$\{CACHE_KEY\}`\)/);
});

test('editor theme uses black surfaces with orange as the primary and focus accent', () => {
  assert.match(theme, /--bg:\s*#07090c/);
  assert.match(theme, /--panel:\s*#0f1217/);
  assert.match(theme, /--primary:\s*#ff9f1a/);
  assert.match(theme, /--accent:\s*#ff9f1a/);
  assert.match(theme, /\.topbar[\s\S]*background:\s*linear-gradient\(180deg, #0b0e12, #07090c\)/);
});

test('active editor controls use orange surfaces with dark readable text', () => {
  assert.match(theme, /\.mode-button\.active:not\(\.danger\)[\s\S]*background:\s*linear-gradient\(180deg, #ffad35, #ed8500\)[\s\S]*color:\s*#090b0d/);
  assert.match(theme, /\.toolbar-button\.active,[\s\S]*#manualFitBtn\.active[\s\S]*background:\s*linear-gradient\(180deg, #ffad35, #ed8500\)[\s\S]*color:\s*#090b0d/);
  assert.match(theme, /body\.simple-ui-enabled #detailsToggleBtn\[aria-expanded="true"\][\s\S]*background:\s*linear-gradient\(180deg, #ffad35, #ed8500\) !important[\s\S]*color:\s*#090b0d !important/);
});

test('danger actions retain a separate red semantic state', () => {
  assert.match(theme, /--danger:\s*#ff5f6d/);
  assert.match(theme, /\.mode-button\.danger\.active[\s\S]*border-color:\s*var\(--danger\)[\s\S]*background:\s*#3b171d/);
  assert.match(theme, /\.drag-trash\.is-delete-target[\s\S]*border-color:\s*var\(--danger\) !important/);
});

test('editor theme changes chrome only and does not recolor the course canvas element', () => {
  assert.doesNotMatch(theme, /#courseCanvas\s*\{[^}]*background/i);
  assert.doesNotMatch(theme, /#courseCanvas\s*\{[^}]*color/i);
});
