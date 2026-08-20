(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_START_REPLACEMENT_SNAP = api;
  if (root && root.document) api.install(root.document, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FLAT_EPSILON_DEG = 0.1;
  const GROUND_EPSILON_MM = 0.01;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function endpointKey(partId, connectorId) {
    return `${String(partId)}\u0000${String(connectorId)}`;
  }

  function usedEndpointKeys(edges) {
    const used = new Set();
    (Array.isArray(edges) ? edges : []).forEach(edge => {
      const aPart = edge?.partAId ?? edge?.a?.partId;
      const aConnector = edge?.connectorAId ?? edge?.a?.connectorId;
      const bPart = edge?.partBId ?? edge?.b?.partId;
      const bConnector = edge?.connectorBId ?? edge?.b?.connectorId;
      if (aPart != null && aConnector != null) used.add(endpointKey(aPart, aConnector));
      if (bPart != null && bConnector != null) used.add(endpointKey(bPart, bConnector));
    });
    return used;
  }

  function normalizeTarget(endpoint) {
    if (!endpoint) return null;
    const partId = String(endpoint.partId ?? endpoint.sourceId ?? '').trim();
    const connectorId = String(endpoint.connectorId ?? endpoint.id ?? '').trim();
    if (!partId || !connectorId) return null;
    return {
      ...endpoint,
      partId,
      connectorId,
      sourceId: partId,
      x: finite(endpoint.x),
      y: finite(endpoint.y),
      zMm: finite(endpoint.zMm),
      directionDeg: finite(endpoint.directionDeg ?? endpoint.heading),
      heading: finite(endpoint.heading ?? endpoint.directionDeg),
      pitchDeg: finite(endpoint.pitchDeg),
      bankAngleDeg: finite(endpoint.bankAngleDeg ?? endpoint.connectionState?.bankAngle),
      shape: String(endpoint.shape || 'jcjc-3lane'),
      laneCount: Math.max(1, Math.trunc(finite(endpoint.laneCount, 3)))
    };
  }

  function eligibleTargets(runtime) {
    const used = usedEndpointKeys(runtime?.connections);
    return (Array.isArray(runtime?.openConnections) ? runtime.openConnections : [])
      .map(normalizeTarget)
      .filter(Boolean)
      .filter(target => !used.has(endpointKey(target.partId, target.connectorId)))
      // Start is rendered as a level part. Do not silently tilt/bank it to a
      // slope or bank connector even though the generic solver can solve that pose.
      .filter(target => Math.abs(target.pitchDeg) <= FLAT_EPSILON_DEG)
      .filter(target => Math.abs(target.bankAngleDeg) <= FLAT_EPSILON_DEG)
      // The existing Start placement commits at ground height. Keep the snap
      // proposal faithful to what app.js can actually commit.
      .filter(target => Math.abs(target.zMm) <= GROUND_EPSILON_MM);
  }

  function startReplacementEligible(layout, runtime) {
    return Boolean(runtime?.mode === 'start'
      && !layout?.start
      && Array.isArray(layout?.parts)
      && layout.parts.length > 0
      && runtime?.snapEnabled !== false);
  }

  function createStartReplacementSnapProposal(layout, runtime, catalog, graph) {
    if (!startReplacementEligible(layout, runtime)) return null;
    if (!catalog?.PARTS?.start || typeof graph?.choosePlacement !== 'function') return null;
    const targets = eligibleTargets(runtime);
    if (!targets.length) return null;

    const free = {
      id: 'ghost-start-replacement',
      type: 'start',
      x: finite(runtime?.cursor?.x),
      y: finite(runtime?.cursor?.y),
      zMm: 0,
      rotation: finite(layout?.rotation),
      pitchDeg: 0,
      bankAngleDeg: 0,
      zOrder: 0,
      routeIndex: 0
    };

    const placement = graph.choosePlacement(free, catalog.PARTS, targets, {
      scale: Math.max(0.0001, finite(runtime?.view?.scale, 1)),
      radiusPx: finite(graph.SNAP_RADIUS_PX, 24),
      snapEnabled: runtime.snapEnabled !== false,
      freeHeightMm: 0,
      partForSnapDistanceCandidate: () => free,
      edges: runtime.connections || []
    });
    if (placement?.kind !== 'snap' || !placement.selected) return null;

    const selected = placement.selected;
    const startConnectors = typeof graph.connectorsForDefinition === 'function'
      ? graph.connectorsForDefinition(catalog.PARTS.start)
      : [];
    const attachedIndex = Number(selected.localConnectorIndex);
    if (!Number.isInteger(attachedIndex) || !startConnectors[attachedIndex]) return null;
    const otherIndex = startConnectors.length === 2 ? (attachedIndex === 0 ? 1 : 0) : startConnectors.findIndex((_, index) => index !== attachedIndex);
    if (otherIndex < 0 || !startConnectors[otherIndex]) return null;

    return Object.freeze({
      snapped: true,
      pose: Object.freeze({
        x: finite(selected.pose?.x),
        y: finite(selected.pose?.y),
        zMm: 0,
        rotation: finite(selected.pose?.rotation),
        pitchDeg: 0,
        bankAngleDeg: 0
      }),
      target: Object.freeze({ ...selected.target }),
      localConnector: Object.freeze({ ...selected.localConnector }),
      attachedIndex,
      otherIndex,
      edge: Object.freeze({
        partAId: String(selected.target.partId),
        connectorAId: String(selected.target.connectorId),
        partBId: 'start',
        connectorBId: String(selected.localConnector.id)
      })
    });
  }

  function addStartConnection(layout, proposal, graph) {
    if (!layout || !proposal?.snapped || typeof graph?.addEdge !== 'function') return layout;
    return {
      ...layout,
      connections: graph.addEdge(layout.connections || [], {
        ...proposal.edge,
        createdOrder: (Array.isArray(layout.connections) ? layout.connections.length : 0) + 1
      })
    };
  }

  function otherStartEndpoint(start, proposal, catalog, graph) {
    if (!start || !proposal || !catalog?.PARTS?.start
      || typeof graph?.connectorsForDefinition !== 'function'
      || typeof graph?.worldConnector !== 'function') return null;
    const connectors = graph.connectorsForDefinition(catalog.PARTS.start);
    const connector = connectors[proposal.otherIndex];
    if (!connector) return null;
    return graph.worldConnector({ ...start, id: 'start', type: 'start' }, connector, proposal.otherIndex);
  }

  function install(documentRef, rootRef) {
    if (!documentRef || !rootRef || rootRef.__M4WD_START_REPLACEMENT_SNAP_INSTALLED__) return false;
    const canvas = documentRef.getElementById('courseCanvas');
    if (!canvas) return false;
    const catalog = rootRef.M4WD_PART_CATALOG;
    const graph = rootRef.M4WD_LAYOUT_GRAPH;
    if (!catalog?.PARTS?.start || typeof graph?.choosePlacement !== 'function') return false;

    rootRef.__M4WD_START_REPLACEMENT_SNAP_INSTALLED__ = true;

    const guide = documentRef.createElement('div');
    guide.id = 'startReplacementSnapGuide';
    guide.setAttribute('aria-hidden', 'true');
    guide.dataset.snapped = '0';
    guide.hidden = true;
    Object.assign(guide.style, {
      position: 'fixed',
      zIndex: '19',
      width: '18px',
      height: '18px',
      marginLeft: '-9px',
      marginTop: '-9px',
      border: '3px solid #35d39a',
      borderRadius: '50%',
      boxShadow: '0 0 0 4px rgba(53,211,154,.22), 0 0 14px rgba(53,211,154,.8)',
      background: 'rgba(17,27,36,.86)',
      pointerEvents: 'none'
    });
    documentRef.body.appendChild(guide);

    let debug = null;
    let activeProposal = null;
    let attachAttempts = 0;

    const clearGuide = () => {
      activeProposal = null;
      guide.hidden = true;
      guide.dataset.snapped = '0';
      guide.dataset.targetPartId = '';
      guide.dataset.targetConnectorId = '';
      guide.dataset.startConnectorId = '';
    };

    const drawGuide = (proposal, runtime) => {
      const rect = canvas.getBoundingClientRect();
      const scale = finite(runtime?.view?.scale, 1);
      const offsetX = finite(runtime?.view?.offsetX);
      const offsetY = finite(runtime?.view?.offsetY);
      guide.style.left = `${rect.left + proposal.target.x * scale + offsetX}px`;
      guide.style.top = `${rect.top + proposal.target.y * scale + offsetY}px`;
      guide.hidden = false;
      guide.dataset.snapped = '1';
      guide.dataset.targetPartId = String(proposal.target.partId);
      guide.dataset.targetConnectorId = String(proposal.target.connectorId);
      guide.dataset.startConnectorId = String(proposal.localConnector.id);
    };

    const refreshSnap = () => {
      if (!debug) return null;
      let layout;
      let runtime;
      try {
        layout = debug.getState();
        runtime = debug.getRuntimeState();
      } catch (_) {
        clearGuide();
        return null;
      }
      const proposal = createStartReplacementSnapProposal(layout, runtime, catalog, graph);
      if (!proposal) {
        clearGuide();
        return null;
      }
      activeProposal = proposal;
      try {
        if (Math.abs(finite(runtime.cursor?.x) - proposal.pose.x) > 1e-7
          || Math.abs(finite(runtime.cursor?.y) - proposal.pose.y) > 1e-7) {
          debug.setCursor(proposal.pose.x, proposal.pose.y);
        }
        if (Math.abs(finite(layout.rotation) - proposal.pose.rotation) > 1e-7) {
          debug.setRotation(proposal.pose.rotation);
        }
      } catch (_) {
        clearGuide();
        return null;
      }
      drawGuide(proposal, runtime);
      return proposal;
    };

    const commitConnectionAfterAppPlacement = () => {
      const proposal = activeProposal;
      clearGuide();
      if (!proposal || !debug) return;
      let layout;
      try { layout = debug.getState(); } catch (_) { return; }
      if (!layout?.start) return;

      // app.js has already made one history snapshot and placed Start using the
      // snapped cursor/rotation. Add only the graph edge without another snapshot,
      // so one Undo restores the exact pre-replacement state.
      const connected = addStartConnection(layout, proposal, graph);
      try { debug.loadState(connected); } catch (_) { return; }

      // Keep the next straight ghost close to Start's remaining free connector.
      // This preserves the familiar continuation affordance after Start placement.
      try {
        const restored = debug.getState();
        const open = otherStartEndpoint(restored.start, proposal, catalog, graph);
        if (open) {
          debug.setCursor(open.x, open.y);
          debug.setRotation(open.directionDeg ?? open.heading ?? restored.start.rotation);
        }
      } catch (_) {}
    };

    const wire = debugHandle => {
      debug = debugHandle;
      canvas.addEventListener('pointermove', event => {
        if (event.target !== canvas) return;
        refreshSnap();
      });
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target !== canvas) return;
        refreshSnap();
      });
      canvas.addEventListener('pointerup', event => {
        if (event.button !== 0 || event.target !== canvas) return;
        commitConnectionAfterAppPlacement();
      });
      canvas.addEventListener('pointercancel', clearGuide);
      canvas.addEventListener('pointerleave', () => {
        if (!debug) return clearGuide();
        try {
          if (!debug.getRuntimeState()?.mode || debug.getRuntimeState().mode !== 'start') clearGuide();
        } catch (_) { clearGuide(); }
      });
    };

    const attach = () => {
      const handle = rootRef.__mini4wdCourseDebug;
      if (handle && typeof handle.getState === 'function'
        && typeof handle.getRuntimeState === 'function'
        && typeof handle.setCursor === 'function'
        && typeof handle.setRotation === 'function'
        && typeof handle.loadState === 'function') {
        wire(handle);
        return;
      }
      attachAttempts += 1;
      if (attachAttempts < 50 && rootRef.setTimeout) rootRef.setTimeout(attach, 0);
    };

    if (rootRef.setTimeout) rootRef.setTimeout(attach, 0);
    else attach();
    return true;
  }

  return Object.freeze({
    FLAT_EPSILON_DEG,
    GROUND_EPSILON_MM,
    endpointKey,
    usedEndpointKeys,
    normalizeTarget,
    eligibleTargets,
    startReplacementEligible,
    createStartReplacementSnapProposal,
    addStartConnection,
    otherStartEndpoint,
    install
  });
});
