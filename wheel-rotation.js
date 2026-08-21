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

  function canonicalSelectionIds(value) {
    if (!Array.isArray(value)) return Object.freeze([]);
    const ids = [...new Set(value.map(id => String(id ?? '').trim()).filter(Boolean))].sort();
    return Object.freeze(ids);
  }

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

    return Object.freeze({
      push,
      reset: () => { accumulated = 0; lastTrackpadRotationAt = -Infinity; },
      pending: () => accumulated
    });
  }

  return Object.freeze({
    DOM_DELTA_PIXEL,
    PIXEL_NOTCH_MIN,
    classifyWheelInput,
    canonicalSelectionIds,
    createWheelRotationAccumulator
  });
});

// Temporary compatibility bridge: app.js still creates its narrow QA/runtime
// handle only when this flag is enabled. Extension boot is isolated in
// editor-extensions-bootstrap.js so wheel input logic no longer owns UI setup.
(function prepareEditorExtensionBridge(root) {
  'use strict';
  if (!root || !root.document) return;

  if (!/test-index\.html$/.test(String(root.location?.pathname || ''))
    && !Object.prototype.hasOwnProperty.call(root, '__COURSE_ENABLE_DEBUG__')) {
    root.__COURSE_ENABLE_DEBUG__ = true;
  }

  const loggerApi = root.M4WD_DIAGNOSTIC_LOGGER;
  const canonicalize = root.M4WD_WHEEL_ROTATION?.canonicalSelectionIds;
  if (loggerApi && typeof loggerApi.createDiagnosticLogger === 'function' && typeof canonicalize === 'function') {
    const originalCreateDiagnosticLogger = loggerApi.createDiagnosticLogger.bind(loggerApi);
    root.M4WD_DIAGNOSTIC_LOGGER = Object.freeze({
      ...loggerApi,
      createDiagnosticLogger(options = {}) {
        const originalGetState = typeof options.getState === 'function' ? options.getState : null;
        if (!originalGetState) return originalCreateDiagnosticLogger(options);
        return originalCreateDiagnosticLogger({
          ...options,
          getState(context = {}) {
            const snapshot = originalGetState(context);
            try {
              let marker = root.document.getElementById('simpleUiSelectionIdentity');
              if (!marker) {
                marker = root.document.createElement('span');
                marker.id = 'simpleUiSelectionIdentity';
                marker.hidden = true;
                marker.setAttribute('aria-hidden', 'true');
                marker.dataset.simpleUiSelectionIdentity = '1';
                marker.dataset.selectedIds = '[]';
                (root.document.body || root.document.documentElement).appendChild(marker);
              }
              const identity = JSON.stringify(canonicalize(snapshot?.selectedIds));
              if (marker.dataset.selectedIds !== identity) marker.dataset.selectedIds = identity;
            } catch (_) {}
            return snapshot;
          }
        });
      }
    });
  }

  if (root.document.querySelector('script[data-m4wd-editor-extensions-bootstrap="1"]')) return;
  const script = root.document.createElement('script');
  script.src = 'editor-extensions-bootstrap.js?v=v1.1-rc6-health1';
  script.async = false;
  script.dataset.m4wdEditorExtensionsBootstrap = '1';
  root.document.head.appendChild(script);
})(typeof globalThis !== 'undefined' ? globalThis : this);
