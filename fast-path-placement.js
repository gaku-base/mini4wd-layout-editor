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
  const FAST_PATH_RELEASE_PX = 90;
  const CENTER_PX = 20;
  const TURN_PX = 30;
  // Ignore side-to-side movement until the physical pointer is in front of
  // the current ghost exit. This keeps a pointer left behind by a placement
  // from accidentally changing the next part type.
  // Selecting a side at the exact exit is valid.  Only a point behind the
  // displayed ghost is excluded; requiring an additional 6px made the
  // browser path needlessly hard to enter at ordinary zoom levels.
  const MIN_FORWARD_PX = 0;
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

  function pointerComponents(anchorScreen, pointerScreen, headingDeg) {
    const radians = Number(headingDeg || 0) * Math.PI / 180;
    const forward = { x: Math.cos(radians), y: Math.sin(radians) };
    const right = { x: -Math.sin(radians), y: Math.cos(radians) };
    const delta = {
      x: Number(pointerScreen?.x) - Number(anchorScreen?.x),
      y: Number(pointerScreen?.y) - Number(anchorScreen?.y)
    };
    return {
      forwardPx: delta.x * forward.x + delta.y * forward.y,
      lateralPx: delta.x * right.x + delta.y * right.y,
      distancePx: Math.hypot(delta.x, delta.y)
    };
  }

  function lateralOffsetPx(anchorScreen, pointerScreen, headingDeg) {
    return pointerComponents(anchorScreen, pointerScreen, headingDeg).lateralPx;
  }

  function isInForwardSelectionZone(forwardPx) {
    return Number(forwardPx) >= MIN_FORWARD_PX;
  }

  function typeForPointer({ currentType, fallbackType = STRAIGHT, anchorScreen, pointerScreen, headingDeg }) {
    const current = isFastPathType(currentType) ? currentType : (isFastPathType(fallbackType) ? fallbackType : STRAIGHT);
    const components = pointerComponents(anchorScreen, pointerScreen, headingDeg);
    const lateral = components.lateralPx;
    if (Math.abs(lateral) <= CENTER_PX) return { type: STRAIGHT, ...components, zone: 'center' };
    if (lateral >= TURN_PX) return { type: RIGHT, ...components, zone: 'right' };
    if (lateral <= -TURN_PX) return { type: LEFT, ...components, zone: 'left' };
    return { type: current, ...components, zone: 'hysteresis' };
  }

  // This is the state transition used by the canvas pointermove handler.
  // Keep the physical release distance separate from the displayed ghost's
  // exit geometry: the former decides repeat/select/free, while the latter
  // decides Straight/Right/Left during select.
  function runtimeTransitionForPointer({ fastPath, pointerScreen, physicalPointerScreen = pointerScreen, selectionPointerScreen = pointerScreen, ghostExitScreen, currentType, fallbackType = STRAIGHT }) {
    const transition = transitionForPointer(fastPath, physicalPointerScreen);
    const result = {
      ...transition,
      type: isFastPathType(currentType) ? currentType : fallbackType,
      forwardPx: 0,
      lateralPx: 0,
      zone: transition.phase === FREE ? 'free' : transition.phase === REPEAT ? 'repeat' : 'pending'
    };
    if (transition.phase !== SELECT || !ghostExitScreen) return result;

    const components = pointerComponents(ghostExitScreen, selectionPointerScreen, ghostExitScreen.heading);
    result.forwardPx = components.forwardPx;
    result.lateralPx = components.lateralPx;
    if (!isInForwardSelectionZone(components.forwardPx)) {
      result.zone = 'behind';
      return result;
    }
    const decision = typeForPointer({
      currentType: result.type,
      fallbackType,
      anchorScreen: ghostExitScreen,
      pointerScreen: selectionPointerScreen,
      headingDeg: ghostExitScreen.heading
    });
    return { ...result, ...decision, activePlacementAnchor: transition.activePlacementAnchor };
  }

  return Object.freeze({
    STRAIGHT, RIGHT, LEFT, MOVE_TOLERANCE_PX, FAST_PATH_RELEASE_PX, CENTER_PX, TURN_PX, MIN_FORWARD_PX,
    REPEAT, SELECT, FREE,
    isFastPathType, distancePx, hasMeaningfulPointerMove, phaseForPointer, transitionForPointer,
    pointerComponents, lateralOffsetPx, isInForwardSelectionZone, typeForPointer, runtimeTransitionForPointer
  });
});
