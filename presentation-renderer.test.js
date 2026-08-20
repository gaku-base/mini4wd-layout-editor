'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RENDERER = require('./presentation-renderer.js');

const catalog = { PARTS: {
  start:{ w:54,h:36,geometry:{bounds:{minX:-27,maxX:27,minY:-18,maxY:18}} },
  straight:{ w:54,h:36,geometry:{bounds:{minX:-27,maxX:27,minY:-18,maxY:18}} }
}};

test('renderer exposes only the approved background modes and a fixed real-size 1m grid', () => {
  assert.deepEqual(RENDERER.BACKGROUNDS, ['grid','white','transparent']);
  assert.equal(RENDERER.GRID_CM, 100);
});

test('world bounds include the field and any course overflow so presentation never crops a part', () => {
  const layout = {
    field:{originX:0,originY:0,widthCm:500,heightCm:400},
    start:{x:250,y:200,rotation:0},
    parts:[{id:'p',type:'straight',x:510,y:200,rotation:0}]
  };
  const bounds = RENDERER.presentationWorldBounds(layout,catalog);
  assert.equal(bounds.minX,0);
  assert.ok(bounds.maxX >= 537);
  assert.equal(bounds.height,400);
});

test('viewport centers the complete world bounds and preserves aspect ratio', () => {
  const layout={field:{originX:0,originY:0,widthCm:500,heightCm:250},parts:[],start:null};
  const viewport=RENDERER.computeViewport(layout,catalog,1200,800,40);
  assert.ok(Math.abs(viewport.scale-2.24)<1e-9);
  assert.ok(viewport.offsetY>40);
  assert.equal(viewport.bounds.width,500);
});

test('45-degree rotated rectangle bounds expand symmetrically', () => {
  const bounds=RENDERER.transformedBounds({x:100,y:100,rotation:45},catalog.PARTS.straight);
  assert.ok(bounds.minX<73 && bounds.maxX>127);
  assert.ok(Math.abs((bounds.minX+bounds.maxX)/2-100)<1e-9);
});

test('presentation palettes contain every editor color key used by the current app', () => {
  assert.deepEqual(Object.keys(RENDERER.PALETTES), ['default','red','blue','orange','green','white']);
});
