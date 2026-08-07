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
  const MIN_UNAVAILABLE_AREA_CM = 1;

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

  function unavailableAreaFromDrag(start, end, field, minimumCm = MIN_UNAVAILABLE_AREA_CM) {
    if (!start || !end || !field) return null;
    const originX = Number(field.originX) || 0;
    const originY = Number(field.originY) || 0;
    const maxX = originX + Math.max(0, Number(field.widthCm) || 0);
    const maxY = originY + Math.max(0, Number(field.heightCm) || 0);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
    const x1 = clamp(start.x, originX, maxX);
    const y1 = clamp(start.y, originY, maxY);
    const x2 = clamp(end.x, originX, maxX);
    const y2 = clamp(end.y, originY, maxY);
    const widthCm = Math.abs(x2 - x1);
    const depthCm = Math.abs(y2 - y1);
    if (widthCm < minimumCm || depthCm < minimumCm) return null;
    return {
      x: Math.min(x1, x2) + widthCm / 2,
      y: Math.min(y1, y2) + depthCm / 2,
      widthCm,
      depthCm
    };
  }

  function countInvalidUnavailableAreas(areas, validate) {
    if (!Array.isArray(areas) || typeof validate !== 'function') return 0;
    return areas.filter(area => validate(area)?.valid !== true).length;
  }

  return Object.freeze({
    STEPS,
    ROTATION_STEP,
    MIN_UNAVAILABLE_AREA_CM,
    nextStep,
    nextObstacleName,
    rotateVenueArea,
    unavailableAreaFromDrag,
    countInvalidUnavailableAreas
  });
}));
