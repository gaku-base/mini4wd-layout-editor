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
  assert.equal(FLOW.nextObstacleName([]), '設置不可エリア1');
  assert.equal(FLOW.nextObstacleName([{ name: '設置不可エリア1' }, { name: '柱' }, { name: '設置不可エリア3' }]), '設置不可エリア2');
});
