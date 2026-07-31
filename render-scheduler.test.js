const test = require('node:test');
const assert = require('node:assert/strict');
const { createRenderScheduler } = require('./render-scheduler.js');

test('continuous render requests are coalesced into one animation frame', () => {
  const callbacks = [];
  const scheduler = createRenderScheduler(callback => callbacks.push(callback));
  let paints = 0;
  assert.equal(scheduler.request(() => { paints += 1; }), true);
  assert.equal(scheduler.request(() => { paints += 1; }), false);
  assert.equal(scheduler.request(() => { paints += 1; }), false);
  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  assert.equal(paints, 1);
  assert.equal(scheduler.isPending(), false);
});

test('a request made during paint schedules one complete follow-up frame', () => {
  const callbacks = [];
  const scheduler = createRenderScheduler(callback => callbacks.push(callback));
  let paints = 0;
  function draw() {
    paints += 1;
    if (paints === 1) scheduler.request(draw);
  }
  scheduler.request(draw);
  callbacks.shift()();
  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  assert.equal(paints, 2);
});
