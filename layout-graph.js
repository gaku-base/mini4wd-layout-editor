(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_LAYOUT_GRAPH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEVEL_HEIGHT_MM = 115;
  const COURSE_BODY_HEIGHT_MM = 60;
  const SNAP_RADIUS_PX = 24;
  const XY_EPSILON_CM = 1.75;
  const ANGLE_EPSILON_DEG = 0.1;
  const Z_EPSILON_MM = 0.01;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeAngle(value) {
    return ((finite(value) % 360) + 360) % 360;
  }

  function angleDistance(left, right) {
    const distance = Math.abs(normalizeAngle(left) - normalizeAngle(right));
    return Math.min(distance, 360 - distance);
  }

  function rotate(point, degrees) {
    const radians = normalizeAngle(degrees) * Math.PI / 180;
    return {
      x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
      y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
    };
  }

  function connectorId(value, index) {
    return String(value?.id || (index === 0 ? 'a' : index === 1 ? 'b' : `c${index + 1}`));
  }

  function normalizeConnector(value, index = 0) {
    return {
      id: connectorId(value, index),
      label: String(value?.label || (index === 0 ? 'A' : index === 1 ? 'B' : `C${index + 1}`)),
      localX: finite(value?.localX ?? value?.x),
      localY: finite(value?.localY ?? value?.y),
      localZMm: finite(value?.localZMm),
      directionDeg: normalizeAngle(value?.directionDeg ?? value?.heading),
      pitchDeg: finite(value?.pitchDeg),
      bankAngleDeg: finite(value?.bankAngleDeg),
      bankTransitionToDeg: value?.bankTransitionToDeg == null ? null : finite(value.bankTransitionToDeg),
      shape: String(value?.shape || 'jcjc-3lane'),
      laneCount: Math.max(1, Math.trunc(finite(value?.laneCount, 3)))
    };
  }

  function connectorsForDefinition(definition) {
    const values = definition?.geometry?.connectors;
    if (Array.isArray(values) && values.length) return values.map((value, index) => normalizeConnector({ ...value, ...(definition.geometry.connectorMetadata?.[index] || {}) }, index));
    const width = finite(definition?.w ?? definition?.geometry?.width);
    return [
      normalizeConnector({ id: 'a', label: 'A', x: -width / 2, y: 0, heading: 180 }, 0),
      normalizeConnector({ id: 'b', label: 'B', x: width / 2, y: 0, heading: 0 }, 1)
    ];
  }

  function normalizePart(part, index = 0) {
    return {
      ...part,
      id: String(part.id),
      x: finite(part.x),
      y: finite(part.y),
      zMm: finite(part.zMm),
      rotation: normalizeAngle(part.rotation),
      pitchDeg: finite(part.pitchDeg ?? part.pitch),
      bankAngleDeg: finite(part.bankAngleDeg ?? part.bankAngle),
      zOrder: finite(part.zOrder ?? part.zIndex, index + 1)
    };
  }

  function mirroredConnector(connectorValue, mirrorY = false, index = 0) {
    const connector = normalizeConnector(connectorValue, index);
    if (!mirrorY) return connector;
    return {
      ...connector,
      localY: -connector.localY,
      directionDeg: normalizeAngle(-connector.directionDeg)
    };
  }

  function worldConnector(partValue, connectorValue, index = 0) {
    const part = normalizePart(partValue);
    const connector = mirroredConnector(connectorValue, Boolean(part.cornerMirror), index);
    const offset = rotate({ x: connector.localX, y: connector.localY }, part.rotation);
    return {
      ...connector,
      partId: part.id,
      partType: part.type,
      connectorId: connector.id,
      x: part.x + offset.x,
      y: part.y + offset.y,
      zMm: part.zMm + connector.localZMm,
      directionDeg: normalizeAngle(connector.directionDeg + part.rotation),
      pitchDeg: connector.pitchDeg + part.pitchDeg,
      bankAngleDeg: connector.bankAngleDeg + part.bankAngleDeg
    };
  }

  function allWorldConnectors(parts, catalog) {
    return parts.flatMap((part, partIndex) => connectorsForDefinition(catalog[part.type]).map((connector, connectorIndex) => ({
      ...worldConnector(normalizePart(part, partIndex), connector, connectorIndex),
      partIndex
    })));
  }

  function endpointKey(partId, connectorId) {
    return `${String(partId)}\u0000${String(connectorId)}`;
  }

  function compareEndpoint(left, right) {
    return endpointKey(left.partId, left.connectorId).localeCompare(endpointKey(right.partId, right.connectorId));
  }

  function normalizeEdge(edge, index = 0) {
    const a = { partId: String(edge.partAId ?? edge.a?.partId ?? ''), connectorId: String(edge.connectorAId ?? edge.a?.connectorId ?? '') };
    const b = { partId: String(edge.partBId ?? edge.b?.partId ?? ''), connectorId: String(edge.connectorBId ?? edge.b?.connectorId ?? '') };
    const ordered = compareEndpoint(a, b) <= 0 ? [a, b] : [b, a];
    return {
      partAId: ordered[0].partId,
      connectorAId: ordered[0].connectorId,
      partBId: ordered[1].partId,
      connectorBId: ordered[1].connectorId,
      createdOrder: finite(edge.createdOrder, index + 1)
    };
  }

  function edgeKey(edge) {
    const value = normalizeEdge(edge);
    return `${endpointKey(value.partAId, value.connectorAId)}\u0001${endpointKey(value.partBId, value.connectorBId)}`;
  }

  function dedupeEdges(edges) {
    const seen = new Set();
    const result = [];
    (Array.isArray(edges) ? edges : []).forEach((edge, index) => {
      const normalized = normalizeEdge(edge, index);
      if (!normalized.partAId || !normalized.connectorAId || !normalized.partBId || !normalized.connectorBId) return;
      const key = edgeKey(normalized);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    });
    return result;
  }

  function addEdge(edges, edge) {
    return dedupeEdges([...(Array.isArray(edges) ? edges : []), edge]);
  }

  function removeEdgesForParts(edges, partIds) {
    const removed = new Set(partIds);
    return dedupeEdges(edges).filter(edge => !removed.has(edge.partAId) && !removed.has(edge.partBId));
  }

  function connectorUsage(edges) {
    const usage = new Map();
    dedupeEdges(edges).forEach(edge => {
      [endpointKey(edge.partAId, edge.connectorAId), endpointKey(edge.partBId, edge.connectorBId)].forEach(key => {
        usage.set(key, (usage.get(key) || 0) + 1);
      });
    });
    return usage;
  }

  function duplicateConnectorWarnings(edges, connectors = []) {
    const byKey = new Map(connectors.map(item => [endpointKey(item.partId, item.connectorId), item]));
    return [...connectorUsage(edges)].filter(([, count]) => count > 1).map(([key, count]) => ({
      type: 'duplicate-connector', key, count, connector: byKey.get(key) || null
    }));
  }

  function connectedComponent(seedIds, edges) {
    const reached = new Set(seedIds);
    let changed = true;
    const normalized = dedupeEdges(edges);
    while (changed) {
      changed = false;
      normalized.forEach(edge => {
        if (reached.has(edge.partAId) && !reached.has(edge.partBId)) { reached.add(edge.partBId); changed = true; }
        if (reached.has(edge.partBId) && !reached.has(edge.partAId)) { reached.add(edge.partAId); changed = true; }
      });
    }
    return [...reached];
  }

  function bankCompatible(moving, target) {
    return Math.abs(moving.bankAngleDeg - target.bankAngleDeg) <= ANGLE_EPSILON_DEG;
  }

  function connectorCompatible(moving, target, options = {}) {
    if (!moving || !target || moving.partId === target.partId) return false;
    if (moving.shape !== target.shape || moving.laneCount !== target.laneCount) return false;
    if (angleDistance(moving.directionDeg, target.directionDeg + 180) > (options.angleEpsilonDeg ?? ANGLE_EPSILON_DEG)) return false;
    if (Math.abs(moving.pitchDeg + target.pitchDeg) > (options.pitchEpsilonDeg ?? ANGLE_EPSILON_DEG)) return false;
    return bankCompatible(moving, target);
  }

  function connectorsInheritBank(definition) {
    const connectors = connectorsForDefinition(definition);
    return connectors.length > 0 && new Set(connectors.map(connector => connector.bankAngleDeg)).size === 1;
  }

  function bankAdjustmentForDefinition(definition, moving, target) {
    if (!connectorsInheritBank(definition)) return 0;
    return finite(target?.bankAngleDeg) - finite(moving?.bankAngleDeg);
  }

  function solveSnapPose(partValue, localConnectorValue, target) {
    const part = normalizePart(partValue);
    const local = mirroredConnector(localConnectorValue, Boolean(part.cornerMirror));
    const rotation = normalizeAngle(target.directionDeg + 180 - local.directionDeg);
    const offset = rotate({ x: local.localX, y: local.localY }, rotation);
    return {
      ...part,
      rotation,
      x: target.x - offset.x,
      y: target.y - offset.y,
      zMm: target.zMm - local.localZMm,
      pitchDeg: target.pitchDeg - local.pitchDeg,
      bankAngleDeg: target.bankAngleDeg - local.bankAngleDeg
    };
  }

  function snapCandidates(partValue, catalog, targets, options = {}) {
    if (options.snapEnabled === false) return [];
    const scale = Math.max(0.0001, finite(options.scale, 1));
    const radiusPx = finite(options.radiusPx, SNAP_RADIUS_PX);
    const usage = connectorUsage(options.edges || []);
    const localConnectors = connectorsForDefinition(catalog[partValue.type]);
    const allowedLocalConnectorIndexes = Array.isArray(options.localConnectorIndexes)
      ? new Set(options.localConnectorIndexes.map(value => Math.trunc(finite(value))).filter(index => index >= 0))
      : null;
    const inheritsBank = connectorsInheritBank(catalog[partValue.type]);
    const partForSnapCandidate = typeof options.partForSnapCandidate === 'function'
      ? options.partForSnapCandidate
      : () => partValue;
    const result = [];
    localConnectors.forEach((local, localIndex) => {
      if (allowedLocalConnectorIndexes && !allowedLocalConnectorIndexes.has(localIndex)) return;
      targets.forEach(target => {
        const candidatePart = normalizePart(partForSnapCandidate(local, localIndex, target, partValue) || partValue);
        const current = worldConnector(candidatePart, local, localIndex);
        const movingForTarget = inheritsBank ? { ...current, bankAngleDeg: target.bankAngleDeg } : current;
        if (!connectorCompatible(movingForTarget, target, options)) return;
        const distanceWorld = Math.hypot(current.x - target.x, current.y - target.y);
        const distancePx = distanceWorld * scale;
        if (distancePx > radiusPx) return;
        const pose = solveSnapPose(candidatePart, local, target);
        result.push({
          localConnector: local,
          localConnectorIndex: localIndex,
          entryConnectorId: local.id,
          target,
          pose,
          distanceWorld,
          distancePx,
          used: (usage.get(endpointKey(target.partId, target.connectorId)) || 0) > 0,
          level: pose.zMm / LEVEL_HEIGHT_MM
        });
      });
    });
    return result.sort((a, b) => a.distancePx - b.distancePx || a.target.zMm - b.target.zMm || a.target.partId.localeCompare(b.target.partId));
  }

  function choosePlacement(part, catalog, targets, options = {}) {
    const candidates = snapCandidates(part, catalog, targets, options);
    if (!candidates.length) return { kind: 'free', part: normalizePart({ ...part, zMm: finite(options.freeHeightMm, part.zMm) }), candidates: [] };
    const index = Math.max(0, Math.min(candidates.length - 1, Math.trunc(finite(options.candidateIndex))));
    const distinctHeights = new Set(candidates.map(candidate => Math.round(candidate.target.zMm / Z_EPSILON_MM))).size;
    return { kind: 'snap', part: candidates[index].pose, selected: candidates[index], candidates, requiresHeightChoice: distinctHeights > 1 };
  }

  function verticalEnvelope(part, definition, bodyHeightMm = COURSE_BODY_HEIGHT_MM) {
    const connectors = connectorsForDefinition(definition);
    const heights = connectors.map(connector => finite(part.zMm) + connector.localZMm);
    const minZ = heights.length ? Math.min(...heights) : finite(part.zMm);
    const maxZ = heights.length ? Math.max(...heights) : finite(part.zMm);
    return { minZ, maxZ: maxZ + bodyHeightMm };
  }

  function boundsOverlap(left, right, epsilon = 0.001) {
    return left.minX < right.maxX - epsilon && left.maxX > right.minX + epsilon
      && left.minY < right.maxY - epsilon && left.maxY > right.minY + epsilon;
  }

  function verticalOverlap(left, right, epsilon = Z_EPSILON_MM) {
    return left.minZ < right.maxZ - epsilon && left.maxZ > right.minZ + epsilon;
  }

  function interferenceWarnings(parts, catalog, boundsForPart, options = {}) {
    const warnings = [];
    const connectedPairs = new Set(dedupeEdges(options.edges || []).map(edge => [edge.partAId, edge.partBId].sort().join('\u0000')));
    for (let leftIndex = 0; leftIndex < parts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < parts.length; rightIndex += 1) {
        const left = parts[leftIndex];
        const right = parts[rightIndex];
        if (connectedPairs.has([left.id, right.id].sort().join('\u0000'))) continue;
        if (!boundsOverlap(boundsForPart(left), boundsForPart(right))) continue;
        const leftEnvelope = verticalEnvelope(left, catalog[left.type], options.courseBodyHeightMm);
        const rightEnvelope = verticalEnvelope(right, catalog[right.type], options.courseBodyHeightMm);
        if (!verticalOverlap(leftEnvelope, rightEnvelope)) continue;
        warnings.push({ type: 'interference', partIds: [left.id, right.id], leftEnvelope, rightEnvelope });
      }
    }
    return warnings;
  }

  function validateEdges(parts, catalog, edges) {
    const connectors = allWorldConnectors(parts, catalog);
    const connectorMap = new Map(connectors.map(item => [endpointKey(item.partId, item.connectorId), item]));
    return dedupeEdges(edges).flatMap(edge => {
      const a = connectorMap.get(endpointKey(edge.partAId, edge.connectorAId));
      const b = connectorMap.get(endpointKey(edge.partBId, edge.connectorBId));
      if (!a || !b) return [{ type: 'missing-connector', edge }];
      const warnings = [];
      if (Math.hypot(a.x - b.x, a.y - b.y) > XY_EPSILON_CM || angleDistance(a.directionDeg, b.directionDeg + 180) > ANGLE_EPSILON_DEG) {
        warnings.push({ type: 'disconnected-edge', edge, a, b });
      }
      if (Math.abs(a.zMm - b.zMm) > Z_EPSILON_MM) warnings.push({ type: 'height-mismatch', edge, differenceMm: a.zMm - b.zMm, a, b });
      return warnings;
    });
  }

  function seamOwner(edge, partsById) {
    const a = partsById.get(edge.partAId);
    const b = partsById.get(edge.partBId);
    if (!a) return b?.id || null;
    if (!b) return a.id;
    const aOrder = finite(a.zOrder ?? a.zIndex);
    const bOrder = finite(b.zOrder ?? b.zIndex);
    return aOrder === bOrder ? (String(a.id) > String(b.id) ? a.id : b.id) : (aOrder > bOrder ? a.id : b.id);
  }

  function seamsByOwner(parts, edges, connectors) {
    const partsById = new Map(parts.map((part, index) => [part.id, normalizePart(part, index)]));
    const connectorsByKey = new Map(connectors.map(item => [endpointKey(item.partId, item.connectorId), item]));
    const result = new Map();
    dedupeEdges(edges).forEach(edge => {
      const ownerId = seamOwner(edge, partsById);
      const endpoint = connectorsByKey.get(endpointKey(edge.partAId, edge.connectorAId))
        || connectorsByKey.get(endpointKey(edge.partBId, edge.connectorBId));
      if (!ownerId || !endpoint) return;
      if (!result.has(ownerId)) result.set(ownerId, []);
      result.get(ownerId).push({ edge, point: { x: endpoint.x, y: endpoint.y }, heading: endpoint.directionDeg });
    });
    return result;
  }

  return Object.freeze({
    LEVEL_HEIGHT_MM, COURSE_BODY_HEIGHT_MM, SNAP_RADIUS_PX, XY_EPSILON_CM, ANGLE_EPSILON_DEG, Z_EPSILON_MM,
    normalizeAngle, angleDistance, rotate, normalizeConnector, connectorsForDefinition, normalizePart,
    worldConnector, allWorldConnectors, endpointKey, normalizeEdge, edgeKey, dedupeEdges, addEdge,
    removeEdgesForParts, connectorUsage, duplicateConnectorWarnings, connectedComponent,
    connectorCompatible, connectorsInheritBank, bankAdjustmentForDefinition, mirroredConnector, solveSnapPose, snapCandidates, choosePlacement, verticalEnvelope,
    boundsOverlap, verticalOverlap, interferenceWarnings, validateEdges, seamOwner, seamsByOwner
  });
});
