(function attachSnapToggle(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_SNAP_TOGGLE = api;

  if (root && root.document && !root.document.getElementById('uiControlsCleanupLoader')) {
    const script = root.document.createElement('script');
    script.id = 'uiControlsCleanupLoader';
    script.src = 'ui-controls-cleanup.js?v=20260821-ui1';
    script.async = false;
    (root.document.head || root.document.documentElement).appendChild(script);
  }
}(typeof globalThis === 'object' ? globalThis : window, () => ({
  initialState() { return { enabled: true }; },
  toggle(state) { return { enabled: !state.enabled }; },
  view(state) {
    return {
      label: `吸着 ${state.enabled ? 'ON' : 'OFF'}`,
      ariaPressed: String(state.enabled),
      active: state.enabled
    };
  }
})));
