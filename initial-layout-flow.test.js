'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const FLOW = require('./initial-layout-flow.js');

test('the initial-layout flow model loads before the application runtime', () => {
  const html = fs.readFileSync('./index.html', 'utf8');
  assert.ok(html.indexOf('src="initial-layout-flow.js"') < html.indexOf('src="app.js"'));
});

test('plain square or rectangle proceeds directly from dimensions to Start', () => {
  assert.equal(FLOW.nextStep('layout-space', {}), 'start');
  assert.equal(FLOW.nextStep('layout-space', { adjustRoomShape: false, configureObstacles: false }), 'start');
});

test('the four optional-setup combinations have one deterministic route', () => {
  assert.equal(FLOW.nextStep('layout-space', { configureObstacles: true }), 'interference');
  assert.equal(FLOW.nextStep('layout-space', { adjustRoomShape: true }), 'space-adjustment');
  assert.equal(FLOW.nextStep('layout-space', { adjustRoomShape: true, configureObstacles: true }), 'space-adjustment');
  assert.equal(FLOW.nextStep('space-adjustment', { adjustRoomShape: true }), 'confirm');
  assert.equal(FLOW.nextStep('space-adjustment', { adjustRoomShape: true, configureObstacles: true }), 'interference');
  assert.equal(FLOW.nextStep('interference', { configureObstacles: true }), 'confirm');
  assert.equal(FLOW.nextStep('confirm', { configureObstacles: true }), 'start');
});

test('automatic obstacle names fill the first available numbered slot', () => {
  assert.equal(FLOW.nextObstacleName([]), '干渉物1');
  assert.equal(FLOW.nextObstacleName([{ name: '干渉物1' }, { name: '柱' }, { name: '干渉物3' }]), '干渉物2');
});
