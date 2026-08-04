(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_LAYOUT_GRAPH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEVEL_HEIGHT_MM = 115;
  const COURSE_BODY_HEIGHT_MM = 60;
  const DEFAULT_CONNECTION_WIDTH_MM = 370;
  const SNAP_RADIUS_PX = 24;
  const XY_EPSILON_CM = 1.75;
  const ANGLE_EPSILON_DEG = 0.1;
  const Z_EPSILON_MM = 0.01;
  // Screen-plane coordinates are centimetres.  A 1 mm occupancy tolerance
  // prevents connector seams and polygon sampling noise from becoming errors.
  const OCCUPANCY_EPSILON_CM = 0.1;
  const OCCUPANCY_AREA_EPSILON_CM2 = OCCUPANCY_EPSILON_CM ** 2;

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
      connectorRole: value?.role == null
        ? (value?.connectorRole == null ? null : String(value.connectorRole))
        : String(value.role),
      localX: finite(value?.localX ?? value?.x),
      localY: finite(value?.localY ?? value?.y),
      localZMm: finite(value?.localZMm),
      directionDeg: normalizeAngle(value?.directionDeg ?? value?.heading),
      pitchDeg: finite(value?.pitchDeg),
      bankAngleDeg: finite(value?.bankAngleDeg),
      bankTransitionToDeg: value?.bankTransitionToDeg == null ? null : finite(value.bankTransitionToDeg),
      connectionWidthMm: finite(value?.connectionWidthMm, DEFAULT_CONNECTION_WIDTH_MM),
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
    const connector = normalizeConnector(connectorValue, index);
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
    const local = normalizeConnector(localConnectorValue);
    const solvedRotation = normalizeAngle(target.directionDeg + 180 - local.directionDeg);
    // Corner pose generation may already have calculated a target-tangent
    // rotation for this exact entry/mirror combination.  Retain it only when
    // it still faces the current target; a stale candidate must be recomputed
    // instead of fixing a connector to an old absolute pose.
    const requestedRotation = Number(part.candidateRotation);
    const rotation = Number.isFinite(requestedRotation)
      && angleDistance(requestedRotation, solvedRotation) <= ANGLE_EPSILON_DEG
      ? normalizeAngle(requestedRotation)
      : solvedRotation;
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
    const partForSnapDistanceCandidate = typeof options.partForSnapDistanceCandidate === 'function'
      ? options.partForSnapDistanceCandidate
      : () => partValue;
    const result = [];
    localConnectors.forEach((local, localIndex) => {
      if (allowedLocalConnectorIndexes && !allowedLocalConnectorIndexes.has(localIndex)) return;
      targets.forEach(target => {
        const candidatePart = normalizePart(partForSnapCandidate(local, localIndex, target, partValue) || partValue);
        const distancePart = normalizePart(partForSnapDistanceCandidate(local, localIndex, target, partValue) || partValue);
        // Compatibility belongs to the target-facing pose, but proximity must
        // come from the actual ghost currently under the pointer.  Otherwise a
        // mirrored reversible corner can map A and B onto the same screen point
        // before their distances are compared.
        // Connection compatibility belongs to the pose that would result from
        // this exact local connector meeting the target.  Checking the
        // free-ghost rotation here rejects a valid A/B candidate before its
        // target tangent can calculate the required rotation.
        const solvedPose = solveSnapPose(candidatePart, local, target);
        const targetFacing = worldConnector(solvedPose, local, localIndex);
        const current = worldConnector(distancePart, local, localIndex);
        const movingForTarget = inheritsBank ? { ...targetFacing, bankAngleDeg: target.bankAngleDeg } : targetFacing;
        if (!connectorCompatible(movingForTarget, target, options)) return;
        const distanceWorld = Math.hypot(current.x - target.x, current.y - target.y);
        const distancePx = distanceWorld * scale;
        if (distancePx > radiusPx) return;
        result.push({
          localConnector: local,
          localConnectorIndex: localIndex,
          entryConnectorId: local.id,
          target,
          pose: solvedPose,
          distanceWorld,
          distancePx,
          used: (usage.get(endpointKey(target.partId, target.connectorId)) || 0) > 0,
          level: solvedPose.zMm / LEVEL_HEIGHT_MM
        });
      });
    });
    return result.sort(compareSnapCandidates);
  }

  // A target connection can be reached by either end of a reversible corner.
  // Keep both raw candidates for geometry, then choose the closest end for each
  // target.  This deliberately happens after distance and compatibility checks:
  // handedness is never used as an entry-connector filter.
  function snapTargetKey(candidate) {
    const target = candidate?.target || {};
    return [
      encodeURIComponent(String(target.partId || '')),
      encodeURIComponent(String(target.connectorId || '')),
      finite(target.zMm).toFixed(4),
      finite(target.x).toFixed(4),
      finite(target.y).toFixed(4),
      normalizeAngle(target.directionDeg).toFixed(4)
    ].join('|');
  }

  function compareSnapCandidates(left, right) {
    return left.distancePx - right.distancePx
      || left.target.zMm - right.target.zMm
      || endpointKey(left.target.partId, left.target.connectorId).localeCompare(endpointKey(right.target.partId, right.target.connectorId))
      || left.localConnectorIndex - right.localConnectorIndex
      || String(left.entryConnectorId).localeCompare(String(right.entryConnectorId));
  }

  function nearestCandidateForEachTarget(candidates) {
    const nearest = new Map();
    candidates.forEach(candidate => {
      const key = snapTargetKey(candidate);
      if (!nearest.has(key)) nearest.set(key, candidate);
    });
    return [...nearest.values()].sort(compareSnapCandidates);
  }

  function choosePlacement(part, catalog, targets, options = {}) {
    const rawCandidates = snapCandidates(part, catalog, targets, options);
    if (!rawCandidates.length) return { kind: 'free', part: normalizePart({ ...part, zMm: finite(options.freeHeightMm, part.zMm) }), candidates: [], rawCandidates: [] };
    const candidates = nearestCandidateForEachTarget(rawCandidates);
    const requestedTargetKey = String(options.selectedTargetKey || '');
    const selected = candidates.find(candidate => snapTargetKey(candidate) === requestedTargetKey) || candidates[0];
    const distinctHeights = new Set(candidates.map(candidate => Math.round(candidate.target.zMm / Z_EPSILON_MM))).size;
    return {
      kind: 'snap', part: selected.pose, selected, candidates, rawCandidates,
      selectedTargetKey: snapTargetKey(selected), requiresHeightChoice: distinctHeights > 1
    };
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

  function polygonSignedArea(points) {
    return points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2;
  }

  function polygonArea(points) {
    return Math.abs(polygonSignedArea(points));
  }

  function polygonBounds(points) {
    if (!points.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return {
      minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
      minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y))
    };
  }

  function rectanglePolygon(bounds) {
    return [
      { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY }
    ];
  }

  function cornerOccupancyLocal(definition, samples = 24) {
    const geometry = definition?.geometry || {};
    const r = finite(geometry.centerlineRadius, finite(definition?.radius, 54));
    const inferredTrackWidth = finite(geometry.outerRadius) - finite(geometry.innerRadius);
    const trackWidth = inferredTrackWidth > 0 ? inferredTrackWidth : finite(definition?.trackWidth, 36);
    const ri = finite(geometry.innerRadius, r - trackWidth / 2);
    const ro = finite(geometry.outerRadius, r + trackWidth / 2);
    if (!(ri > 0 && ro > ri)) return [];
    const angle = Math.PI / 4;
    const radialCentroid = (4 * Math.sin(angle / 2) / (3 * angle)) * ((ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2));
    const bisector = -3 * Math.PI / 8;
    const center = { x: -radialCentroid * Math.cos(bisector), y: -radialCentroid * Math.sin(bisector) };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI / 4;
    const cornerY = value => geometry.pathOrientation === 'left' ? -value : value;
    const count = Math.max(4, Math.round(samples));
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      const theta = startAngle + (endAngle - startAngle) * index / count;
      points.push({ x: center.x + ro * Math.cos(theta), y: cornerY(center.y + ro * Math.sin(theta)) });
    }
    for (let index = count; index >= 0; index -= 1) {
      const theta = startAngle + (endAngle - startAngle) * index / count;
      points.push({ x: center.x + ri * Math.cos(theta), y: cornerY(center.y + ri * Math.sin(theta)) });
    }
    return points;
  }

  function occupancyPolygon(partValue, definition, fallbackBounds = null) {
    const part = normalizePart(partValue);
    const geometry = definition?.geometry || {};
    let local = definition?.corner45 ? cornerOccupancyLocal(definition) : [];
    if (!local.length) {
      const width = finite(geometry.width, finite(definition?.w));
      const height = finite(geometry.height, finite(definition?.h));
      const bounds = geometry.bounds || (width > 0 && height > 0
        ? { minX: -width / 2, maxX: width / 2, minY: -height / 2, maxY: height / 2 }
        : null);
      if (!bounds) return fallbackBounds ? rectanglePolygon(fallbackBounds) : [];
      local = rectanglePolygon(bounds);
    }
    return local.map(point => {
      const offset = rotate(point, part.rotation);
      return { x: part.x + offset.x, y: part.y + offset.y };
    });
  }

  function cross(origin, left, right) {
    return (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  }

  function pointInTriangle(point, a, b, c, epsilon = OCCUPANCY_EPSILON_CM) {
    const ab = cross(a, b, point);
    const bc = cross(b, c, point);
    const ca = cross(c, a, point);
    return (ab >= -epsilon && bc >= -epsilon && ca >= -epsilon)
      || (ab <= epsilon && bc <= epsilon && ca <= epsilon);
  }

  function triangulatePolygon(points, epsilon = OCCUPANCY_EPSILON_CM) {
    const vertices = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > epsilon / 10);
    if (vertices.length > 1 && Math.hypot(vertices[0].x - vertices.at(-1).x, vertices[0].y - vertices.at(-1).y) <= epsilon / 10) vertices.pop();
    if (vertices.length < 3 || polygonArea(vertices) <= epsilon ** 2) return [];
    const orientation = Math.sign(polygonSignedArea(vertices)) || 1;
    const remaining = vertices.map((_, index) => index);
    const triangles = [];
    let guard = remaining.length ** 2;
    while (remaining.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let cursor = 0; cursor < remaining.length; cursor += 1) {
        const before = vertices[remaining[(cursor - 1 + remaining.length) % remaining.length]];
        const current = vertices[remaining[cursor]];
        const after = vertices[remaining[(cursor + 1) % remaining.length]];
        if (orientation * cross(before, current, after) <= epsilon / 100) continue;
        const containsVertex = remaining.some((index, candidate) => candidate !== cursor
          && candidate !== (cursor - 1 + remaining.length) % remaining.length
          && candidate !== (cursor + 1) % remaining.length
          && pointInTriangle(vertices[index], before, current, after, epsilon / 100));
        if (containsVertex) continue;
        triangles.push(orientation > 0 ? [before, current, after] : [before, after, current]);
        remaining.splice(cursor, 1);
        clipped = true;
        break;
      }
      if (!clipped) return [];
    }
    if (remaining.length === 3) {
      const triangle = remaining.map(index => vertices[index]);
      triangles.push(orientation > 0 ? triangle : [triangle[0], triangle[2], triangle[1]]);
    }
    return triangles;
  }

  function lineIntersection(start, end, clipStart, clipEnd) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const ex = clipEnd.x - clipStart.x;
    const ey = clipEnd.y - clipStart.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-12) return end;
    const t = ((clipStart.x - start.x) * ey - (clipStart.y - start.y) * ex) / denominator;
    return { x: start.x + t * dx, y: start.y + t * dy };
  }

  function clipConvexPolygon(subject, clip, epsilon = OCCUPANCY_EPSILON_CM) {
    let output = subject;
    for (let index = 0; index < clip.length && output.length; index += 1) {
      const clipStart = clip[index];
      const clipEnd = clip[(index + 1) % clip.length];
      const input = output;
      output = [];
      for (let cursor = 0; cursor < input.length; cursor += 1) {
        const start = input[cursor];
        const end = input[(cursor + 1) % input.length];
        const startInside = cross(clipStart, clipEnd, start) >= -epsilon;
        const endInside = cross(clipStart, clipEnd, end) >= -epsilon;
        if (startInside && endInside) output.push(end);
        else if (startInside && !endInside) output.push(lineIntersection(start, end, clipStart, clipEnd));
        else if (!startInside && endInside) {
          output.push(lineIntersection(start, end, clipStart, clipEnd));
          output.push(end);
        }
      }
    }
    return output;
  }

  function polygonIntersectionArea(left, right, epsilon = OCCUPANCY_EPSILON_CM) {
    const leftTriangles = triangulatePolygon(left, epsilon);
    const rightTriangles = triangulatePolygon(right, epsilon);
    return leftTriangles.reduce((total, leftTriangle) => total + rightTriangles.reduce((area, rightTriangle) => {
      const clipped = clipConvexPolygon(leftTriangle, rightTriangle, epsilon);
      return area + (clipped.length >= 3 ? polygonArea(clipped) : 0);
    }, 0), 0);
  }

  function interferenceWarnings(parts, catalog, boundsForPart, options = {}) {
    const warnings = [];
    const connectedPairs = new Set(dedupeEdges(options.edges || []).map(edge => [edge.partAId, edge.partBId].sort().join('\u0000')));
    for (let leftIndex = 0; leftIndex < parts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < parts.length; rightIndex += 1) {
        const left = parts[leftIndex];
        const right = parts[rightIndex];
        if (connectedPairs.has([left.id, right.id].sort().join('\u0000'))) continue;
        const leftBounds = boundsForPart(left);
        const rightBounds = boundsForPart(right);
        if (!boundsOverlap(leftBounds, rightBounds, OCCUPANCY_EPSILON_CM)) continue;
        const leftEnvelope = verticalEnvelope(left, catalog[left.type], options.courseBodyHeightMm);
        const rightEnvelope = verticalEnvelope(right, catalog[right.type], options.courseBodyHeightMm);
        if (!verticalOverlap(leftEnvelope, rightEnvelope)) continue;
        const leftPolygon = occupancyPolygon(left, catalog[left.type], leftBounds);
        const rightPolygon = occupancyPolygon(right, catalog[right.type], rightBounds);
        const overlapAreaCm2 = polygonIntersectionArea(leftPolygon, rightPolygon, OCCUPANCY_EPSILON_CM);
        if (overlapAreaCm2 <= OCCUPANCY_AREA_EPSILON_CM2) continue;
        warnings.push({ type: 'interference', partIds: [left.id, right.id], leftEnvelope, rightEnvelope, overlapAreaCm2 });
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
      result.get(ownerId).push({
        edge,
        point: { x: endpoint.x, y: endpoint.y },
        heading: endpoint.directionDeg,
        connectionWidthMm: endpoint.connectionWidthMm
      });
    });
    return result;
  }

  return Object.freeze({
    LEVEL_HEIGHT_MM, COURSE_BODY_HEIGHT_MM, DEFAULT_CONNECTION_WIDTH_MM, SNAP_RADIUS_PX, XY_EPSILON_CM, ANGLE_EPSILON_DEG, Z_EPSILON_MM, OCCUPANCY_EPSILON_CM, OCCUPANCY_AREA_EPSILON_CM2,
    normalizeAngle, angleDistance, rotate, normalizeConnector, connectorsForDefinition, normalizePart,
    worldConnector, allWorldConnectors, endpointKey, normalizeEdge, edgeKey, dedupeEdges, addEdge,
    removeEdgesForParts, connectorUsage, duplicateConnectorWarnings, connectedComponent,
    connectorCompatible, connectorsInheritBank, bankAdjustmentForDefinition, mirroredConnector, solveSnapPose, snapCandidates, snapTargetKey, nearestCandidateForEachTarget, choosePlacement, verticalEnvelope,
    boundsOverlap, verticalOverlap, polygonArea, polygonBounds, occupancyPolygon, polygonIntersectionArea, interferenceWarnings, validateEdges, seamOwner, seamsByOwner
  });
});
