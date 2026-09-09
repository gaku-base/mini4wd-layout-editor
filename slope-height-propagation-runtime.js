(function (root, factory) {
  'use strict';
  const graph = typeof module === 'object' && module.exports
    ? require('./layout-graph.js')
    : root?.M4WD_LAYOUT_GRAPH;
  const api = factory(graph);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.M4WD_SLOPE_HEIGHT_PROPAGATION_RUNTIME = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DEFAULT_GRAPH) {
  'use strict';

  const WRAP_MARKER = '__m4wdSlopeHeightPropagationRuntimeWrapped';

  function connectorKey(graph, connector) {
    return graph.endpointKey(connector.partId, connector.connectorId);
  }

  function componentSet(graph, seedId, edges) {
    return new Set(graph.connectedComponent([seedId], edges));
  }

  function canShiftComponent(partsById, ids, deltaMm, catalog, graph) {
    const epsilon = Number(graph.Z_EPSILON_MM) || 0.01;
    for (const id of ids) {
      if (id === 'start') return false;
      const part = partsById.get(id);
      if (!part) return false;
      const definition = catalog?.[part.type];
      if (!definition) return false;
      const localConnectors = graph.connectorsForDefinition(definition);
      const minLocalZ = localConnectors.length
        ? Math.min(...localConnectors.map(connector => Number(connector.localZMm) || 0))
        : 0;
      const nextBaseZ = (Number(part.zMm) || 0) + deltaMm;
      if (nextBaseZ + minLocalZ < -epsilon) return false;
    }
    return true;
  }

  function candidateForFreeSlopeEnd({ slope, freeConnector, parts, catalog, edges, graph, usage, allConnectors, slopeComponent }) {
    const levelHeight = Number(graph.LEVEL_HEIGHT_MM) || 115;
    const xyEpsilon = Number(graph.XY_EPSILON_CM) || 1.75;
    const zEpsilon = Number(graph.Z_EPSILON_MM) || 0.01;
    const candidates = [];

    for (const candidate of allConnectors) {
      if (candidate.partId === slope.id || slopeComponent.has(candidate.partId)) continue;
      if ((usage.get(connectorKey(graph, candidate)) || 0) !== 0) continue;
      if (Math.hypot(candidate.x - freeConnector.x, candidate.y - freeConnector.y) > xyEpsilon) continue;
      if (!graph.connectorCompatible(freeConnector, candidate)) continue;

      const deltaMm = (Number(freeConnector.zMm) || 0) - (Number(candidate.zMm) || 0);
      if (Math.abs(Math.abs(deltaMm) - levelHeight) > zEpsilon) continue;

      const candidateComponent = componentSet(graph, candidate.partId, edges);
      if (candidateComponent.has('start')) continue;
      candidates.push({ candidate, candidateComponent, deltaMm });
    }

    return candidates.length === 1 ? candidates[0] : null;
  }

  function reconcileRetrofitSlopeHeights(partsValue, catalogValue, edgesValue, graphValue = DEFAULT_GRAPH) {
    const graph = graphValue;
    const parts = Array.isArray(partsValue) ? partsValue : [];
    const catalog = catalogValue || {};
    const edges = Array.isArray(edgesValue) ? edgesValue : null;
    const diagnostics = { changed: false, adjustments: [], skippedAmbiguous: 0 };
    if (!graph || !edges || !parts.length) return diagnostics;
    if (typeof graph.allWorldConnectors !== 'function'
        || typeof graph.connectorUsage !== 'function'
        || typeof graph.connectedComponent !== 'function'
        || typeof graph.connectorCompatible !== 'function'
        || typeof graph.addEdge !== 'function') return diagnostics;

    const partsById = new Map(parts.map(part => [String(part.id), part]));
    const maxPasses = Math.max(1, parts.length * 2);

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const normalizedEdges = graph.dedupeEdges(edges);
      const usage = graph.connectorUsage(normalizedEdges);
      const allConnectors = graph.allWorldConnectors(parts, catalog);
      let applied = false;

      for (const slope of parts) {
        if (!slope || !catalog?.[slope.type]?.slope) continue;
        const slopeComponent = componentSet(graph, String(slope.id), normalizedEdges);
        if (!slopeComponent.has('start')) continue;

        const slopeConnectors = allConnectors.filter(connector => connector.partId === String(slope.id));
        if (slopeConnectors.length !== 2) continue;
        const used = slopeConnectors.filter(connector => (usage.get(connectorKey(graph, connector)) || 0) === 1);
        const free = slopeConnectors.filter(connector => (usage.get(connectorKey(graph, connector)) || 0) === 0);
        if (used.length !== 1 || free.length !== 1) continue;

        const match = candidateForFreeSlopeEnd({
          slope,
          freeConnector: free[0],
          parts,
          catalog,
          edges: normalizedEdges,
          graph,
          usage,
          allConnectors,
          slopeComponent
        });
        if (!match) {
          const possibleAtPoint = allConnectors.filter(candidate => candidate.partId !== String(slope.id)
            && !slopeComponent.has(candidate.partId)
            && (usage.get(connectorKey(graph, candidate)) || 0) === 0
            && Math.hypot(candidate.x - free[0].x, candidate.y - free[0].y) <= (Number(graph.XY_EPSILON_CM) || 1.75));
          if (possibleAtPoint.length > 1) diagnostics.skippedAmbiguous += 1;
          continue;
        }

        const shiftIds = [...match.candidateComponent];
        if (!shiftIds.length || !canShiftComponent(partsById, shiftIds, match.deltaMm, catalog, graph)) continue;

        for (const id of shiftIds) {
          const part = partsById.get(id);
          part.zMm = (Number(part.zMm) || 0) + match.deltaMm;
        }

        const nextEdges = graph.addEdge(normalizedEdges, {
          partAId: String(slope.id),
          connectorAId: free[0].connectorId,
          partBId: match.candidate.partId,
          connectorBId: match.candidate.connectorId,
          createdOrder: normalizedEdges.length + 1
        });
        edges.splice(0, edges.length, ...nextEdges);
        diagnostics.changed = true;
        diagnostics.adjustments.push({
          slopeId: String(slope.id),
          connectorId: free[0].connectorId,
          targetPartId: match.candidate.partId,
          targetConnectorId: match.candidate.connectorId,
          deltaMm: match.deltaMm,
          shiftedPartIds: shiftIds
        });
        applied = true;
        break;
      }

      if (!applied) break;
    }

    return diagnostics;
  }

  function install(rootValue) {
    const root = rootValue || (typeof globalThis !== 'undefined' ? globalThis : null);
    const graph = root?.M4WD_LAYOUT_GRAPH;
    if (!root || !graph || typeof graph.validateEdges !== 'function') return false;
    if (graph[WRAP_MARKER] === true) return true;

    const originalValidateEdges = graph.validateEdges;
    function validateEdgesWithSlopeHeightPropagation(parts, catalog, edges) {
      reconcileRetrofitSlopeHeights(parts, catalog, edges, graph);
      return originalValidateEdges(parts, catalog, edges);
    }

    root.M4WD_LAYOUT_GRAPH = Object.freeze({
      ...graph,
      [WRAP_MARKER]: true,
      validateEdges: validateEdgesWithSlopeHeightPropagation
    });
    return true;
  }

  return Object.freeze({
    WRAP_MARKER,
    reconcileRetrofitSlopeHeights,
    install
  });
});
