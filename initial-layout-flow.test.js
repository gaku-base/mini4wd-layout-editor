'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const FLOW = require('./initial-layout-flow.js');

test('the initial-layout flow model loads before the application runtime', () => {
  const html = fs.readFileSync('./index.html', 'utf8');
  assert.ok(html.indexOf('src="initial-layout-flow.js"') < html.indexOf('src="app.js"'));
});

test('square or rectangle proceeds through unified venue setup and then Start', () => {
  assert.equal(FLOW.nextStep('layout-space'), 'venue-setup');
  assert.equal(FLOW.nextStep('venue-setup'), 'start');
});

test('venue-area rotation advances by five degrees and wraps from 0 through 355', () => {
  assert.equal(FLOW.ROTATION_STEP, 5);
  assert.equal(FLOW.rotateVenueArea(0, -5), 355);
  assert.equal(FLOW.rotateVenueArea(355, 5), 0);
  assert.equal(FLOW.rotateVenueArea(35, 5), 40);
});

test('automatic venue-area names fill the first available numbered slot', () => {
  assert.equal(FLOW.nextObstacleName([]), 'エリア1');
  assert.equal(FLOW.nextObstacleName([{ name: 'エリア1' }, { name: '柱' }, { name: 'エリア3' }]), 'エリア2');
});

test('mouse drag creates a clamped unavailable-area rectangle in course centimetres', () => {
  const field = { originX: 0, originY: 0, widthCm: 1000, heightCm: 600 };
  assert.deepEqual(
    FLOW.unavailableAreaFromDrag({ x: 100, y: 150 }, { x: 500, y: 350 }, field),
    { x: 300, y: 250, widthCm: 400, depthCm: 200 }
  );
  assert.deepEqual(
    FLOW.unavailableAreaFromDrag({ x: -100, y: 200 }, { x: 1200, y: 800 }, field),
    { x: 500, y: 400, widthCm: 1000, depthCm: 400 }
  );
});

test('mouse drag rejects unavailable areas below the existing one-centimetre minimum', () => {
  const field = { originX: 0, originY: 0, widthCm: 1000, heightCm: 600 };
  assert.equal(FLOW.MIN_UNAVAILABLE_AREA_CM, 1);
  assert.equal(FLOW.unavailableAreaFromDrag({ x: 10, y: 10 }, { x: 10.5, y: 40 }, field), null);
});

test('shrinking a layout counts an existing unavailable area from the validator valid flag', () => {
  const areas = [{ id: 'area-1', right: 600 }];
  let fieldWidth = 600;
  const validate = area => ({ valid: area.right <= fieldWidth, reason: area.right <= fieldWidth ? null : 'outside-space' });
  assert.equal(FLOW.countInvalidUnavailableAreas(areas, validate), 0);
  fieldWidth = 500;
  assert.equal(FLOW.countInvalidUnavailableAreas(areas, validate), 1);
});
