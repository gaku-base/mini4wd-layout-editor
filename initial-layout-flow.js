(function attachInitialLayoutFlow(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.M4WD_INITIAL_LAYOUT_FLOW = api;
}(typeof globalThis === 'object' ? globalThis : window, () => {
  const STEPS = Object.freeze({
    LAYOUT_SPACE: 'layout-space',
    SPACE_ADJUSTMENT: 'space-adjustment',
    INTERFERENCE: 'interference',
    CONFIRM: 'confirm',
    START: 'start'
  });

  function normalizeOptions(options = {}) {
    return {
      adjustRoomShape: options.adjustRoomShape === true,
      configureObstacles: options.configureObstacles === true
    };
  }

  function nextStep(completedStep, options = {}) {
    const selected = normalizeOptions(options);
    if (completedStep === STEPS.LAYOUT_SPACE) {
      if (selected.adjustRoomShape) return STEPS.SPACE_ADJUSTMENT;
      if (selected.configureObstacles) return STEPS.INTERFERENCE;
      return STEPS.START;
    }
    if (completedStep === STEPS.SPACE_ADJUSTMENT) {
      return selected.configureObstacles ? STEPS.INTERFERENCE : STEPS.CONFIRM;
    }
    if (completedStep === STEPS.INTERFERENCE) return STEPS.CONFIRM;
    return STEPS.START;
  }

  function nextObstacleName(obstacles = []) {
    const names = new Set((Array.isArray(obstacles) ? obstacles : []).map(item => String(item?.name || '')));
    let number = 1;
    while (names.has(`干渉物${number}`)) number += 1;
    return `干渉物${number}`;
  }

  return Object.freeze({ STEPS, normalizeOptions, nextStep, nextObstacleName });
}));
