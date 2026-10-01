'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const GEOMETRY = require('./part-geometry3d.js');
const RENDERER = require('./output-3d-renderer.js');
const SLOPE_PROFILE = require('./slope-longitudinal-profile.js');

function loadCatalog() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('part-catalog.js', 'utf8'), context, { filename:'part-catalog.js' });
  return context.window.M4WD_PART_CATALOG;
}

const CATALOG = loadCatalog();
const OPTIONS = {
  geometryApi:GEOMETRY,
  catalog:CATALOG,
  dependencies:{ slopeProfile:SLOPE_PROFILE }
};

function modelWith(parts, start = null) {
  return {
    layout:{
      start,
      parts,
      connections:[],
      field:{ originX:0, originY:0, widthCm:800, heightCm:600, gridCm:10 }
    }
  };
}

test('3D scene consumes placed 2D x/y/rotation/z without changing the source layout', () => {
  const layout = modelWith([
    { id:'straight-a', type:'straight', x:100, y:200, rotation:90, zMm:230, colorKey:'blue', bankAngleDeg:0 }
  ]);
  const before = JSON.stringify(layout);
  const scene = RENDERER.buildScene(layout, OPTIONS);
  assert.equal(JSON.stringify(layout), before);
  assert.equal(scene.parts.length, 1);
  assert.equal(scene.invalidParts.length, 0);

  const local = GEOMETRY.buildPart3D('straight', layout.layout.parts[0], CATALOG, OPTIONS.dependencies);
  const worldPart = scene.parts[0];
  assert.equal(worldPart.bounds.minZ, 230);
  assert.equal(worldPart.bounds.maxZ, 280);
  assert.equal(local.fenceHeightMm, 50);
  assert.ok(worldPart.bounds.depthMm > worldPart.bounds.widthMm, '90-degree rotation swaps long/short world footprint');
});

test('scene combines Start, Straight, Slope and cumulative Bank20 without geometry failures', () => {
  const scene = RENDERER.buildScene(modelWith([
    { id:'straight-a', type:'straight', x:154, y:100, rotation:0, zMm:0, colorKey:'red', bankAngleDeg:0 },
    { id:'slope-a', type:'slope', x:208, y:100, rotation:0, zMm:0, colorKey:'green', bankAngleDeg:0 },
    { id:'bank-a', type:'bank20', x:246, y:160, rotation:0, zMm:115, colorKey:'blue', bankAngleDeg:60 }
  ], {
    id:'start', type:'start', x:100, y:100, rotation:0, zMm:0, colorKey:'default', bankAngleDeg:0
  }), OPTIONS);

  assert.equal(scene.parts.length, 4);
  assert.deepEqual(scene.invalidParts, []);
  assert.ok(scene.bounds.maxZ >= 115);
  assert.equal(scene.catalogVersion, CATALOG.PART_DIMENSIONS_MM.version);
});

test('3D scene reports provisional photo-derived fidelity for all three special vertical sections', () => {
  const scene = RENDERER.buildScene(modelWith([
    { id:'lc', type:'lanechange', x:100, y:100, rotation:0, zMm:0 },
    { id:'jump', type:'lcjump', x:300, y:100, rotation:0, zMm:0 },
    { id:'burning', type:'burning', x:500, y:250, rotation:0, zMm:0 }
  ]), OPTIONS);
  assert.equal(scene.invalidParts.length, 0);
  const warnings = scene.warnings.map(item => item.warning);
  assert.ok(warnings.includes('lanechange-vertical-profile-photo-derived-provisional'));
  assert.ok(warnings.includes('lcjump-vertical-profile-lanechange-approach-provisional'));
  assert.ok(warnings.includes('burning-vertical-profile-photo-derived-provisional'));
});

test('camera normalization clamps unsafe tilt and zoom values', () => {
  const camera = RENDERER.normalizeCamera({ yawDeg:120, tiltDeg:200, zoom:99 });
  assert.equal(camera.yawDeg, 120);
  assert.equal(camera.tiltDeg, 82);
  assert.equal(camera.zoom, 4);
  const low = RENDERER.normalizeCamera({ tiltDeg:-50, zoom:.01 });
  assert.equal(low.tiltDeg, 0);
  assert.equal(low.zoom, .35);
});

test('projected 3D scene stays finite at TOP and ISO views', () => {
  const scene = RENDERER.buildScene(modelWith([
    { id:'slope', type:'slope', x:100, y:100, rotation:45, zMm:0 },
    { id:'bank', type:'bank20', x:180, y:160, rotation:90, zMm:115, bankAngleDeg:40 }
  ]), OPTIONS);

  for (const camera of [RENDERER.TOP_CAMERA, RENDERER.ISO_CAMERA]) {
    const projection = RENDERER.projectedScene(scene, 1200, 800, camera);
    assert.ok(Number.isFinite(projection.scale) && projection.scale > 0);
    for (const part of scene.parts) {
      for (const face of part.faces.slice(0, 5)) {
        for (const point of face.points) {
          const projected = projection.project(point);
          assert.ok(Number.isFinite(projected.x));
          assert.ok(Number.isFinite(projected.y));
          assert.ok(Number.isFinite(projected.depth));
        }
      }
    }
  }
});
