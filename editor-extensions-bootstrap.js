(function bootstrapEditorExtensions(root) {
  'use strict';
  if (!root || !root.document || root.__M4WD_EDITOR_EXTENSIONS_BOOTSTRAP_INSTALLED__) return;
  root.__M4WD_EDITOR_EXTENSIONS_BOOTSTRAP_INSTALLED__ = true;

  const documentRef = root.document;
  const CACHE_KEY = 'v1.1-rc6-health1';

  function ensureStyleLink(id, href) {
    if (documentRef.getElementById(id)) return;
    const link = documentRef.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    (documentRef.head || documentRef.documentElement).appendChild(link);
  }

  function ensureHiddenSubEditGuard() {
    if (documentRef.getElementById('subEditHiddenGuard')) return;
    const hiddenGuard = documentRef.createElement('style');
    hiddenGuard.id = 'subEditHiddenGuard';
    hiddenGuard.textContent = '.sub-edit-mode-bar[hidden] { display: none !important; }';
    documentRef.head.appendChild(hiddenGuard);
  }

  function integrateModeHelpIntoToolbar() {
    const toolbar = documentRef.getElementById('canvasToolbar');
    const instruction = documentRef.getElementById('instruction');
    if (!toolbar || !instruction || instruction.dataset.toolbarModeHelp === '1') return false;

    const groups = toolbar.querySelectorAll('.toolbar-group');
    const rightGroup = groups[groups.length - 1] || null;
    instruction.dataset.toolbarModeHelp = '1';
    instruction.classList.add('toolbar-mode-help');
    if (rightGroup) toolbar.insertBefore(instruction, rightGroup);
    else toolbar.appendChild(instruction);

    if (!documentRef.getElementById('toolbarModeHelpStyles')) {
      const style = documentRef.createElement('style');
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
      documentRef.head.appendChild(style);
    }

    const subEditBar = documentRef.getElementById('subEditModeBar');
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

  function loadScript(src, marker, next) {
    if (documentRef.querySelector(`script[data-${marker}="1"]`)) {
      next();
      return;
    }
    const script = documentRef.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset[marker] = '1';
    let continued = false;
    const continueBoot = () => {
      if (continued) return;
      continued = true;
      next();
    };
    script.addEventListener('load', continueBoot, { once: true });
    script.addEventListener('error', continueBoot, { once: true });
    documentRef.head.appendChild(script);
  }

  function finishSimpleUiBoot() {
    root.__COURSE_ENABLE_DEBUG__ = false;
    integrateModeHelpIntoToolbar();
    if (!documentRef.getElementById('simpleUiNarrowLayoutOverride')) {
      const style = documentRef.createElement('style');
      style.id = 'simpleUiNarrowLayoutOverride';
      style.textContent = '@media (max-width: 720px) { body.simple-ui-enabled .workspace-shell { grid-template-columns: minmax(0, 1fr) !important; } }';
      documentRef.head.appendChild(style);
    }
    loadScript(`ui-controls-cleanup.js?v=${CACHE_KEY}`, 'm4wdUiControlsCleanup', () => {});
  }

  function loadSimpleUi() {
    if (documentRef.querySelector('script[data-m4wd-simple-ui="1"]')) {
      finishSimpleUiBoot();
      return;
    }
    const script = documentRef.createElement('script');
    script.src = `simple-ui.js?v=${CACHE_KEY}`;
    script.async = false;
    script.dataset.m4wdSimpleUi = '1';
    script.addEventListener('load', finishSimpleUiBoot, { once: true });
    script.addEventListener('error', () => {
      root.__COURSE_ENABLE_DEBUG__ = false;
      try { delete root.__mini4wdCourseDebug; } catch (_) {}
    }, { once: true });
    documentRef.head.appendChild(script);
  }

  function loadPresentationMode() {
    const resources = [
      [`presentation-data.js?v=${CACHE_KEY}`, 'm4wdPresentationData'],
      [`presentation-renderer.js?v=${CACHE_KEY}`, 'm4wdPresentationRenderer'],
      [`presentation-export.js?v=${CACHE_KEY}`, 'm4wdPresentationExport'],
      [`presentation-mode.js?v=${CACHE_KEY}`, 'm4wdPresentationMode']
    ];
    const loadAt = index => {
      if (index >= resources.length) {
        loadSimpleUi();
        return;
      }
      const [src, marker] = resources[index];
      loadScript(src, marker, () => loadAt(index + 1));
    };
    loadAt(0);
  }

  function loadMarqueePreview() {
    loadScript(`marquee-target-preview.js?v=${CACHE_KEY}`, 'm4wdMarqueePreview', loadPresentationMode);
  }

  function loadStartReplacementSnap() {
    loadScript(`start-replacement-snap.js?v=${CACHE_KEY}`, 'm4wdStartReplacementSnap', loadMarqueePreview);
  }

  function start() {
    ensureStyleLink('presentationModeStyles', `presentation-mode.css?v=${CACHE_KEY}`);
    ensureHiddenSubEditGuard();
    loadStartReplacementSnap();
  }

  if (documentRef.readyState === 'loading') {
    documentRef.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
