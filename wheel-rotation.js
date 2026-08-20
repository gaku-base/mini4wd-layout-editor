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

  return Object.freeze({
    DOM_DELTA_PIXEL,
    PIXEL_NOTCH_MIN,
    classifyWheelInput,
    canonicalSelectionIds,
    createWheelRotationAccumulator
  });
});

(function installSimpleUiSelectionIdentityBridge(root) {
  'use strict';
  if (!root || !root.document || root.__M4WD_SIMPLE_UI_SELECTION_BRIDGE_INSTALLED__) return;
  root.__M4WD_SIMPLE_UI_SELECTION_BRIDGE_INSTALLED__ = true;

  const loggerApi = root.M4WD_DIAGNOSTIC_LOGGER;
  const canonicalize = root.M4WD_WHEEL_ROTATION?.canonicalSelectionIds;
  if (!loggerApi || typeof loggerApi.createDiagnosticLogger !== 'function' || typeof canonicalize !== 'function') return;

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
            const selectionInfo = root.document.getElementById('selectionInfo');
            if (selectionInfo) {
              const canonicalIds = canonicalize(snapshot?.selectedIds);
              const identity = JSON.stringify(canonicalIds);
              let marker = selectionInfo.querySelector('[data-simple-ui-selection-identity]');
              if (!marker) {
                marker = root.document.createElement('span');
                marker.hidden = true;
                marker.setAttribute('aria-hidden', 'true');
                marker.dataset.simpleUiSelectionIdentity = '1';
                selectionInfo.appendChild(marker);
              }
              if (marker.dataset.selectedIds !== identity) marker.dataset.selectedIds = identity;
              const markerText = ` selection-ids:${identity}`;
              if (marker.textContent !== markerText) marker.textContent = markerText;
            }
          } catch (_) {}
          return snapshot;
        }
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function loadSimpleEditorUi(root) {
  'use strict';
  if (!root || !root.document || root.__M4WD_SIMPLE_UI_LOADER_INSTALLED__) return;
  root.__M4WD_SIMPLE_UI_LOADER_INSTALLED__ = true;
  const script = root.document.createElement('script');
  script.src = 'simple-ui.js';
  script.async = false;
  script.dataset.m4wdSimpleUi = '1';
  script.addEventListener('load', () => {
    if (root.document.getElementById('simpleUiNarrowLayoutOverride')) return;
    const style = root.document.createElement('style');
    style.id = 'simpleUiNarrowLayoutOverride';
    style.textContent = '@media (max-width: 720px) { body.simple-ui-enabled .workspace-shell { grid-template-columns: minmax(0, 1fr) !important; } }';
    root.document.head.appendChild(style);
  }, { once: true });
  root.document.head.appendChild(script);
})(typeof globalThis !== 'undefined' ? globalThis : this);
