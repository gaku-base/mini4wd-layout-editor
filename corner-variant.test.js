'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const VARIANT = require('./corner-variant.js');

test('left and right are separate concrete corner part types', () => {
  assert.equal(VARIANT.typeForVariant('left'), 'corner-45-left');
  assert.equal(VARIANT.typeForVariant('right'), 'corner-45-right');
  assert.equal(VARIANT.variantForType('corner-45-left'), 'left');
  assert.equal(VARIANT.variantForType('corner-45-right'), 'right');
});

test('legacy corner JSON migrates from its semantic handedness only', () => {
  assert.equal(VARIANT.migrateLegacyType({ type: 'corner45', handedness: 'left', cornerMirror: false, entryConnectorId: 'a', rotation: 0 }), 'corner-45-left');
  assert.equal(VARIANT.migrateLegacyType({ type: 'corner-45', handedness: 'right', cornerMirror: true, entryConnectorId: 'b', rotation: 180 }), 'corner-45-right');
  assert.equal(VARIANT.migrateLegacyType({ type: 'curve', cornerMirror: true, entryConnectorId: 'b', rotation: 180 }), 'corner-45-right');
});
