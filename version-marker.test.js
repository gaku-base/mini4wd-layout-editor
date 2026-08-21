'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const UI = require('./ui-controls-cleanup.js');

const VERSION_FILE = fs.readFileSync('./VERSION.txt', 'utf8').trim();
const WHEEL_SOURCE = fs.readFileSync('./wheel-rotation.js', 'utf8');
const BOOTSTRAP_SOURCE = fs.readFileSync('./editor-extensions-bootstrap.js', 'utf8');

test('formal version marker is v1.1 RC6', () => {
  assert.equal(VERSION_FILE, 'v1.1 RC6');
  assert.equal(UI.APP_VERSION, VERSION_FILE);
  assert.equal(UI.APP_VERSION_SLUG, 'v1.1-rc6');
});

test('runtime version label is updated to v1.1 RC6', () => {
  const version = { textContent: 'v1.1 RC5' };
  const documentRef = {
    title: 'Mini 4WD Course Layout',
    documentElement: { dataset: {} },
    querySelector(selector) {
      return selector === '.version' ? version : null;
    }
  };

  UI.applyVersionLabel(documentRef);

  assert.equal(version.textContent, 'v1.1 RC6');
  assert.equal(documentRef.documentElement.dataset.appVersion, 'v1.1-rc6');
  assert.equal(documentRef.title, 'Mini 4WD Course Layout — v1.1 RC6');
});

test('editor extensions use one RC6 code-health cache key', () => {
  assert.match(WHEEL_SOURCE, /editor-extensions-bootstrap\.js\?v=v1\.1-rc6-health1/);
  assert.match(BOOTSTRAP_SOURCE, /const CACHE_KEY = 'v1\.1-rc6-health1'/);
  assert.match(BOOTSTRAP_SOURCE, /ui-controls-cleanup\.js\?v=\$\{CACHE_KEY\}/);
  assert.match(BOOTSTRAP_SOURCE, /presentation-mode\.css\?v=\$\{CACHE_KEY\}/);
});
