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

test('course owns at least three quarters of the usable landscape page height', () => {
  const page = EXPORT.pageSize('landscape', 120);
  const rects = EXPORT.layoutRects(page, 'landscape');
  assert.ok(rects.course.h / rects.usableH >= 0.77);
  assert.ok(rects.title.h <= Math.ceil(rects.usableH * 0.08));
  assert.ok(rects.counts.h <= Math.ceil(rects.usableH * 0.09));
});

test('course-first fit ignores unused setup-field whitespace but includes every placed part', () => {
  const renderer = {
    transformedBounds(part) {
      return { minX:part.x-10, minY:part.y-5, maxX:part.x+10, maxY:part.y+5 };
    }
  };
  const model = {
    layout:{
      field:{originX:0,originY:0,widthCm:900,heightCm:600},
      start:{x:100,y:100},
      parts:[{type:'straight',x:300,y:180},{type:'straight',x:640,y:220}]
    }
  };
  const catalog = {PARTS:{start:{},straight:{}}};
  const bounds = EXPORT.placedCourseBounds(model,renderer,catalog);
  assert.deepEqual(bounds,{minX:90,minY:95,maxX:650,maxY:225,width:560,height:130});
  const fitted = EXPORT.courseFirstModel(model,renderer,catalog);
  assert.equal(fitted.layout.field.originX,90);
  assert.equal(fitted.layout.field.originY,95);
  assert.equal(fitted.layout.field.widthCm,560);
  assert.equal(fitted.layout.field.heightCm,130);
  assert.equal(model.layout.field.widthCm,900, 'source model stays read-only');
});

test('presentation typography uses an offline-safe condensed racing font stack', () => {
  assert.match(EXPORT.RACING_FONT,/Bahnschrift SemiCondensed/);
  assert.match(EXPORT.RACING_FONT,/Arial Narrow/);
  assert.doesNotMatch(EXPORT.RACING_FONT,/https?:/);
});
