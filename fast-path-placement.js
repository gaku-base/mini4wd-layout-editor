(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_FAST_PATH_PLACEMENT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STRAIGHT = 'straight';
  const RIGHT = 'corner-45-right';
  const LEFT = 'corner-45-left';
  const MOVE_TOLERANCE_PX = 10;
  // This is intentionally independent from the 24px connector snap radius.
  // It controls when a fast-path anchor yields to ordinary pointer placement.
  const FAST_PATH_RELEASE_PX = 70;
  const CENTER_PX = 20;
  const TURN_PX = 30;
  const REPEAT = 'repeat';
  const SELECT = 'select';
  const FREE = 'free';

  function isFastPathType(type) {
    return type === STRAIGHT || type === RIGHT || type === LEFT;
  }

  function distancePx(a, b) {
    return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
  }

  function hasMeaningfulPointerMove(origin, point, tolerancePx = MOVE_TOLERANCE_PX) {
    return distancePx(origin, point) > tolerancePx;
  }

  // The first 10px distinguish an unchanged repeat click from an intentional
  // part selection.  They do not release the anchored placement cursor.
  function phaseForPointer(origin, point) {
    const distance = distancePx(origin, point);
    if (distance <= MOVE_TOLERANCE_PX) return { phase: REPEAT, distancePx: distance };
    if (distance <= FAST_PATH_RELEASE_PX) return { phase: SELECT, distancePx: distance };
    return { phase: FREE, distancePx: distance };
  }

  function transitionForPointer(state, point) {
    const anchor = state?.activePlacementAnchor || null;
    const origin = state?.physicalPointerOrigin || null;
    if (!anchor || !origin) return { phase: FREE, activePlacementAnchor: null, physicalPointerCurrent: { ...point } };
    const result = phaseForPointer(origin, point);
    return {
      ...result,
      activePlacementAnchor: result.phase === FREE ? null : anchor,
      physicalPointerCurrent: { ...point }
    };
  }

  function lateralOffsetPx(anchorScreen, pointerScreen, headingDeg) {
    const radians = Number(headingDeg || 0) * Math.PI / 180;
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const delta = {
      x: Number(pointerScreen?.x) - Number(anchorScreen?.x),
      y: Number(pointerScreen?.y) - Number(anchorScreen?.y)
    };
    return delta.x * right.x + delta.y * right.y;
  }

  function typeForPointer({ currentType, fallbackType = STRAIGHT, anchorScreen, pointerScreen, headingDeg }) {
    const current = isFastPathType(currentType) ? currentType : (isFastPathType(fallbackType) ? fallbackType : STRAIGHT);
    const lateral = lateralOffsetPx(anchorScreen, pointerScreen, headingDeg);
    if (Math.abs(lateral) <= CENTER_PX) return { type: STRAIGHT, lateralPx: lateral, zone: 'center' };
    if (lateral >= TURN_PX) return { type: RIGHT, lateralPx: lateral, zone: 'right' };
    if (lateral <= -TURN_PX) return { type: LEFT, lateralPx: lateral, zone: 'left' };
    return { type: current, lateralPx: lateral, zone: 'hysteresis' };
  }

  return Object.freeze({
    STRAIGHT, RIGHT, LEFT, MOVE_TOLERANCE_PX, FAST_PATH_RELEASE_PX, CENTER_PX, TURN_PX,
    REPEAT, SELECT, FREE,
    isFastPathType, distancePx, hasMeaningfulPointerMove, phaseForPointer, transitionForPointer, lateralOffsetPx, typeForPointer
  });
});
