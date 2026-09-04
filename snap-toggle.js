(function attachSnapToggle(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.M4WD_SNAP_TOGGLE = api;
    api.installStartBoundarySnapBridge(root);
  }
})(typeof globalThis === 'object' ? globalThis : window, () => {
  const EPSILON = 1e-9;

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function nearestCorrection(minCorrection, maxCorrection, thresholdWorld) {
    const candidates = [
      { side: 'min', value: minCorrection },
      { side: 'max', value: maxCorrection }
    ].filter(candidate => Math.abs(candidate.value) <= thresholdWorld + EPSILON);
    if (!candidates.length) return { side: null, value: 0 };
    candidates.sort((a, b) => Math.abs(a.value) - Math.abs(b.value));
    return candidates[0];
  }

  function snapBoundsToFrame({ point, bounds, frame, scale = 1, radiusPx = 24 } = {}) {
    const x = finite(point?.x);
    const y = finite(point?.y);
    const safeScale = Math.max(EPSILON, Math.abs(finite(scale, 1)));
    const thresholdWorld = Math.max(0, finite(radiusPx, 24)) / safeScale;
    const minXCorrection = finite(frame?.minX) - finite(bounds?.minX);
    const maxXCorrection = finite(frame?.maxX) - finite(bounds?.maxX);
    const minYCorrection = finite(frame?.minY) - finite(bounds?.minY);
    const maxYCorrection = finite(frame?.maxY) - finite(bounds?.maxY);
    const xCorrection = nearestCorrection(minXCorrection, maxXCorrection, thresholdWorld);
    const yCorrection = nearestCorrection(minYCorrection, maxYCorrection, thresholdWorld);
    return {
      point: {
        x: x + xCorrection.value,
        y: y + yCorrection.value
      },
      correctionX: xCorrection.value,
      correctionY: yCorrection.value,
      snappedX: xCorrection.side,
      snappedY: yCorrection.side,
      thresholdWorld
    };
  }

  function installStartBoundarySnapBridge(root) {
    if (!root || !root.document) return false;

    // wheel-rotation/editor-extensions-bootstrap already own the short-lived
    // production editor bridge lifecycle. Capture that same object after app.js
    // initializes, but never create, publish, disable or delete the bridge here.
    // The existing extension bootstrap remains the single lifecycle owner.
    const installRuntime = () => {
      const debug = root.__mini4wdCourseDebug;
      const graph = root.M4WD_LAYOUT_GRAPH;
      const catalog = root.M4WD_PART_CATALOG;
      const canvas = root.document.getElementById('courseCanvas');
      if (!debug || !graph || !catalog?.PARTS?.start || !canvas) return false;

      const snapCurrentStartCursor = () => {
        const runtime = debug.getRuntimeState?.();
        const serialized = debug.getState?.();
        if (!runtime || runtime.mode !== 'start' || serialized?.start) return null;
        const cursor = runtime.cursor;
        if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null;

        const candidate = {
          id: 'start-boundary-preview',
          type: 'start',
          x: cursor.x,
          y: cursor.y,
          rotation: finite(serialized?.rotation)
        };
        const polygon = graph.occupancyPolygon(candidate, catalog.PARTS.start);
        const bounds = graph.polygonBounds(polygon);
        const frame = debug.getFieldBounds?.();
        if (!bounds || !frame) return null;

        const result = snapBoundsToFrame({
          point: cursor,
          bounds,
          frame,
          scale: runtime.view?.scale,
          radiusPx: graph.SNAP_RADIUS_PX
        });
        if (Math.abs(result.correctionX) > EPSILON || Math.abs(result.correctionY) > EPSILON) {
          debug.setCursor(result.point.x, result.point.y);
        }
        return result;
      };

      // app.js listeners were registered earlier. These listeners therefore run after
      // grid snapping/rotation and apply only the final Start-to-field edge correction.
      canvas.addEventListener('pointermove', snapCurrentStartCursor);
      canvas.addEventListener('pointerdown', snapCurrentStartCursor);
      canvas.addEventListener('wheel', snapCurrentStartCursor, { passive: true });
      root.document.addEventListener('keydown', event => {
        const key = String(event.key || '').toLowerCase();
        if (key === 'z' || key === 'x') snapCurrentStartCursor();
      });
      ['rotateLeftBtn', 'rotateRightBtn'].forEach(id => {
        root.document.getElementById(id)?.addEventListener('click', snapCurrentStartCursor);
      });
      return true;
    };

    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', installRuntime, { once: true });
    } else {
      queueMicrotask(installRuntime);
    }
    return true;
  }

  return {
    initialState() { return { enabled: true }; },
    toggle(state) { return { enabled: !state.enabled }; },
    view(state) {
      return {
        label: `吸着 ${state.enabled ? 'ON' : 'OFF'}`,
        ariaPressed: String(state.enabled),
        active: state.enabled
      };
    },
    snapBoundsToFrame,
    installStartBoundarySnapBridge
  };
});
