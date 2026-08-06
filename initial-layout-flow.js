(function attachInitialLayoutFlow(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_INITIAL_LAYOUT_FLOW = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  const STEPS = Object.freeze({
    LAYOUT_SPACE: 'layout-space',
    VENUE_SETUP: 'venue-setup',
    START: 'start'
  });

  const ROTATION_STEP = 5;

  function nextStep(completedStep) {
    return completedStep === STEPS.LAYOUT_SPACE ? STEPS.VENUE_SETUP : STEPS.START;
  }

  function nextObstacleName(obstacles = []) {
    const names = new Set((Array.isArray(obstacles) ? obstacles : []).map(item => String(item?.name || '')));
    let number = 1;
    while (names.has(`設置不可エリア${number}`)) number += 1;
    return `設置不可エリア${number}`;
  }

  function rotateVenueArea(rotation, delta) {
    const value = Number(rotation) || 0;
    return ((value + delta) % 360 + 360) % 360;
  }

  return Object.freeze({ STEPS, ROTATION_STEP, nextStep, nextObstacleName, rotateVenueArea });
}));
