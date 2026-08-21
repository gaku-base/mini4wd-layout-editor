'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const REMOVED_PRE_RELEASE_ARTIFACTS = [
  'RC1_KNOWN_LIMITATIONS.txt',
  'SHAPE_QA_REPORT.txt',
  'BUG_REPORT_TEMPLATE.txt',
  'TASKS.md',
  'alignment_test.png',
  'corner45_8piece_closure_test.png',
  'preview.png',
  'sample-layout.json',
  'test-index.html',
  'qa/field-boundary-browser-qa.js',
  'qa/field-boundary-result.json'
];

test('obsolete pre-release artifacts stay out of the runtime repository root', () => {
  for (const path of REMOVED_PRE_RELEASE_ARTIFACTS) {
    assert.equal(fs.existsSync(path), false, `${path} should remain removed`);
  }
});

test('repository landing documentation describes the current RC6 architecture', () => {
  const readme = fs.readFileSync('README.txt', 'utf8');
  assert.match(readme, /^Mini 4WD Course Layout — v1\.1 RC6/m);
  assert.match(readme, /editor-extensions-bootstrap\.js/);
  assert.match(readme, /private runtime bridge/);
  assert.doesNotMatch(readme, /v1\.0\.0-RC1/);
});

test('static HTML shell no longer advertises RC4 or its cache key', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  assert.match(index, /<span class="version">v1\.1 RC6<\/span>/);
  assert.match(index, /styles\.css\?v=v1\.1-rc6-health1/);
  assert.match(index, /wheel-rotation\.js\?v=v1\.1-rc6-health1/);
  assert.doesNotMatch(index, /v1\.1 RC4/);
  assert.doesNotMatch(index, /v1\.1-rc4-20260820-toolbar-trash1/);
});

test('maintained human QA checklist starts from RC6 and covers presentation output', () => {
  const checklist = fs.readFileSync('HUMAN_QA_CHECKLIST.csv', 'utf8');
  assert.match(checklist, /QA-001,起動,[^\n]*v1\.1 RC6/);
  assert.match(checklist, /QA-030,発表,背景Grid/);
  assert.match(checklist, /QA-033,発表,PNG保存/);
  assert.match(checklist, /QA-035,印刷,A4横/);
  assert.doesNotMatch(checklist, /v1\.0 RC1/);
});
