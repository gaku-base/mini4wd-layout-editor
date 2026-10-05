'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const mode = fs.readFileSync('presentation-mode.js', 'utf8');
const bootstrap = fs.readFileSync('editor-extensions-bootstrap.js', 'utf8');
const css = fs.readFileSync('presentation-mode.css', 'utf8');

test('OUTPUT exposes explicit 2D and 3D view buttons', () => {
  assert.match(mode, /presentationView2d/);
  assert.match(mode, /presentationView3d/);
  assert.match(mode, /optionButton\('presentationView2d','2Dを表示','2d','output-view'\)/);
  assert.match(mode, /optionButton\('presentationView3d','3Dを表示','3d','output-view'\)/);
});

test('3D geometry and renderer load before presentation mode', () => {
  const geometryIndex = bootstrap.indexOf('part-geometry3d.js');
  const rendererIndex = bootstrap.indexOf('output-3d-renderer.js');
  const modeIndex = bootstrap.indexOf('presentation-mode.js');
  assert.ok(geometryIndex >= 0);
  assert.ok(rendererIndex > geometryIndex);
  assert.ok(modeIndex > rendererIndex);
});

test('OUTPUT 3D uses the same presentation model and current layout state', () => {
  assert.match(mode, /const model = buildModel\(\)/);
  assert.match(mode, /RENDERER_3D\.renderCourse3D\(courseCanvas, model/);
  assert.match(mode, /geometryApi:GEOMETRY_3D/);
  assert.match(mode, /catalog:CATALOG/);
  assert.match(mode, /slopeProfile: root\.M4WD_SLOPE_LONGITUDINAL_PROFILE/);
});

test('PNG and A4 both route through current 2D/3D output mode', () => {
  const exportStart = mode.indexOf('async function exportPng');
  const printStart = mode.indexOf('async function printA4', exportStart);
  const afterPrint = mode.indexOf('function exportEnhancedJson', printStart);
  const exportBlock = mode.slice(exportStart, printStart);
  const printBlock = mode.slice(printStart, afterPrint);
  assert.match(exportBlock, /composeOutput\(canvas, model/);
  assert.match(exportBlock, /viewMode:outputView/);
  assert.match(printBlock, /composeOutput\(canvas, model/);
  assert.match(printBlock, /viewMode:outputView/);
});

test('3D mode surfaces geometry audit failures instead of silently exporting broken geometry', () => {
  assert.match(mode, /course3dDiagnostics\?\.invalidParts\?\.length/);
  assert.match(mode, /3D形状チェックエラー/);
});

test('3D view supports drag orbit, wheel zoom, TOP and ISO', () => {
  assert.match(mode, /presentation3dTopBtn/);
  assert.match(mode, /presentation3dIsoBtn/);
  assert.match(mode, /on3dPointerDown/);
  assert.match(mode, /on3dPointerMove/);
  assert.match(mode, /on3dWheel/);
  assert.match(css, /\.presentation-canvas\.is-3d \{/);
  assert.match(css, /cursor: grab/);
});

test('presentation API version 3 exposes 2D/3D state and camera for regression tests', () => {
  assert.match(mode, /version:3/);
  assert.match(mode, /getOutputView:\(\) => outputView/);
  assert.match(mode, /setOutputView,/);
  assert.match(mode, /get3dCamera:\(\) => \(\{ \.\.\.camera3d \}\)/);
  assert.match(mode, /set3dCamera/);
});
