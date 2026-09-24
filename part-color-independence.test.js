const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');

function sourceBlock(startPattern, endPattern) {
  const start = app.search(startPattern);
  assert.notEqual(start, -1, `missing source start: ${startPattern}`);
  const tail = app.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `missing source end: ${endPattern}`);
  return tail.slice(0, end);
}

test('placed part color changes are instance-local', () => {
  const block = sourceBlock(/function cyclePartColor\(/, /\n  function cyclePartsColor\(/);
  assert.match(block, /const part = findLayoutPartById\(id\)/);
  assert.match(block, /part\.colorKey = nextPartColorKey\(part\)/);
  assert.doesNotMatch(block, /PARTS\[part\.type\].*color/i);
});

test('multi-selection delegates to per-instance color mutation', () => {
  const block = sourceBlock(/function cyclePartsColor\(/, /\n  function rotateCurrent\(/);
  assert.match(block, /unique\.map\(cyclePartColor\)/);
});

test('serialization and restore preserve each placed part colorKey independently', () => {
  const serialize = sourceBlock(/function serializeState\(/, /\n  function migratedPartType\(/);
  assert.match(serialize, /parts: state\.parts\.map\(p => \(\{ \.\.\.p \}\)\)/);

  const restore = sourceBlock(/function applySerialized\(/, /\n  function persistLocal\(/);
  assert.match(restore, /colorKey: COLORS\.some\(c => c\.key === p\.colorKey\) \? p\.colorKey : 'default'/);
});

test('bank state recalculation never rewrites colorKey', () => {
  const block = sourceBlock(/function recalculateBankStates\(/, /\n  function recalculateLayoutWarnings\(/);
  assert.doesNotMatch(block, /colorKey\s*=/);
});
