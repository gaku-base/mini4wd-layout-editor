'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EXPORT = require('./presentation-export.js');

test('A4 300dpi dimensions match standard portrait and landscape output', () => {
  assert.deepEqual(EXPORT.pageSize('landscape',300), { width:3508, height:2480, orientation:'landscape', dpi:300 });
  assert.deepEqual(EXPORT.pageSize('portrait',300), { width:2480, height:3508, orientation:'portrait', dpi:300 });
});

test('auto orientation follows the presentation field aspect while explicit choice wins', () => {
  assert.equal(EXPORT.resolveOrientation({field:{widthCm:900,heightCm:600}},'auto'),'landscape');
  assert.equal(EXPORT.resolveOrientation({field:{widthCm:600,heightCm:900}},'auto'),'portrait');
  assert.equal(EXPORT.resolveOrientation({field:{widthCm:900,heightCm:600}},'portrait'),'portrait');
});

test('print page rule is fixed to one A4 page with 10mm margins', () => {
  assert.equal(EXPORT.printPageRule('landscape'), '@page { size: A4 landscape; margin: 10mm; }');
  assert.equal(EXPORT.printPageRule('portrait'), '@page { size: A4 portrait; margin: 10mm; }');
});
