(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_WHEEL_ROTATION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A physical mouse wheel usually sends a large delta, while a trackpad
  // sends many small deltas. Consume at most one 45-degree turn per event
  // and per short scroll gesture.
  function createWheelRotationAccumulator(threshold = 40, cooldownMs = 100) {
    let accumulated = 0;
    let lastRotationAt = -Infinity;
    const limit = Math.max(1, Number(threshold) || 40);
    const cooldown = Math.max(0, Number(cooldownMs) || 0);
    function push(deltaY, now = Date.now()) {
      const delta = Number(deltaY);
      if (!Number.isFinite(delta) || delta === 0) return 0;
      if (now - lastRotationAt < cooldown) {
        accumulated = 0;
        return 0;
      }
      accumulated += delta;
      if (Math.abs(accumulated) < limit) return 0;
      const direction = accumulated < 0 ? -1 : 1;
      accumulated = 0;
      lastRotationAt = now;
      return direction;
    }
    return Object.freeze({ push, reset: () => { accumulated = 0; }, pending: () => accumulated });
  }

  return Object.freeze({ createWheelRotationAccumulator });
});
