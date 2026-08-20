'use strict';

// Presentation mode implementation is built in phases under Issue #90.
// This first scaffold intentionally has no runtime side effects.
(function bootstrapPresentationMode(global) {
  const api = Object.freeze({ version: 1 });
  Object.defineProperty(global, 'M4WD_PRESENTATION', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: api
  });
})(window);
