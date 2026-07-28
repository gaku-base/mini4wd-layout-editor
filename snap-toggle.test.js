'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SNAP_TOGGLE = require('./snap-toggle.js');
const fresh = () => SNAP_TOGGLE.initialState();

test('1. initial state is ON', () => assert.equal(fresh().enabled, true));
test('2. click transition turns snapping OFF', () => assert.equal(SNAP_TOGGLE.toggle(fresh()).enabled, false));
test('3. second click turns snapping ON', () => assert.equal(SNAP_TOGGLE.toggle(SNAP_TOGGLE.toggle(fresh())).enabled, true));
test('4. OFF state remains inactive with a candidate', () => assert.equal(SNAP_TOGGLE.view(SNAP_TOGGLE.toggle(fresh())).active, false));
test('5. ON state becomes active again', () => assert.equal(SNAP_TOGGLE.view(SNAP_TOGGLE.toggle(SNAP_TOGGLE.toggle(fresh()))).active, true));
test('6. Alt temporarily disables snapping', () => assert.equal(SNAP_TOGGLE.view(SNAP_TOGGLE.setAltDisabled(fresh(), true)).active, false));
test('7. releasing Alt restores the toggle state', () => {
  const state = SNAP_TOGGLE.setAltDisabled(SNAP_TOGGLE.setAltDisabled(fresh(), true), false);
  assert.equal(state.enabled, true);
  assert.equal(SNAP_TOGGLE.view(state).active, true);
});
test('8. redraw view stays consistent with state', () => {
  const state = SNAP_TOGGLE.toggle(fresh());
  assert.deepEqual(SNAP_TOGGLE.view(state), { label: '吸着 OFF', ariaPressed: 'false', active: false });
});
test('9. restored layout starts with standard ON state', () => assert.equal(SNAP_TOGGLE.initialState().enabled, true));
test('10. one click/tap maps to one toggle transition', () => {
  const once = SNAP_TOGGLE.toggle(fresh());
  assert.equal(once.enabled, false);
  assert.equal(SNAP_TOGGLE.toggle(once).enabled, true);
});
