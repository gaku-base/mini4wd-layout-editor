'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const UI = require('./ui-controls-cleanup.js');

const VERSION_FILE = fs.readFileSync('./VERSION.txt', 'utf8').trim();
const SNAP_SOURCE = fs.readFileSync('./snap-toggle.js', 'utf8');

test('formal version marker is v1.1 RC5', () => {
  assert.equal(VERSION_FILE, 'v1.1 RC5');
  assert.equal(UI.APP_VERSION, VERSION_FILE);
  assert.equal(UI.APP_VERSION_SLUG, 'v1.1-rc5');
});

test('runtime version label is updated to v1.1 RC5', () => {
  const version = { textContent: 'v1.1 RC4' };
  const documentRef = {
    title: 'Mini 4WD Course Layout',
    documentElement: { dataset: {} },
    querySelector(selector) {
      return selector === '.version' ? version : null;
    }
  };

  UI.applyVersionLabel(documentRef);

  assert.equal(version.textContent, 'v1.1 RC5');
  assert.equal(documentRef.documentElement.dataset.appVersion, 'v1.1-rc5');
  assert.equal(documentRef.title, 'Mini 4WD Course Layout — v1.1 RC5');
});

test('UI cleanup loader uses the RC5 cache key', () => {
  assert.match(SNAP_SOURCE, /ui-controls-cleanup\.js\?v=v1\.1-rc5-20260821-ui2/);
});
