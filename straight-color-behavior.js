(function (root, factory) {
  'use strict';
  const graph = typeof module === 'object' && module.exports
    ? require('./layout-graph.js')
    : root?.M4WD_LAYOUT_GRAPH;
  const api = factory(graph);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_STRAIGHT_COLOR_BEHAVIOR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DEFAULT_GRAPH) {
  'use strict';

  const MODE_SLOPE_BY_COLOR = 'slope-by-color';
  const MODE_COLOR_ONLY = 'color-only';
  const DEFAULT_MODE = MODE_SLOPE_BY_COLOR;
  const UP_COLOR_KEY = 'red';
  const DOWN_COLOR_KEY = 'blue';

  function normalizeMode(value) {
    return value === MODE_COLOR_ONLY ? MODE_COLOR_ONLY : DEFAULT_MODE;
  }

  function clonePart(part) {
    if (!part) return part;
    return {
      ...part,
      endpointStates: Array.isArray(part.endpointStates)
        ? part.endpointStates.map(value => ({ ...value }))
        : part.endpointStates
    };
  }

  function endpointForPart(edge, partId) {
    if (!edge) return null;
    if (edge.partAId === partId) return { partId: edge.partAId, connectorId: edge.connectorAId };
    if (edge.partBId === partId) return { partId: edge.partBId, connectorId: edge.connectorBId };
    return null;
  }

  function otherEndpoint(edge, partId) {
    if (!edge) return null;
    if (edge.partAId === partId) return { partId: edge.partBId, connectorId: edge.connectorBId };
    if (edge.partBId === partId) return { partId: edge.partAId, connectorId: edge.connectorAId };
    return null;
  }

  function edgesAtConnector(edges, partId, connectorId) {
    return (Array.isArray(edges) ? edges : []).filter(edge => {
      const endpoint = endpointForPart(edge, partId);
      return endpoint?.connectorId === connectorId;
    });
  }

  function connectorsForPart(part, catalog, graph) {
    return graph.connectorsForDefinition(catalog?.[part?.type] || {});
  }

  function startExitConnectorId(start, catalog, graph) {
    if (!start) return null;
    const connectors = connectorsForPart({ ...start, type: 'start' }, catalog, graph);
    return connectors.find(connector => connector.connectorRole === 'exit')?.id
      || connectors[connectors.length - 1]?.id
      || null;
  }

  function resolveTravelEntryConnector({
    start,
    parts,
    edges,
    catalog,
    targetPartId,
    graphValue = DEFAULT_GRAPH
  } = {}) {
    const graph = graphValue;
    if (!graph || !start || !targetPartId || typeof graph.dedupeEdges !== 'function') {
      return { status: 'unresolved', connectorId: null };
    }

    const normalizedEdges = graph.dedupeEdges(edges);
    const partsById = new Map([
      ['start', { ...start, id: 'start', type: 'start' }],
      ...(Array.isArray(parts) ? parts : []).map(part => [String(part.id), part])
    ]);
    const exitId = startExitConnectorId(start, catalog, graph);
    if (!exitId) return { status: 'unresolved', connectorId: null };

    const queue = [];
    for (const edge of edgesAtConnector(normalizedEdges, 'start', exitId)) {
      const next = otherEndpoint(edge, 'start');
      if (next?.partId && next.partId !== 'start') {
        queue.push({ partId: next.partId, incomingConnectorId: next.connectorId });
      }
    }

    const visited = new Set();
    const matches = new Set();
    while (queue.length) {
      const current = queue.shift();
      const stateKey = `${current.partId}\u0000${current.incomingConnectorId}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      if (current.partId === String(targetPartId)) {
        matches.add(current.incomingConnectorId);
        continue;
      }

      const part = partsById.get(current.partId);
      if (!part) continue;
      const connectors = connectorsForPart(part, catalog, graph);
      if (connectors.length !== 2) continue;
      const incomingIndex = connectors.findIndex(connector => connector.id === current.incomingConnectorId);
      if (incomingIndex < 0) continue;
      const outgoingConnectorId = connectors[incomingIndex === 0 ? 1 : 0].id;

      for (const edge of edgesAtConnector(normalizedEdges, current.partId, outgoingConnectorId)) {
        const next = otherEndpoint(edge, current.partId);
        if (!next?.partId || next.partId === 'start') continue;
        queue.push({ partId: next.partId, incomingConnectorId: next.connectorId });
      }
    }

    if (matches.size === 1) return { status: 'resolved', connectorId: [...matches][0] };
    if (matches.size > 1) return { status: 'ambiguous', connectorId: null };
    return { status: 'disconnected', connectorId: null };
  }

  function minimumLocalZ(part, catalog, graph) {
    const connectors = connectorsForPart(part, catalog, graph);
    if (!connectors.length) return 0;
    return Math.min(...connectors.map(connector => Number(connector.localZMm) || 0));
  }

  function isBankedPart(part) {
    if (!part) return false;
    if (Math.abs(Number(part.bankAngleDeg) || 0) > 0.01) return true;
    if (Math.abs(Number(part.bankAngle) || 0) > 0.01) return true;
    return Array.isArray(part.endpointStates)
      && part.endpointStates.some(value => Math.abs(Number(value?.bankAngle) || 0) > 0.01);
  }

  function remapPartConnector(edge, partId, connectorMap) {
    const next = { ...edge };
    if (next.partAId === partId && connectorMap.has(next.connectorAId)) {
      next.connectorAId = connectorMap.get(next.connectorAId);
    }
    if (next.partBId === partId && connectorMap.has(next.connectorBId)) {
      next.connectorBId = connectorMap.get(next.connectorBId);
    }
    return next;
  }

  function applyColorRequests({
    start,
    parts,
    edges,
    catalog,
    requests,
    mode = DEFAULT_MODE,
    graphValue = DEFAULT_GRAPH
  } = {}) {
    const graph = graphValue;
    const normalizedMode = normalizeMode(mode);
    const nextStart = start ? clonePart({ ...start, id: 'start', type: 'start' }) : null;
    const nextParts = (Array.isArray(parts) ? parts : []).map(clonePart);
    let nextEdges = graph?.dedupeEdges ? graph.dedupeEdges(edges).map(edge => ({ ...edge })) : [];
    const changes = [];
    const blocked = [];
    const partsById = new Map(nextParts.map(part => [String(part.id), part]));
    if (nextStart) partsById.set('start', nextStart);

    const requestList = Array.isArray(requests) ? requests : [];
    for (const request of requestList) {
      const partId = String(request?.partId || '');
      const colorKey = String(request?.colorKey || '');
      const part = partsById.get(partId);
      if (!part || !colorKey) continue;

      const wantsSlope = normalizedMode === MODE_SLOPE_BY_COLOR
        && part.type === 'straight'
        && (colorKey === UP_COLOR_KEY || colorKey === DOWN_COLOR_KEY);

      if (!wantsSlope) {
        if (part.colorKey !== colorKey) {
          const previousColorKey = part.colorKey || 'default';
          part.colorKey = colorKey;
          changes.push({ kind: 'color', partId, previousColorKey, colorKey });
        }
        continue;
      }

      if (!graph || typeof graph.connectorsForDefinition !== 'function'
          || typeof graph.connectedComponent !== 'function'
          || typeof graph.removeEdgesForParts !== 'function') {
        blocked.push({ partId, colorKey, reason: 'graph-unavailable' });
        continue;
      }
      if (isBankedPart(part)) {
        blocked.push({ partId, colorKey, reason: 'banked-straight' });
        continue;
      }

      const travel = resolveTravelEntryConnector({
        start: nextStart,
        parts: nextParts,
        edges: nextEdges,
        catalog,
        targetPartId: partId,
        graphValue: graph
      });
      if (travel.status !== 'resolved') {
        blocked.push({ partId, colorKey, reason: `direction-${travel.status}` });
        continue;
      }

      const straightConnectors = graph.connectorsForDefinition(catalog?.straight || {});
      const slopeConnectors = graph.connectorsForDefinition(catalog?.slope || {});
      if (straightConnectors.length !== 2 || slopeConnectors.length !== 2) {
        blocked.push({ partId, colorKey, reason: 'unsupported-connectors' });
        continue;
      }

      const incomingIndex = straightConnectors.findIndex(connector => connector.id === travel.connectorId);
      if (incomingIndex < 0) {
        blocked.push({ partId, colorKey, reason: 'incoming-connector-missing' });
        continue;
      }

      const localZValues = slopeConnectors.map(connector => Number(connector.localZMm) || 0);
      const lowIndex = localZValues[0] <= localZValues[1] ? 0 : 1;
      const highIndex = lowIndex === 0 ? 1 : 0;
      if (Math.abs(localZValues[highIndex] - localZValues[lowIndex]) < 0.01) {
        blocked.push({ partId, colorKey, reason: 'slope-height-missing' });
        continue;
      }

      const direction = colorKey === UP_COLOR_KEY ? 'up' : 'down';
      const desiredEntryIndex = direction === 'up' ? lowIndex : highIndex;
      const desiredExitIndex = desiredEntryIndex === 0 ? 1 : 0;
      const outgoingIndex = incomingIndex === 0 ? 1 : 0;
      const incomingConnectorId = straightConnectors[incomingIndex].id;
      const outgoingConnectorId = straightConnectors[outgoingIndex].id;
      const heightDeltaMm = Math.abs(localZValues[highIndex] - localZValues[lowIndex]);
      const downstreamDeltaMm = direction === 'up' ? heightDeltaMm : -heightDeltaMm;
      const nextBaseZMm = (Number(part.zMm) || 0) + (direction === 'down' ? -heightDeltaMm : 0);

      if (nextBaseZMm + Math.min(...localZValues) < -0.01) {
        blocked.push({ partId, colorKey, reason: 'below-floor' });
        continue;
      }

      const outgoingEdges = edgesAtConnector(nextEdges, partId, outgoingConnectorId);
      const edgesWithoutTarget = graph.removeEdgesForParts(nextEdges, [partId]);
      const downstreamIds = new Set();
      let downstreamInvalid = false;

      for (const edge of outgoingEdges) {
        const neighbor = otherEndpoint(edge, partId);
        if (!neighbor?.partId) continue;
        if (neighbor.partId === 'start') {
          downstreamInvalid = true;
          break;
        }
        for (const id of graph.connectedComponent([neighbor.partId], edgesWithoutTarget)) {
          if (id === 'start') {
            downstreamInvalid = true;
            break;
          }
          downstreamIds.add(String(id));
        }
        if (downstreamInvalid) break;
      }

      if (downstreamInvalid) {
        blocked.push({ partId, colorKey, reason: 'downstream-rejoins-start' });
        continue;
      }

      for (const id of downstreamIds) {
        const downstream = partsById.get(id);
        if (!downstream || downstream.id === 'start') {
          downstreamInvalid = true;
          break;
        }
        const nextZ = (Number(downstream.zMm) || 0) + downstreamDeltaMm;
        if (nextZ + minimumLocalZ(downstream, catalog, graph) < -0.01) {
          downstreamInvalid = true;
          break;
        }
      }

      if (downstreamInvalid) {
        blocked.push({ partId, colorKey, reason: 'downstream-below-floor' });
        continue;
      }

      const flip = incomingIndex !== desiredEntryIndex;
      const connectorMap = new Map();
      for (let oldIndex = 0; oldIndex < straightConnectors.length; oldIndex += 1) {
        const newIndex = flip ? 1 - oldIndex : oldIndex;
        connectorMap.set(straightConnectors[oldIndex].id, slopeConnectors[newIndex].id);
      }

      for (const id of downstreamIds) {
        const downstream = partsById.get(id);
        downstream.zMm = (Number(downstream.zMm) || 0) + downstreamDeltaMm;
      }

      const previousRotation = Number(part.rotation) || 0;
      const previousZMm = Number(part.zMm) || 0;
      part.type = 'slope';
      part.rotation = ((previousRotation + (flip ? 180 : 0)) % 360 + 360) % 360;
      part.routeIndex = desiredEntryIndex;
      part.entryConnectorId = slopeConnectors[desiredEntryIndex].id;
      part.zMm = nextBaseZMm;
      part.pitchDeg = 0;
      part.bankAngleDeg = 0;
      part.bankAngle = 0;
      part.bankRole = null;
      part.bankSectionId = null;
      part.endpointStates = undefined;
      part.colorKey = 'default';

      nextEdges = graph.dedupeEdges(nextEdges.map(edge => remapPartConnector(edge, partId, connectorMap)));
      changes.push({
        kind: 'slope',
        partId,
        requestedColorKey: colorKey,
        direction,
        incomingConnectorId,
        slopeEntryConnectorId: slopeConnectors[desiredEntryIndex].id,
        slopeExitConnectorId: slopeConnectors[desiredExitIndex].id,
        flipped: flip,
        previousRotation,
        rotation: part.rotation,
        previousZMm,
        zMm: part.zMm,
        downstreamDeltaMm,
        shiftedPartIds: [...downstreamIds]
      });
    }

    return {
      mode: normalizedMode,
      start: nextStart,
      parts: nextParts,
      edges: nextEdges,
      changed: changes.length > 0,
      changes,
      blocked
    };
  }

  return Object.freeze({
    MODE_SLOPE_BY_COLOR,
    MODE_COLOR_ONLY,
    DEFAULT_MODE,
    UP_COLOR_KEY,
    DOWN_COLOR_KEY,
    normalizeMode,
    resolveTravelEntryConnector,
    applyColorRequests
  });
});
