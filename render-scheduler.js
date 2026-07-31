(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_RENDER_SCHEDULER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Coalesce state changes such as pointermove into one complete canvas paint.
  // Drawing itself remains synchronous so clearRect and the replacement frame
  // can never be split across animation frames.
  function createRenderScheduler(requestFrame) {
    if (typeof requestFrame !== 'function') throw new TypeError('requestFrame must be a function');
    let pending = false;
    let rendering = false;
    let requestedWhileRendering = false;

    function request(draw) {
      if (typeof draw !== 'function') throw new TypeError('draw must be a function');
      if (rendering) {
        requestedWhileRendering = true;
        return false;
      }
      if (pending) return false;
      pending = true;
      requestFrame(() => {
        pending = false;
        rendering = true;
        try {
          draw();
        } finally {
          rendering = false;
          if (requestedWhileRendering) {
            requestedWhileRendering = false;
            request(draw);
          }
        }
      });
      return true;
    }

    return Object.freeze({ request, isPending: () => pending });
  }

  return Object.freeze({ createRenderScheduler });
});
