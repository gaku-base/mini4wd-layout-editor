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

  function ensureSelectionIdentityMarker() {
    let marker = root.document.getElementById('simpleUiSelectionIdentity');
    if (marker) return marker;
    marker = root.document.createElement('span');
    marker.id = 'simpleUiSelectionIdentity';
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    marker.dataset.simpleUiSelectionIdentity = '1';
    marker.dataset.selectedIds = '[]';
    (root.document.body || root.document.documentElement).appendChild(marker);
    return marker;
  }

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
            const marker = ensureSelectionIdentityMarker();
            const identity = JSON.stringify(canonicalize(snapshot?.selectedIds));
            if (marker.dataset.selectedIds !== identity) marker.dataset.selectedIds = identity;
          } catch (_) {}
          return snapshot;
        }
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function exposeCoursePartTrashBridgeApi(root) {
  'use strict';
  if (!root || !root.document || /test-index\.html$/.test(String(root.location?.pathname || ''))) return;
  if (Object.prototype.hasOwnProperty.call(root, '__COURSE_ENABLE_DEBUG__')) return;
  root.__COURSE_ENABLE_DEBUG__ = true;
})(typeof globalThis !== 'undefined' ? globalThis : this);

(function loadSimpleEditorUi(root) {
  'use strict';
  if (!root || !root.document || root.__M4WD_SIMPLE_UI_LOADER_INSTALLED__) return;
  root.__M4WD_SIMPLE_UI_LOADER_INSTALLED__ = true;

  if (!root.document.getElementById('subEditHiddenGuard')) {
    const hiddenGuard = root.document.createElement('style');
    hiddenGuard.id = 'subEditHiddenGuard';
    hiddenGuard.textContent = '.sub-edit-mode-bar[hidden] { display: none !important; }';
    root.document.head.appendChild(hiddenGuard);
  }

  function integrateModeHelpIntoToolbar() {
    const toolbar = root.document.getElementById('canvasToolbar');
    const instruction = root.document.getElementById('instruction');
    if (!toolbar || !instruction || instruction.dataset.toolbarModeHelp === '1') return false;

    const groups = toolbar.querySelectorAll('.toolbar-group');
    const rightGroup = groups[groups.length - 1] || null;
    instruction.dataset.toolbarModeHelp = '1';
    instruction.classList.add('toolbar-mode-help');
    if (rightGroup) toolbar.insertBefore(instruction, rightGroup);
    else toolbar.appendChild(instruction);

    if (!root.document.getElementById('toolbarModeHelpStyles')) {
      const style = root.document.createElement('style');
      style.id = 'toolbarModeHelpStyles';
      style.textContent = `
        .canvas-toolbar .toolbar-mode-help {
          position: static !important;
          left: auto !important;
          top: auto !important;
          transform: none !important;
          flex: 1 1 300px;
          min-width: 180px;
          max-width: 560px;
          height: 32px;
          padding: 0 10px;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          border: 0 !important;
          border-left: 2px solid var(--primary) !important;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none !important;
          overflow: hidden;
          white-space: nowrap;
          pointer-events: none;
        }
        .canvas-toolbar .toolbar-mode-help strong {
          flex: 0 0 auto;
          font-size: 11px;
          line-height: 1.2;
          white-space: nowrap;
        }
        .canvas-toolbar .toolbar-mode-help span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--muted);
          font-size: 9px;
          line-height: 1.2;
        }
        .canvas-toolbar .toolbar-mode-help.has-warning {
          border-left-color: var(--danger) !important;
        }
        .canvas-toolbar .toolbar-mode-help.hidden,
        .canvas-toolbar .toolbar-mode-help.is-sub-edit-active {
          display: none !important;
        }
        @media (max-width: 1180px) {
          .canvas-toolbar .toolbar-mode-help {
            order: 3;
            flex: 1 0 100%;
            max-width: none;
            height: 28px;
            padding: 0 4px;
          }
        }
      `;
      root.document.head.appendChild(style);
    }

    const subEditBar = root.document.getElementById('subEditModeBar');
    const syncSubEditVisibility = () => {
      instruction.classList.toggle('is-sub-edit-active', Boolean(subEditBar && !subEditBar.hidden));
    };
    syncSubEditVisibility();
    if (subEditBar && root.MutationObserver) {
      new root.MutationObserver(syncSubEditVisibility).observe(subEditBar, {
        attributes: true,
        attributeFilter: ['hidden']
      });
    }
    return true;
  }

  const loadSimpleUi = () => {
    if (root.document.querySelector('script[data-m4wd-simple-ui="1"]')) return;

    const script = root.document.createElement('script');
    script.src = 'simple-ui.js?v=v1.1-rc4-20260820-toolbar-trash1';
    script.async = false;
    script.dataset.m4wdSimpleUi = '1';
    script.addEventListener('load', () => {
      root.__COURSE_ENABLE_DEBUG__ = false;
      integrateModeHelpIntoToolbar();
      if (root.document.getElementById('simpleUiNarrowLayoutOverride')) return;
      const style = root.document.createElement('style');
      style.id = 'simpleUiNarrowLayoutOverride';
      style.textContent = '@media (max-width: 720px) { body.simple-ui-enabled .workspace-shell { grid-template-columns: minmax(0, 1fr) !important; } }';
      root.document.head.appendChild(style);
    }, { once: true });
    script.addEventListener('error', () => {
      root.__COURSE_ENABLE_DEBUG__ = false;
      try { delete root.__mini4wdCourseDebug; } catch (_) {}
    }, { once: true });
    root.document.head.appendChild(script);
  };

  const loadPresentationMode = () => {
    const resources = [
      ['presentation-data.js?v=20260821-presentation1', 'm4wdPresentationData'],
      ['presentation-renderer.js?v=20260821-presentation1', 'm4wdPresentationRenderer'],
      ['presentation-export.js?v=20260821-presentation1', 'm4wdPresentationExport'],
      ['presentation-mode.js?v=20260821-presentation1', 'm4wdPresentationMode']
    ];
    const loadAt = index => {
      if (index >= resources.length) {
        loadSimpleUi();
        return;
      }
      const [src, key] = resources[index];
      if (root.document.querySelector(`script[data-${key}="1"]`)) {
        loadAt(index + 1);
        return;
      }
      const script = root.document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[key] = '1';
      let continued = false;
      const continueBoot = () => {
        if (continued) return;
        continued = true;
        loadAt(index + 1);
      };
      script.addEventListener('load', continueBoot, { once:true });
      script.addEventListener('error', continueBoot, { once:true });
      root.document.head.appendChild(script);
    };
    loadAt(0);
  };

  const loadMarqueePreview = () => {
    if (root.document.querySelector('script[data-m4wd-marquee-preview="1"]')) {
      loadPresentationMode();
      return;
    }
    const script = root.document.createElement('script');
    script.src = 'marquee-target-preview.js?v=v1.1-rc4-20260821-marquee-preview1';
    script.async = false;
    script.dataset.m4wdMarqueePreview = '1';
    let continued = false;
    const continueBoot = () => {
      if (continued) return;
      continued = true;
      loadPresentationMode();
    };
    script.addEventListener('load', continueBoot, { once: true });
    script.addEventListener('error', continueBoot, { once: true });
    root.document.head.appendChild(script);
  };

  const loadStartReplacementSnap = () => {
    if (root.document.querySelector('script[data-m4wd-start-replacement-snap="1"]')) {
      loadMarqueePreview();
      return;
    }
    const script = root.document.createElement('script');
    script.src = 'start-replacement-snap.js?v=v1.1-rc4-20260821-start-resnap1';
    script.async = false;
    script.dataset.m4wdStartReplacementSnap = '1';
    let continued = false;
    const continueBoot = () => {
      if (continued) return;
      continued = true;
      loadMarqueePreview();
    };
    script.addEventListener('load', continueBoot, { once: true });
    script.addEventListener('error', continueBoot, { once: true });
    root.document.head.appendChild(script);
  };

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', loadStartReplacementSnap, { once: true });
  } else {
    loadStartReplacementSnap();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
