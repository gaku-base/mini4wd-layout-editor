(function attachSnapToggle(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_SNAP_TOGGLE = api;
}(typeof globalThis === 'object' ? globalThis : window, () => ({
  initialState() { return { enabled: true, altDisabled: false }; },
  toggle(state) { return { ...state, enabled: !state.enabled }; },
  setAltDisabled(state, value) { return { ...state, altDisabled: Boolean(value) }; },
  view(state) {
    return {
      label: state.altDisabled ? '吸着 一時OFF' : `吸着 ${state.enabled ? 'ON' : 'OFF'}`,
      ariaPressed: String(state.enabled),
      active: state.enabled && !state.altDisabled
    };
  }
})));
