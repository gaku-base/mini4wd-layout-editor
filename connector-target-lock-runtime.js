(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.M4WD_CONNECTOR_TARGET_LOCK_RUNTIME = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GRAPH_WRAP_MARKER = '__m4wdConnectorTargetLockWrapped';
  const STATE_KEY = '__M4WD_CONNECTOR_TARGET_LOCK_STATE__';
  const UI_INSTALLED_KEY = '__M4WD_CONNECTOR_TARGET_LOCK_UI_INSTALLED__';
  const OVERLAY_ID = 'connectorTargetLockOverlay';
  const STATUS_ID = 'connectorTargetLockStatus';
  const STYLE_ID = 'connectorTargetLockStyles';

  function endpointIdentity(value = {}) {
    const partId = String(value.partId ?? value.sourceId ?? '').trim();
    const connectorId = String(value.connectorId ?? '').trim();
    return partId && connectorId ? `${encodeURIComponent(partId)}|${encodeURIComponent(connectorId)}` : '';
  }

  function normalizeTarget(value = {}) {
    const identity = endpointIdentity(value);
    if (!identity) return null;
    return Object.freeze({
      partId: String(value.partId ?? value.sourceId),
      connectorId: String(value.connectorId),
      sourceType: value.sourceType == null ? null : String(value.sourceType),
      label: value.label == null ? null : String(value.label),
      x: Number(value.x) || 0,
      y: Number(value.y) || 0,
      zMm: Number(value.zMm) || 0,
      heading: Number(value.heading ?? value.directionDeg) || 0,
      identity
    });
  }

  function sameTarget(left, right) {
    return Boolean(left && right && endpointIdentity(left) && endpointIdentity(left) === endpointIdentity(right));
  }

  function targetMatchesLock(target, lock) {
    return Boolean(lock && endpointIdentity(target) === lock.identity);
  }

  function ensureState(root) {
    if (!root[STATE_KEY] || typeof root[STATE_KEY] !== 'object') {
      root[STATE_KEY] = {
        lock: null,
        commitCountAtLock: null,
        blockedMessage: '',
        clearReason: null
      };
    }
    return root[STATE_KEY];
  }

  function setLock(state, endpoint, commitCount = null) {
    const lock = normalizeTarget(endpoint);
    if (!lock) return null;
    state.lock = lock;
    state.commitCountAtLock = Number.isFinite(Number(commitCount)) ? Number(commitCount) : null;
    state.blockedMessage = '';
    state.clearReason = null;
    return lock;
  }

  function clearLock(state, reason = 'manual') {
    const hadLock = Boolean(state.lock);
    state.lock = null;
    state.commitCountAtLock = null;
    state.blockedMessage = '';
    state.clearReason = reason;
    return hadLock;
  }

  function lockedChoosePlacement(originalChoosePlacement, state, part, catalog, targets, options = {}) {
    if (typeof originalChoosePlacement !== 'function') return null;
    const lock = state?.lock;
    if (!lock) return originalChoosePlacement(part, catalog, targets, options);
    const target = (Array.isArray(targets) ? targets : []).find(candidate => targetMatchesLock(candidate, lock));
    if (!target) {
      clearLock(state, 'target-missing');
      return originalChoosePlacement(part, catalog, targets, options);
    }
    return originalChoosePlacement(part, catalog, [target], {
      ...options,
      snapEnabled: true,
      radiusPx: Infinity,
      selectedTargetKey: null
    });
  }

  function installGraphWrapper(root, state) {
    const graph = root?.M4WD_LAYOUT_GRAPH;
    if (!graph || typeof graph.choosePlacement !== 'function') return false;
    if (graph[GRAPH_WRAP_MARKER] === true) return true;
    const originalChoosePlacement = graph.choosePlacement;
    root.M4WD_LAYOUT_GRAPH = Object.freeze({
      ...graph,
      [GRAPH_WRAP_MARKER]: true,
      choosePlacement(part, catalog, targets, options = {}) {
        return lockedChoosePlacement(originalChoosePlacement, state, part, catalog, targets, options);
      }
    });
    return true;
  }

  function usedEndpointIdentities(connections = []) {
    const used = new Set();
    (Array.isArray(connections) ? connections : []).forEach(edge => {
      const left = endpointIdentity({ partId: edge?.partAId, connectorId: edge?.connectorAId });
      const right = endpointIdentity({ partId: edge?.partBId, connectorId: edge?.connectorBId });
      if (left) used.add(left);
      if (right) used.add(right);
    });
    return used;
  }

  function openEndpoints(endpoints = [], connections = []) {
    const used = usedEndpointIdentities(connections);
    return (Array.isArray(endpoints) ? endpoints : []).filter(endpoint => {
      const identity = endpointIdentity(endpoint);
      return Boolean(identity && !used.has(identity));
    });
  }

  function fieldContainsPoint(bounds = {}, point = {}, epsilon = 1e-9) {
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= Number(bounds.minX) - epsilon && x <= Number(bounds.maxX) + epsilon
      && y >= Number(bounds.minY) - epsilon && y <= Number(bounds.maxY) + epsilon;
  }

  function createControl(root, state) {
    return Object.freeze({
      get: () => state.lock ? { ...state.lock } : null,
      set: (endpoint, commitCount = null) => setLock(state, endpoint, commitCount),
      clear: reason => clearLock(state, reason),
      isLocked: () => Boolean(state.lock)
    });
  }

  function forceAppRefresh(root) {
    const debug = root.__mini4wdCourseDebug;
    if (!debug || typeof debug.getRuntimeState !== 'function' || typeof debug.setCursor !== 'function') return;
    try {
      const runtime = debug.getRuntimeState();
      debug.setCursor(runtime?.cursor?.x ?? 0, runtime?.cursor?.y ?? 0);
    } catch (_) {}
  }

  function ensureStyles(documentRef) {
    if (documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: absolute;
        inset: 0;
        z-index: 18;
        pointer-events: none;
        overflow: hidden;
      }
      #${OVERLAY_ID} .connector-target-point {
        position: absolute;
        width: 13px;
        height: 13px;
        padding: 0;
        border: 2px solid #45c8ff;
        border-radius: 999px;
        background: rgba(10, 28, 38, .88);
        box-shadow: 0 0 0 2px rgba(4, 14, 20, .50), 0 0 8px rgba(69, 200, 255, .55);
        transform: translate(-50%, -50%);
        cursor: pointer;
        pointer-events: auto;
      }
      #${OVERLAY_ID} .connector-target-point:hover {
        width: 18px;
        height: 18px;
        border-color: #8ce6ff;
        box-shadow: 0 0 0 3px rgba(4, 14, 20, .55), 0 0 12px rgba(100, 220, 255, .85);
      }
      #${OVERLAY_ID} .connector-target-point.is-locked {
        width: 18px;
        height: 18px;
        border-color: #ffd45c;
        background: #8a6710;
        box-shadow: 0 0 0 3px rgba(20, 15, 4, .58), 0 0 14px rgba(255, 212, 92, .95);
      }
      #${STATUS_ID} {
        position: absolute;
        z-index: 19;
        left: 50%;
        top: 9px;
        transform: translateX(-50%);
        max-width: calc(100% - 36px);
        padding: 6px 10px;
        border: 1px solid rgba(255, 212, 92, .8);
        border-radius: 999px;
        background: rgba(18, 24, 29, .92);
        color: #ffe39a;
        font: 700 11px/1.2 system-ui, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }
      #${STATUS_ID}.is-blocked {
        border-color: #ff7888;
        color: #ffc2ca;
      }
    `;
    documentRef.head.appendChild(style);
  }

  function installBrowserUi(root, state) {
    if (!root?.document || root[UI_INSTALLED_KEY]) return false;
    const documentRef = root.document;
    const canvas = documentRef.getElementById('courseCanvas');
    const wrap = documentRef.getElementById('canvasWrap');
    const debug = root.__mini4wdCourseDebug;
    const room = root.M4WD_ROOM_BOUNDARY;
    if (!canvas || !wrap || !debug || !room) return false;
    root[UI_INSTALLED_KEY] = true;
    ensureStyles(documentRef);

    const overlay = documentRef.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-label', '接続先指定');
    wrap.appendChild(overlay);

    const status = documentRef.createElement('div');
    status.id = STATUS_ID;
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(status);

    let lastSignature = '';

    function clearAndRefresh(reason) {
      if (!clearLock(state, reason)) return false;
      forceAppRefresh(root);
      lastSignature = '';
      return true;
    }

    function chooseEndpoint(endpoint) {
      const current = state.lock;
      if (sameTarget(current, endpoint)) {
        clearAndRefresh('same-connector-click');
        return;
      }
      try { debug.setMode('place'); } catch (_) {}
      let commitCount = null;
      try { commitCount = debug.getRuntimeState()?.placementCommitCount; } catch (_) {}
      setLock(state, endpoint, commitCount);
      forceAppRefresh(root);
      lastSignature = '';
    }

    function renderOverlay(force = false) {
      let runtime;
      let endpoints;
      try {
        runtime = debug.getRuntimeState();
        endpoints = debug.getOpenConnections();
      } catch (_) {
        return;
      }

      if (state.lock && runtime?.mode !== 'place') clearLock(state, 'mode-change');
      if (state.lock && state.commitCountAtLock != null
          && Number(runtime?.placementCommitCount) > Number(state.commitCountAtLock)) {
        clearLock(state, 'placement-complete');
      }

      const open = runtime?.mode === 'place' ? openEndpoints(endpoints, runtime.connections) : [];
      if (state.lock && !open.some(endpoint => sameTarget(endpoint, state.lock))) {
        clearLock(state, 'target-no-longer-open');
      }

      if (state.lock) {
        let proposal = null;
        try { proposal = debug.getPlacementProposal(); } catch (_) {}
        state.blockedMessage = proposal?.snapped ? '' : 'このパーツは指定した接続口へ接続できません';
      } else {
        state.blockedMessage = '';
      }

      const signature = JSON.stringify({
        mode: runtime?.mode,
        view: runtime?.view,
        lock: state.lock?.identity || null,
        blocked: state.blockedMessage,
        open: open.map(endpoint => [endpointIdentity(endpoint), endpoint.x, endpoint.y, endpoint.zMm])
      });
      if (!force && signature === lastSignature) return;
      lastSignature = signature;

      overlay.replaceChildren();
      overlay.hidden = runtime?.mode !== 'place';
      status.hidden = !state.lock;
      status.classList.toggle('is-blocked', Boolean(state.blockedMessage));
      status.textContent = state.lock
        ? (state.blockedMessage || '接続先指定中　Esc・同じ接続口・レイアウトスペース外クリックで解除')
        : '';

      if (runtime?.mode !== 'place') return;
      const canvasRect = canvas.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      open.forEach(endpoint => {
        const point = room.worldToScreen({ x: endpoint.x, y: endpoint.y }, runtime.view);
        const x = canvasRect.left - wrapRect.left + point.x;
        const y = canvasRect.top - wrapRect.top + point.y;
        if (x < -10 || y < -10 || x > canvasRect.width + 10 || y > canvasRect.height + 10) return;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = `connector-target-point${sameTarget(endpoint, state.lock) ? ' is-locked' : ''}`;
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        button.dataset.connectorTarget = endpointIdentity(endpoint);
        button.title = `接続先を指定：${endpoint.label || endpoint.connectorId}`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('pointerdown', event => {
          event.preventDefault();
          event.stopPropagation();
          chooseEndpoint(endpoint);
          renderOverlay(true);
        });
        overlay.appendChild(button);
      });
    }

    canvas.addEventListener('pointerdown', event => {
      if (!state.lock || event.button !== 0) return;
      let runtime;
      let bounds;
      try {
        runtime = debug.getRuntimeState();
        bounds = debug.getFieldBounds();
      } catch (_) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const worldPoint = room.screenToWorld(screenPoint, runtime.view);
      if (!fieldContainsPoint(bounds, worldPoint)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        clearAndRefresh('outside-layout-click');
        renderOverlay(true);
        return;
      }
      let proposal = null;
      try { proposal = debug.getPlacementProposal(); } catch (_) {}
      if (!proposal?.snapped) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.blockedMessage = 'このパーツは指定した接続口へ接続できません';
        renderOverlay(true);
      }
    }, true);

    documentRef.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !state.lock) return;
      clearAndRefresh('escape');
      renderOverlay(true);
    }, true);

    const tick = () => {
      if (!documentRef.documentElement.contains(canvas)) return;
      renderOverlay(false);
      root.requestAnimationFrame(tick);
    };
    root.requestAnimationFrame(tick);
    return true;
  }

  function install(rootValue) {
    const root = rootValue || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!root) return false;
    const state = ensureState(root);
    const graphInstalled = installGraphWrapper(root, state);
    root.M4WD_CONNECTOR_TARGET_LOCK = createControl(root, state);

    const installUi = () => {
      if (installBrowserUi(root, state)) return;
      if (root.document?.readyState !== 'complete') root.setTimeout?.(installUi, 25);
    };
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', installUi, { once: true });
      else installUi();
    }
    return graphInstalled;
  }

  return Object.freeze({
    GRAPH_WRAP_MARKER,
    STATE_KEY,
    endpointIdentity,
    normalizeTarget,
    sameTarget,
    targetMatchesLock,
    setLock,
    clearLock,
    lockedChoosePlacement,
    usedEndpointIdentities,
    openEndpoints,
    fieldContainsPoint,
    install
  });
});
