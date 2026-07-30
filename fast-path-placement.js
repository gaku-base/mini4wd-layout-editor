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
  // Fast-path release is directional.  A leading pointer may travel forward
  // indefinitely; only a deliberate step behind the selection origin or a
  // wide lateral departure returns to ordinary free placement.
  const AUTO_SELECT_LATERAL_RETAIN_PX = 90;
  const AUTO_SELECT_LATERAL_EXIT_PX = 110;
  const AUTO_SELECT_BACKWARD_RETAIN_PX = 30;
  const AUTO_SELECT_BACKWARD_EXIT_PX = 50;
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

  function directionalPhaseForPointer({ state, physicalPointerScreen, selectionOriginScreen, headingDeg }) {
    const anchor = state?.activePlacementAnchor || null;
    const releaseOrigin = state?.releasePointerOrigin || state?.physicalPointerOrigin || null;
    if (!anchor || !releaseOrigin || !selectionOriginScreen) {
      return { phase: FREE, activePlacementAnchor: null, physicalPointerCurrent: { ...physicalPointerScreen } };
    }
    const releaseDistancePx = distancePx(releaseOrigin, physicalPointerScreen);
    if (releaseDistancePx <= MOVE_TOLERANCE_PX) {
      return {
        phase: REPEAT,
        distancePx: releaseDistancePx,
        activePlacementAnchor: anchor,
        physicalPointerCurrent: { ...physicalPointerScreen },
        releaseReason: null
      };
    }

    const components = pointerComponents(selectionOriginScreen, physicalPointerScreen, headingDeg);
    const previousPhase = state?.phase;
    const lateralMagnitude = Math.abs(components.lateralPx);
    const backwardExit = components.forwardPx < -AUTO_SELECT_BACKWARD_EXIT_PX;
    const lateralExit = lateralMagnitude > AUTO_SELECT_LATERAL_EXIT_PX;
    // The retain bands prevent a pointer near an exit edge from oscillating
    // between select and free.  A session already anchored remains active in
    // the 90-110px lateral and 30-50px backward transition bands.
    const backwardReenter = components.forwardPx >= -AUTO_SELECT_BACKWARD_RETAIN_PX;
    const lateralReenter = lateralMagnitude <= AUTO_SELECT_LATERAL_RETAIN_PX;
    const inTransitionBand = (!backwardReenter && !backwardExit) || (!lateralReenter && !lateralExit);
    const release = backwardExit || lateralExit || (previousPhase === FREE && !inTransitionBand && (!backwardReenter || !lateralReenter));
    return {
      phase: release ? FREE : SELECT,
      distancePx: releaseDistancePx,
      activePlacementAnchor: release ? null : anchor,
      physicalPointerCurrent: { ...physicalPointerScreen },
      forwardPx: components.forwardPx,
      lateralPx: components.lateralPx,
      releaseReason: release ? (backwardExit ? 'backward' : 'lateral') : null
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

  // Keep the operating-system cursor untouched while making the displayed
  // ghost exit the selection origin.  Only the physical pointer delta since
  // the last confirmed placement is translated into this virtual coordinate.
  function selectionPointerFromPhysicalDelta({ physicalPointerOrigin, selectionPointerOrigin, physicalPointerCurrent }) {
    if (!physicalPointerOrigin || !selectionPointerOrigin || !physicalPointerCurrent) return null;
    return {
      x: selectionPointerOrigin.x + physicalPointerCurrent.x - physicalPointerOrigin.x,
      y: selectionPointerOrigin.y + physicalPointerCurrent.y - physicalPointerOrigin.y
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
  // Physical movement from the last click decides repeat/select/free. The
  // virtual selection coordinate at the displayed ghost exit decides
  // Straight/Right/Left during select.
  function runtimeTransitionForPointer({ fastPath, pointerScreen, physicalPointerScreen = pointerScreen, selectionPointerScreen = pointerScreen, ghostExitScreen, currentType, fallbackType = STRAIGHT }) {
    const releaseOriginScreen = fastPath?.releasePointerOrigin || fastPath?.physicalPointerOrigin || null;
    // A placement cycle keeps its original course heading while the ghost
    // changes between Straight/Right/Left.  Falling back to the ghost exit
    // preserves compatibility for callers that do not yet carry frame state.
    const selectionFrameHeading = Number.isFinite(fastPath?.selectionFrameHeading)
      ? fastPath.selectionFrameHeading
      : ghostExitScreen?.heading;
    const selectionFrameOriginScreen = fastPath?.selectionPointerOrigin || ghostExitScreen;
    const transition = directionalPhaseForPointer({
      state: fastPath,
      physicalPointerScreen,
      selectionOriginScreen: releaseOriginScreen,
      headingDeg: selectionFrameHeading
    });
    const result = {
      ...transition,
      type: isFastPathType(currentType) ? currentType : fallbackType,
      forwardPx: 0,
      lateralPx: 0,
      zone: transition.phase === FREE ? 'free' : transition.phase === REPEAT ? 'repeat' : 'pending'
    };
    if (transition.phase !== SELECT || !ghostExitScreen) return result;

    const components = pointerComponents(selectionFrameOriginScreen, selectionPointerScreen, selectionFrameHeading);
    result.forwardPx = components.forwardPx;
    result.lateralPx = components.lateralPx;
    // A pointer in the small backward hysteresis band remains attached but
    // keeps its existing type; side selection resumes on the next forward
    // pointermove.
    if (!isInForwardSelectionZone(components.forwardPx)) return { ...result, zone: 'behind' };
    const decision = typeForPointer({
      currentType: result.type,
      fallbackType,
      anchorScreen: selectionFrameOriginScreen,
      pointerScreen: selectionPointerScreen,
      headingDeg: selectionFrameHeading
    });
    return { ...result, ...decision, activePlacementAnchor: transition.activePlacementAnchor };
  }

  return Object.freeze({
    STRAIGHT, RIGHT, LEFT, MOVE_TOLERANCE_PX, FAST_PATH_RELEASE_PX, CENTER_PX, TURN_PX, MIN_FORWARD_PX,
    AUTO_SELECT_LATERAL_RETAIN_PX, AUTO_SELECT_LATERAL_EXIT_PX,
    AUTO_SELECT_BACKWARD_RETAIN_PX, AUTO_SELECT_BACKWARD_EXIT_PX,
    REPEAT, SELECT, FREE,
    isFastPathType, distancePx, hasMeaningfulPointerMove, phaseForPointer, transitionForPointer, directionalPhaseForPointer,
    pointerComponents, selectionPointerFromPhysicalDelta, lateralOffsetPx, isInForwardSelectionZone, typeForPointer, runtimeTransitionForPointer
  });
});
