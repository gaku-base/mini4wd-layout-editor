(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_STRAIGHT_COLOR_BEHAVIOR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODE_SLOPE_BY_COLOR = 'slope-by-color';
  const MODE_COLOR_ONLY = 'color-only';
  const ROLE_UP = 'up';
  const ROLE_DOWN = 'down';
  const Z_EPSILON_MM = 0.01;

  function normalizeMode(value) {
    return value === MODE_COLOR_ONLY ? MODE_COLOR_ONLY : MODE_SLOPE_BY_COLOR;
  }

  function endpointKey(partId, connectorId) {
    return `${String(partId)}\u0000${String(connectorId)}`;
  }

  function connectorMapForPart(part, catalog, graph) {
    const definition = catalog?.[part?.type];
    if (!definition || !graph?.connectorsForDefinition) return new Map();
    return new Map(graph.connectorsForDefinition(definition).map(connector => [String(connector.id), connector]));
  }

  function startExitConnector(start, catalog, graph) {
    const definition = catalog?.start;
    if (!start || !definition || !graph?.connectorsForDefinition) return null;
    const connectors = graph.connectorsForDefinition(definition);
    return connectors.find(connector => connector.connectorRole === 'exit')
      || connectors.find(connector => connector.id === 'b')
      || connectors[1]
      || connectors[0]
      || null;
  }

  function entryConnectorFromStart({ targetPartId, start, parts, edges, catalog, graph }) {
    if (!start || !targetPartId || !graph?.connectorsForDefinition) return { status: 'unresolved', reason: 'missing-start' };
    const target = (parts || []).find(part => String(part.id) === String(targetPartId));
    if (!target) return { status: 'unresolved', reason: 'missing-target' };

    const allParts = [{ ...start, id: 'start', type: 'start' }, ...(parts || [])];
    const adjacency = new Map();
    const addLink = (left, right) => {
      if (!adjacency.has(left)) adjacency.set(left, new Set());
      adjacency.get(left).add(right);
    };

    for (const edge of Array.isArray(edges) ? edges : []) {
      const a = endpointKey(edge.partAId, edge.connectorAId);
      const b = endpointKey(edge.partBId, edge.connectorBId);
      addLink(a, b);
      addLink(b, a);
    }

    for (const part of allParts) {
      if (String(part.id) === 'start') continue;
      const connectors = graph.connectorsForDefinition(catalog?.[part.type]);
      if (connectors.length !== 2) continue;
      const a = endpointKey(part.id, connectors[0].id);
      const b = endpointKey(part.id, connectors[1].id);
      addLink(a, b);
      addLink(b, a);
    }

    const exit = startExitConnector(start, catalog, graph);
    if (!exit) return { status: 'unresolved', reason: 'missing-start-exit' };
    const source = endpointKey('start', exit.id);
    const distances = new Map([[source, 0]]);
    const queue = [source];

    while (queue.length) {
      const current = queue.shift();
      const nextDistance = distances.get(current) + 1;
      for (const next of adjacency.get(current) || []) {
        if (distances.has(next)) continue;
        distances.set(next, nextDistance);
        queue.push(next);
      }
    }

    const targetConnectors = graph.connectorsForDefinition(catalog?.[target.type]);
    const reached = targetConnectors
      .map(connector => ({ connectorId: String(connector.id), distance: distances.get(endpointKey(target.id, connector.id)) }))
      .filter(item => Number.isFinite(item.distance))
      .sort((left, right) => left.distance - right.distance || left.connectorId.localeCompare(right.connectorId));

    if (!reached.length) return { status: 'unresolved', reason: 'not-connected-to-start' };
    if (reached.length > 1 && reached[0].distance === reached[1].distance) {
      return { status: 'unresolved', reason: 'ambiguous-direction', candidates: reached };
    }
    return { status: 'resolved', connectorId: reached[0].connectorId, distance: reached[0].distance };
  }

  function normalizeAngle(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function rotationDeltaForConnectors(fromConnector, toConnector) {
    const fromAngle = Math.atan2(Number(fromConnector?.localY) || 0, Number(fromConnector?.localX) || 0) * 180 / Math.PI;
    const toAngle = Math.atan2(Number(toConnector?.localY) || 0, Number(toConnector?.localX) || 0) * 180 / Math.PI;
    return normalizeAngle(fromAngle - toAngle);
  }

  function rotateLocal(point, degrees) {
    const radians = normalizeAngle(degrees) * Math.PI / 180;
    return {
      x: (Number(point?.localX) || 0) * Math.cos(radians) - (Number(point?.localY) || 0) * Math.sin(radians),
      y: (Number(point?.localX) || 0) * Math.sin(radians) + (Number(point?.localY) || 0) * Math.cos(radians)
    };
  }

  function connectorMapping(currentConnectors, nextConnectors, rotationDelta) {
    const remaining = new Set(nextConnectors.map(connector => String(connector.id)));
    const mapping = new Map();
    for (const current of currentConnectors) {
      let best = null;
      for (const next of nextConnectors) {
        if (!remaining.has(String(next.id))) continue;
        const rotated = rotateLocal(next, rotationDelta);
        const distance = Math.hypot(
          rotated.x - (Number(current.localX) || 0),
          rotated.y - (Number(current.localY) || 0)
        );
        if (!best || distance < best.distance) best = { id: String(next.id), distance };
      }
      if (!best || best.distance > 0.001) return null;
      mapping.set(String(current.id), best.id);
      remaining.delete(best.id);
    }
    return mapping;
  }

  function remapEdges(edges, partId, mapping) {
    return (Array.isArray(edges) ? edges : []).map(edge => ({
      ...edge,
      connectorAId: String(edge.partAId) === String(partId)
        ? (mapping.get(String(edge.connectorAId)) || String(edge.connectorAId))
        : edge.connectorAId,
      connectorBId: String(edge.partBId) === String(partId)
        ? (mapping.get(String(edge.connectorBId)) || String(edge.connectorBId))
        : edge.connectorBId
    }));
  }

  function transformPartDefinition({ part, nextType, desiredEntryConnectorId, start, parts, catalog, graph, edges }) {
    const currentDefinition = catalog?.[part?.type];
    const nextDefinition = catalog?.[nextType];
    if (!currentDefinition || !nextDefinition) return { status: 'blocked', reason: 'missing-definition' };

    const currentConnectors = graph.connectorsForDefinition(currentDefinition);
    const nextConnectors = graph.connectorsForDefinition(nextDefinition);
    if (currentConnectors.length !== 2 || nextConnectors.length !== 2) return { status: 'blocked', reason: 'unsupported-connectors' };

    const direction = entryConnectorFromStart({
      targetPartId: part.id,
      start,
      parts,
      edges,
      catalog,
      graph
    });
    if (direction.status !== 'resolved') return { status: 'blocked', reason: direction.reason };

    const currentEntry = currentConnectors.find(connector => String(connector.id) === String(direction.connectorId));
    const desiredEntry = nextConnectors.find(connector => String(connector.id) === String(desiredEntryConnectorId));
    if (!currentEntry || !desiredEntry) return { status: 'blocked', reason: 'missing-entry-connector' };

    const rotationDelta = rotationDeltaForConnectors(currentEntry, desiredEntry);
    const mapping = connectorMapping(currentConnectors, nextConnectors, rotationDelta);
    if (!mapping) return { status: 'blocked', reason: 'geometry-mismatch' };

    const transformed = {
      ...part,
      type: nextType,
      rotation: normalizeAngle((Number(part.rotation) || 0) + rotationDelta),
      entryConnectorId: String(desiredEntry.id),
      routeIndex: nextConnectors.findIndex(connector => String(connector.id) === String(desiredEntry.id))
    };

    return {
      status: 'changed',
      part: transformed,
      edges: remapEdges(edges, part.id, mapping),
      oldEntryConnectorId: String(direction.connectorId),
      newEntryConnectorId: String(desiredEntry.id),
      connectorMapping: Object.fromEntries(mapping)
    };
  }

  function connectorById(part, connectorId, catalog, graph) {
    return connectorMapForPart(part, catalog, graph).get(String(connectorId)) || null;
  }

  function solveHeightsFromStart({ start, parts, edges, catalog, graph }) {
    if (!start) return { status: 'unchanged', parts: (parts || []).map(part => ({ ...part })), conflicts: [] };
    const cloned = (parts || []).map(part => ({ ...part }));
    const byId = new Map([['start', { ...start, id: 'start', type: 'start' }], ...cloned.map(part => [String(part.id), part])]);
    const incident = new Map();
    const addIncident = (partId, record) => {
      const key = String(partId);
      if (!incident.has(key)) incident.set(key, []);
      incident.get(key).push(record);
    };

    for (const edge of Array.isArray(edges) ? edges : []) {
      addIncident(edge.partAId, {
        connectorId: String(edge.connectorAId),
        otherPartId: String(edge.partBId),
        otherConnectorId: String(edge.connectorBId)
      });
      addIncident(edge.partBId, {
        connectorId: String(edge.connectorBId),
        otherPartId: String(edge.partAId),
        otherConnectorId: String(edge.connectorAId)
      });
    }

    const assigned = new Map([['start', Number(start.zMm) || 0]]);
    const queue = ['start'];
    const conflicts = [];
    const startExit = startExitConnector(start, catalog, graph);
    const startExitId = startExit ? String(startExit.id) : null;

    while (queue.length) {
      const partId = queue.shift();
      const part = byId.get(partId);
      const partZ = assigned.get(partId);
      if (!part) continue;

      const links = (incident.get(partId) || []).filter(link => partId !== 'start' || !startExitId || link.connectorId === startExitId);
      for (const link of links) {
        const other = byId.get(link.otherPartId);
        if (!other) continue;
        const local = connectorById(part, link.connectorId, catalog, graph);
        const otherLocal = connectorById(other, link.otherConnectorId, catalog, graph);
        if (!local || !otherLocal) continue;
        const nextZ = partZ + (Number(local.localZMm) || 0) - (Number(otherLocal.localZMm) || 0);

        if (!assigned.has(link.otherPartId)) {
          assigned.set(link.otherPartId, nextZ);
          queue.push(link.otherPartId);
        } else if (Math.abs(assigned.get(link.otherPartId) - nextZ) > Z_EPSILON_MM) {
          conflicts.push({
            partId,
            connectorId: link.connectorId,
            otherPartId: link.otherPartId,
            otherConnectorId: link.otherConnectorId,
            expectedZMm: assigned.get(link.otherPartId),
            proposedZMm: nextZ
          });
        }
      }
    }

    for (const [partId, baseZ] of assigned) {
      if (partId === 'start') continue;
      const part = byId.get(partId);
      const connectors = graph.connectorsForDefinition(catalog?.[part?.type]);
      const minLocal = connectors.length ? Math.min(...connectors.map(connector => Number(connector.localZMm) || 0)) : 0;
      if (baseZ + minLocal < -Z_EPSILON_MM) {
        return { status: 'blocked', reason: 'below-ground', parts: (parts || []).map(value => ({ ...value })), conflicts };
      }
    }

    for (const part of cloned) {
      if (assigned.has(String(part.id))) part.zMm = assigned.get(String(part.id));
    }
    return { status: 'solved', parts: cloned, conflicts };
  }

  function desiredSlopeEntry(catalog, graph, role) {
    const connectors = graph.connectorsForDefinition(catalog?.slope);
    if (connectors.length !== 2) return null;
    const ordered = [...connectors].sort((left, right) => (Number(left.localZMm) || 0) - (Number(right.localZMm) || 0));
    return role === ROLE_DOWN ? ordered[ordered.length - 1] : ordered[0];
  }

  function applyColorChange({ mode, partId, nextColorKey, start, parts, edges, catalog, graph }) {
    const normalizedMode = normalizeMode(mode);
    const currentParts = (parts || []).map(part => ({ ...part }));
    const index = currentParts.findIndex(part => String(part.id) === String(partId));
    if (index < 0) return { status: 'blocked', reason: 'missing-target', parts: currentParts, edges: [...(edges || [])] };

    const target = currentParts[index];
    const nextColor = String(nextColorKey || 'default');

    if (normalizedMode === MODE_COLOR_ONLY) {
      currentParts[index] = { ...target, colorKey: nextColor };
      return { status: 'colored', parts: currentParts, edges: [...(edges || [])], semanticChange: false };
    }

    const semanticRole = nextColor === 'red' ? ROLE_UP : nextColor === 'blue' ? ROLE_DOWN : null;
    if (!semanticRole) {
      currentParts[index] = { ...target, colorKey: nextColor };
      return { status: 'colored', parts: currentParts, edges: [...(edges || [])], semanticChange: false };
    }

    const canCreateSlope = target.type === 'straight';
    const canReorientSemanticSlope = target.type === 'slope' && ['red', 'blue'].includes(String(target.colorKey || ''));
    if (!canCreateSlope && !canReorientSemanticSlope) {
      currentParts[index] = { ...target, colorKey: nextColor };
      return { status: 'colored', parts: currentParts, edges: [...(edges || [])], semanticChange: false };
    }

    const entry = desiredSlopeEntry(catalog, graph, semanticRole);
    if (!entry) return { status: 'blocked', reason: 'missing-slope-entry', parts: currentParts, edges: [...(edges || [])] };

    const transformed = transformPartDefinition({
      part: target,
      nextType: 'slope',
      desiredEntryConnectorId: entry.id,
      start,
      parts: currentParts,
      edges,
      catalog,
      graph
    });
    if (transformed.status !== 'changed') return { ...transformed, parts: currentParts, edges: [...(edges || [])] };
    transformed.part.colorKey = nextColor;

    const nextParts = currentParts.map(part => String(part.id) === String(partId) ? transformed.part : part);
    const heightResult = solveHeightsFromStart({
      start,
      parts: nextParts,
      edges: transformed.edges,
      catalog,
      graph
    });
    if (heightResult.status === 'blocked') {
      return {
        status: 'blocked',
        reason: heightResult.reason,
        parts: currentParts,
        edges: [...(edges || [])],
        conflicts: heightResult.conflicts || []
      };
    }

    return {
      status: 'changed',
      parts: heightResult.parts,
      edges: transformed.edges,
      semanticChange: true,
      role: semanticRole,
      conflicts: heightResult.conflicts || [],
      connectorMapping: transformed.connectorMapping
    };
  }

  return Object.freeze({
    MODE_SLOPE_BY_COLOR,
    MODE_COLOR_ONLY,
    ROLE_UP,
    ROLE_DOWN,
    normalizeMode,
    entryConnectorFromStart,
    solveHeightsFromStart,
    applyColorChange
  });
});
