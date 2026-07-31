(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_WHEEL_ROTATION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DOM_DELTA_PIXEL = 0;
  const PIXEL_NOTCH_MIN = 20;

  function classifyWheelInput(input, pixelNotchMin = PIXEL_NOTCH_MIN) {
    const deltaMode = Number(input?.deltaMode) || DOM_DELTA_PIXEL;
    const deltaY = Number(input?.deltaY);
    if (!Number.isFinite(deltaY) || deltaY === 0) return 'none';
    if (deltaMode !== DOM_DELTA_PIXEL) return 'notched-wheel';
    return Math.abs(deltaY) >= pixelNotchMin ? 'notched-wheel' : 'continuous-trackpad';
  }

  // Line/page events and sufficiently large pixel events are physical wheel
  // notches: each must rotate immediately, even when they arrive rapidly.
  // Only fine-grained pixel input uses accumulation and inertia suppression.
  function createWheelRotationAccumulator(threshold = 30, cooldownMs = 100, pixelNotchMin = PIXEL_NOTCH_MIN) {
    let accumulated = 0;
    let lastTrackpadRotationAt = -Infinity;
    const limit = Math.max(1, Number(threshold) || 40);
    const cooldown = Math.max(0, Number(cooldownMs) || 0);
    const notchMinimum = Math.max(1, Number(pixelNotchMin) || PIXEL_NOTCH_MIN);

    function push(input, now = Date.now()) {
      const event = typeof input === 'number' ? { deltaY: input, deltaMode: DOM_DELTA_PIXEL } : input;
      const delta = Number(event?.deltaY);
      if (!Number.isFinite(delta) || delta === 0) return 0;
      const inputType = classifyWheelInput(event, notchMinimum);
      if (inputType === 'notched-wheel') {
        accumulated = 0;
        return delta < 0 ? -1 : 1;
      }
      if (now - lastTrackpadRotationAt < cooldown) {
        accumulated = 0;
        return 0;
      }
      accumulated += delta;
      if (Math.abs(accumulated) < limit) return 0;
      const direction = accumulated < 0 ? -1 : 1;
      accumulated -= direction * limit;
      lastTrackpadRotationAt = now;
      return direction;
    }
    return Object.freeze({ push, reset: () => { accumulated = 0; lastTrackpadRotationAt = -Infinity; }, pending: () => accumulated });
  }

  return Object.freeze({ DOM_DELTA_PIXEL, PIXEL_NOTCH_MIN, classifyWheelInput, createWheelRotationAccumulator });
});
