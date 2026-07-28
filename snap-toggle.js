(function attachSnapToggle(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_SNAP_TOGGLE = api;
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
