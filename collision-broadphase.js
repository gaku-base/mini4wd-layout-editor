(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_COLLISION_BROADPHASE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_NUMERIC_EPSILON_MM = 1e-7;
  const DEFAULT_ROTATION_STEP_DEG = 45;
  const DEFAULT_ROTATION_EPSILON_DEG = 1e-9;
  const PROFILE_RATIO_EPSILON = 1e-10;

  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const angle = value => {
    const number = finite(value);
    return number == null ? null : ((number % 360) + 360) % 360;
  };
  const rotateXY = (x, y, degrees) => {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  };
  const identity = placement => ({
    partId: placement?.partId == null ? '' : String(placement.partId),
    profileRef: placement?.profileRef == null
      ? (placement?.profile?.id == null ? null : String(placement.profile.id))
      : String(placement.profileRef)
  });
  const nonEmptyId = value => {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  };
  const requiredWallKeys = options => [...new Set(
    (Array.isArray(options?.requiredWallKeys) ? options.requiredWallKeys : [])
      .map(nonEmptyId)
      .filter(Boolean)
  )];

  function normalizeAngleDeg(value) { return angle(value); }

  function isRotationStepAligned(rotationDeg, stepDeg = DEFAULT_ROTATION_STEP_DEG, epsilonDeg = DEFAULT_ROTATION_EPSILON_DEG) {
    const rotation = finite(rotationDeg);
    const step = finite(stepDeg);
    const epsilon = finite(epsilonDeg);
    if (rotation == null || step == null || step <= 0 || epsilon == null || epsilon < 0) return false;
    const remainder = ((rotation % step) + step) % step;
    return Math.min(remainder, step - remainder) <= epsilon;
  }

  function validatePlacement(placement) {
    const id = identity(placement);
    const missing = [];
    if (!nonEmptyId(id.partId)) missing.push('partId');
    const x = finite(placement?.positionMm?.x);
    const y = finite(placement?.positionMm?.y);
    const z = finite(placement?.positionMm?.z);
    const rotationDeg = angle(placement?.rotationDeg);
    if (x == null) missing.push('positionMm.x');
    if (y == null) missing.push('positionMm.y');
    if (z == null) missing.push('positionMm.z');
    if (rotationDeg == null) missing.push('rotationDeg');
    else if (!isRotationStepAligned(rotationDeg)) missing.push('rotationDeg(45-degree increment required)');
    return {
      ...id,
      ready: missing.length === 0,
      missing,
      positionMm: x == null || y == null || z == null ? null : { x, y, z },
      rotationDeg
    };
  }

  function normalizeYZPoint(value) {
    const pair = Array.isArray(value) ? value : value && typeof value === 'object' ? [value.y, value.z] : null;
    if (!pair || pair.length < 2) return null;
    const y = finite(pair[0]);
    const z = finite(pair[1]);
    return y == null || z == null ? null : [y, z];
  }

  function worldPoint(center, tangentHeadingDeg, yz, placement) {
    const lateral = rotateXY(0, yz[0], tangentHeadingDeg);
    const local = { x: center.x + lateral.x, y: center.y + lateral.y, z: center.z + yz[1] };
    const rotated = rotateXY(local.x, local.y, placement.rotationDeg);
    return {
      x: placement.positionMm.x + rotated.x,
      y: placement.positionMm.y + rotated.y,
      z: placement.positionMm.z + local.z
    };
  }

  function worldCenter(center, placement) {
    const rotated = rotateXY(center.x, center.y, placement.rotationDeg);
    return {
      x: placement.positionMm.x + rotated.x,
      y: placement.positionMm.y + rotated.y,
      z: placement.positionMm.z + center.z
    };
  }

  function collectPolyline(values, path, required, center, tangent, placement, points, missing) {
    if (!Array.isArray(values) || values.length === 0) {
      if (required) missing.push(path);
      return;
    }
    let validCount = 0;
    values.forEach((value, index) => {
      const yz = normalizeYZPoint(value);
      if (!yz) missing.push(`${path}[${index}]`);
      else {
        validCount += 1;
        points.push(worldPoint(center, tangent, yz, placement));
      }
    });
    if (required && validCount < 2) missing.push(`${path}(at least 2 valid points required)`);
  }

  function collectWall(wall, path, required, center, tangent, placement, points, missing) {
    if (!wall || typeof wall !== 'object') {
      if (required) missing.push(path);
      return;
    }

    const values = [];
    const lowerPresent = wall.lowerEdgeMm != null;
    const upperPresent = wall.upperEdgeMm != null;
    const lower = lowerPresent ? normalizeYZPoint(wall.lowerEdgeMm) : null;
    const upper = upperPresent ? normalizeYZPoint(wall.upperEdgeMm) : null;
    if (lowerPresent && !lower) missing.push(`${path}.lowerEdgeMm`);
    if (upperPresent && !upper) missing.push(`${path}.upperEdgeMm`);
    if (lower) values.push(lower);
    if (upper) values.push(upper);

    let polylineComplete = false;
    if (Array.isArray(wall.polylineYZMm)) {
      let validCount = 0;
      wall.polylineYZMm.forEach((value, index) => {
        const yz = normalizeYZPoint(value);
        if (yz) {
          validCount += 1;
          values.push(yz);
        } else missing.push(`${path}.polylineYZMm[${index}]`);
      });
      polylineComplete = wall.polylineYZMm.length >= 2 && validCount === wall.polylineYZMm.length;
    }

    const edgeComplete = Boolean(lower && upper);
    if (required && !edgeComplete && !polylineComplete) {
      if (lowerPresent || upperPresent) {
        if (!lowerPresent) missing.push(`${path}.lowerEdgeMm`);
        if (!upperPresent) missing.push(`${path}.upperEdgeMm`);
      } else {
        missing.push(path);
      }
    }
    values.forEach(yz => points.push(worldPoint(center, tangent, yz, placement)));
  }

  function transformStationGeometry(station, placementValue, options = {}, stationIndex = 0) {
    const placement = validatePlacement(placementValue);
    const stationId = station?.id == null ? String(stationIndex) : String(station.id);
    const prefix = `stations[${stationId}]`;
    const missing = placement.missing.map(item => `placement.${item}`);
    const center = {
      x: finite(station?.centerlinePositionMm?.x),
      y: finite(station?.centerlinePositionMm?.y),
      z: finite(station?.centerlinePositionMm?.z)
    };
    const tangent = angle(station?.tangentHeadingDeg);
    for (const axis of ['x', 'y', 'z']) if (center[axis] == null) missing.push(`${prefix}.centerlinePositionMm.${axis}`);
    if (tangent == null) missing.push(`${prefix}.tangentHeadingDeg`);
    const points = [];
    if (!placement.ready || Object.values(center).some(value => value == null) || tangent == null) {
      return { stationId, ready: false, points, missing: [...new Set(missing)] };
    }

    points.push(worldCenter(center, placement));
    collectPolyline(station?.runningSurfacePolylineYZMm, `${prefix}.runningSurfacePolylineYZMm`, options.requireRunningSurface !== false, center, tangent, placement, points, missing);
    collectPolyline(station?.undersidePolylineYZMm, `${prefix}.undersidePolylineYZMm`, options.requireUnderside !== false, center, tangent, placement, points, missing);

    const requiredWalls = requiredWallKeys(options);
    if (requiredWalls.length === 0) missing.push('options.requiredWallKeys(non-empty wall schema required)');
    const polyWalls = station?.sideWallPolylinesYZMm || {};
    const objectWalls = station?.walls || {};
    const keys = new Set([...Object.keys(polyWalls), ...Object.keys(objectWalls), ...requiredWalls]);
    keys.forEach(key => {
      const required = requiredWalls.includes(key);
      if (polyWalls[key] != null || (objectWalls[key] == null && required)) {
        collectPolyline(polyWalls[key], `${prefix}.sideWallPolylinesYZMm.${key}`, required, center, tangent, placement, points, missing);
      }
      if (objectWalls[key] != null) collectWall(objectWalls[key], `${prefix}.walls.${key}`, required, center, tangent, placement, points, missing);
    });
    return { stationId, ready: missing.length === 0, points, missing: [...new Set(missing)] };
  }

  function boundsForPoints(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    return points.reduce((b, p) => ({
      minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), minZ: Math.min(b.minZ, p.z),
      maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y), maxZ: Math.max(b.maxZ, p.z)
    }), { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
  }

  function validateStationSequence(stations) {
    const missing = [];
    const seenIds = new Set();
    let previousRatio = -Infinity;
    let entrance = false;
    let exit = false;
    stations.forEach((station, index) => {
      const id = station?.id == null ? '' : String(station.id);
      const label = id || index;
      const ratio = finite(station?.ratio);
      if (!id) missing.push(`stations[${index}].id`);
      else if (seenIds.has(id)) missing.push(`stations[${id}].id(duplicate)`);
      else seenIds.add(id);
      if (ratio == null) missing.push(`stations[${label}].ratio`);
      else {
        if (ratio < -PROFILE_RATIO_EPSILON || ratio > 1 + PROFILE_RATIO_EPSILON) missing.push(`stations[${label}].ratio(range 0..1 required)`);
        if (ratio + PROFILE_RATIO_EPSILON < previousRatio) missing.push('profile.stations(ratio ascending required)');
        previousRatio = Math.max(previousRatio, ratio);
        if (Math.abs(ratio) <= PROFILE_RATIO_EPSILON) entrance = true;
        if (Math.abs(ratio - 1) <= PROFILE_RATIO_EPSILON) exit = true;
      }
    });
    if (!entrance) missing.push('profile.stations(entrance ratio 0 required)');
    if (!exit) missing.push('profile.stations(exit ratio 1 required)');
    return [...new Set(missing)];
  }

  function clearance(station, key) {
    return finite(station?.passableClearance?.[key] ?? station?.[key]);
  }

  function buildWorldAabb(placementValue, options = {}) {
    const placement = validatePlacement(placementValue);
    const profile = placementValue?.profile;
    const collisionOptions = { ...options, requireRunningSurface: true, requireUnderside: true };
    const missing = placement.missing.map(item => `placement.${item}`);
    if (requiredWallKeys(collisionOptions).length === 0) missing.push('options.requiredWallKeys(non-empty wall schema required)');
    if (!profile || typeof profile !== 'object') missing.push('profile');
    if (profile && !['verified', 'provisional'].includes(String(profile.status))) missing.push('profile.status(collision-ready verified/provisional required)');
    if (profile && profile.coordinateFrame !== 'part-local-xyz') missing.push('profile.coordinateFrame(part-local-xyz required)');
    if (profile && profile.interpolation !== 'linear') missing.push('profile.interpolation(broad-phase-safe linear required)');
    const stations = Array.isArray(profile?.stations) ? profile.stations : null;
    if (!stations || stations.length === 0) missing.push('profile.stations');
    else missing.push(...validateStationSequence(stations));

    const points = [];
    const centers = [];
    let lateralRadius = 0;
    if (stations && placement.ready) stations.forEach((station, index) => {
      const transformed = transformStationGeometry(station, placementValue, collisionOptions, index);
      points.push(...transformed.points);
      missing.push(...transformed.missing);
      if (transformed.points.length) {
        const center = transformed.points[0];
        centers.push(center);
        transformed.points.forEach(point => {
          lateralRadius = Math.max(lateralRadius, Math.hypot(point.x - center.x, point.y - center.y));
        });
      }
      const id = station?.id == null ? String(index) : String(station.id);
      if (clearance(station, 'effectiveHeightMm') == null) missing.push(`stations[${id}].effectiveHeightMm`);
      if (clearance(station, 'effectiveWidthMm') == null) missing.push(`stations[${id}].effectiveWidthMm`);
    });

    const sampled = boundsForPoints(points);
    const centerBounds = boundsForPoints(centers);
    const knownAabb = sampled && centerBounds ? {
      minX: centerBounds.minX - lateralRadius,
      minY: centerBounds.minY - lateralRadius,
      minZ: sampled.minZ,
      maxX: centerBounds.maxX + lateralRadius,
      maxY: centerBounds.maxY + lateralRadius,
      maxZ: sampled.maxZ
    } : sampled;
    const uniqueMissing = [...new Set(missing)];
    return {
      status: uniqueMissing.length === 0 && knownAabb ? 'ready' : 'indeterminate',
      partId: placement.partId,
      profileRef: placement.profileRef,
      aabb: uniqueMissing.length === 0 ? knownAabb : null,
      knownAabb,
      missing: uniqueMissing
    };
  }

  function nonNegative(value, fallback = 0) {
    const number = finite(value);
    return number == null ? fallback : Math.max(0, number);
  }
  function expandedAabb(aabb, mm) {
    const d = nonNegative(mm);
    return { minX: aabb.minX - d, minY: aabb.minY - d, minZ: aabb.minZ - d, maxX: aabb.maxX + d, maxY: aabb.maxY + d, maxZ: aabb.maxZ + d };
  }
  function separatingAxis(a, b, options = {}) {
    const margin = nonNegative(options.physicalToleranceMm) + nonNegative(options.numericEpsilonMm, DEFAULT_NUMERIC_EPSILON_MM);
    if (a.maxX < b.minX - margin || b.maxX < a.minX - margin) return 'x';
    if (a.maxY < b.minY - margin || b.maxY < a.minY - margin) return 'y';
    if (a.maxZ < b.minZ - margin || b.maxZ < a.minZ - margin) return 'z';
    return null;
  }
  function intersectionAabb(aValue, bValue, expandMm = 0) {
    const a = expandedAabb(aValue, expandMm);
    const b = expandedAabb(bValue, expandMm);
    const r = { minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), minZ: Math.max(a.minZ, b.minZ), maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY), maxZ: Math.min(a.maxZ, b.maxZ) };
    return r.minX > r.maxX || r.minY > r.maxY || r.minZ > r.maxZ ? null : r;
  }

  const samePair = (connection, a, b) => {
    const left = connection?.partAId == null ? '' : String(connection.partAId);
    const right = connection?.partBId == null ? '' : String(connection.partBId);
    return (left === a && right === b) || (left === b && right === a);
  };
  function normalContactState(connections, partAId, partBId) {
    const matches = (Array.isArray(connections) ? connections : []).filter(item => samePair(item, partAId, partBId));
    if (!matches.length) return { formalConnection: false, exclusionStatus: 'not-connected', confirmedCoverage: false, connections: [] };
    const details = matches.map(connection => {
      const exclusion = connection.normalContactExclusion;
      const status = exclusion?.status == null ? 'unknown' : String(exclusion.status);
      const connectorAId = nonEmptyId(connection.connectorAId);
      const connectorBId = nonEmptyId(connection.connectorBId);
      const validConnectorIdentity = Boolean(connectorAId && connectorBId);
      return {
        connectorAId,
        connectorBId,
        validConnectorIdentity,
        exclusionStatus: status,
        confirmedCoverage: validConnectorIdentity && ['verified', 'provisional'].includes(status) && exclusion?.broadPhaseCoverage === 'confirmed'
      };
    });
    const statuses = [...new Set(details.map(item => item.exclusionStatus))];
    return {
      formalConnection: details.some(item => item.validConnectorIdentity),
      connectorAId: details.length === 1 ? details[0].connectorAId : null,
      connectorBId: details.length === 1 ? details[0].connectorBId : null,
      exclusionStatus: statuses.length === 1 ? statuses[0] : 'mixed',
      confirmedCoverage: details.every(item => item.confirmedCoverage),
      connections: details
    };
  }

  function identityDiagnostic(partAValue, partBValue, reasonCode, duplicatePartIds = new Set(), options = {}) {
    const idA = identity(partAValue).partId;
    const idB = identity(partBValue).partId;
    const normalizedIdA = nonEmptyId(idA);
    const normalizedIdB = nonEmptyId(idB);
    const a = buildWorldAabb(partAValue, options);
    const b = buildWorldAabb(partBValue, options);
    const missing = [];
    if (!normalizedIdA) missing.push({ partId: null, path: 'partId' });
    if (!normalizedIdB) missing.push({ partId: null, path: 'partId' });
    if ((normalizedIdA && normalizedIdA === normalizedIdB) || duplicatePartIds.has(normalizedIdA)) missing.push({ partId: idA || null, path: 'partId(duplicate)' });
    if (normalizedIdB && duplicatePartIds.has(normalizedIdB) && normalizedIdB !== normalizedIdA) missing.push({ partId: idB, path: 'partId(duplicate)' });
    return {
      partAId: idA,
      partBId: idB,
      profileRefA: a.profileRef,
      profileRefB: b.profileRef,
      worldAabbA: null,
      worldAabbB: null,
      knownWorldAabbA: a.knownAabb,
      knownWorldAabbB: b.knownAabb,
      candidateRangeMm: null,
      normalContact: { formalConnection: false, exclusionStatus: 'not-evaluated', confirmedCoverage: false, connections: [] },
      missing,
      status: 'indeterminate',
      reasonCode
    };
  }

  function classifyPair(partAValue, partBValue, options = {}, context = {}) {
    if (partAValue === partBValue) return null;
    const idAValue = identity(partAValue).partId;
    const idBValue = identity(partBValue).partId;
    const normalizedIdA = nonEmptyId(idAValue);
    const normalizedIdB = nonEmptyId(idBValue);
    const duplicatePartIds = context.duplicatePartIds instanceof Set ? context.duplicatePartIds : new Set();
    if (!normalizedIdA || !normalizedIdB) {
      return identityDiagnostic(partAValue, partBValue, 'part-id-missing', duplicatePartIds, options);
    }
    if (normalizedIdA === normalizedIdB || duplicatePartIds.has(normalizedIdA) || duplicatePartIds.has(normalizedIdB)) {
      return identityDiagnostic(partAValue, partBValue, 'part-id-duplicate', duplicatePartIds, options);
    }
    const [partA, partB] = idAValue.localeCompare(idBValue) <= 0 ? [partAValue, partBValue] : [partBValue, partAValue];
    const idA = identity(partA).partId;
    const idB = identity(partB).partId;
    const a = buildWorldAabb(partA, options);
    const b = buildWorldAabb(partB, options);
    const base = {
      partAId: idA, partBId: idB,
      profileRefA: a.profileRef, profileRefB: b.profileRef,
      worldAabbA: a.aabb, worldAabbB: b.aabb,
      knownWorldAabbA: a.knownAabb, knownWorldAabbB: b.knownAabb,
      candidateRangeMm: null,
      normalContact: normalContactState(options.connections, idA, idB),
      missing: []
    };
    if (a.status !== 'ready' || b.status !== 'ready') return {
      ...base, status: 'indeterminate', reasonCode: 'profile-or-placement-incomplete',
      missing: [...a.missing.map(path => ({ partId: idA, path })), ...b.missing.map(path => ({ partId: idB, path }))]
    };
    const tolerance = finite(options.physicalToleranceMm);
    if (tolerance == null || tolerance < 0) return {
      ...base, status: 'indeterminate', reasonCode: 'physical-tolerance-unknown',
      missing: [{ partId: null, path: 'physicalToleranceMm' }]
    };
    const axis = separatingAxis(a.aabb, b.aabb, options);
    if (axis) return { ...base, status: 'clear', reasonCode: `aabb-separated-${axis}` };
    const candidateRangeMm = intersectionAabb(a.aabb, b.aabb, tolerance / 2);
    if (base.normalContact.confirmedCoverage) return { ...base, status: 'excluded-normal-contact', reasonCode: 'confirmed-normal-contact-exclusion', candidateRangeMm };
    return {
      ...base, status: 'candidate',
      reasonCode: base.normalContact.formalConnection ? 'aabb-overlap-normal-contact-not-confirmed' : 'aabb-overlap',
      candidateRangeMm
    };
  }

  function analyzeBroadPhase(placements, options = {}) {
    const values = Array.isArray(placements) ? [...placements] : [];
    const counts = new Map();
    values.forEach(value => {
      const id = nonEmptyId(identity(value).partId);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    const duplicatePartIds = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
    const sorted = values.sort((a, b) => {
      const ia = identity(a); const ib = identity(b);
      const byId = ia.partId.localeCompare(ib.partId);
      if (byId) return byId;
      const byProfile = String(ia.profileRef || '').localeCompare(String(ib.profileRef || ''));
      if (byProfile) return byProfile;
      const pa = a?.positionMm || {}; const pb = b?.positionMm || {};
      for (const axis of ['x', 'y', 'z']) {
        const av = finite(pa[axis]); const bv = finite(pb[axis]);
        if (av != null && bv != null && av !== bv) return av - bv;
        if (av == null && bv != null) return -1;
        if (av != null && bv == null) return 1;
      }
      const ar = finite(a?.rotationDeg); const br = finite(b?.rotationDeg);
      if (ar != null && br != null && ar !== br) return ar - br;
      if (ar == null && br != null) return -1;
      if (ar != null && br == null) return 1;
      return 0;
    });
    const results = [];
    for (let i = 0; i < sorted.length; i += 1) for (let j = i + 1; j < sorted.length; j += 1) {
      const result = classifyPair(sorted[i], sorted[j], options, { duplicatePartIds });
      if (result) results.push(result);
    }
    return results;
  }
  const extractBroadPhaseCandidates = (placements, options = {}) => analyzeBroadPhase(placements, options)
    .filter(result => result.status === 'candidate' || result.status === 'indeterminate');

  return Object.freeze({
    DEFAULT_NUMERIC_EPSILON_MM,
    DEFAULT_ROTATION_STEP_DEG,
    DEFAULT_ROTATION_EPSILON_DEG,
    PROFILE_RATIO_EPSILON,
    normalizeAngleDeg,
    isRotationStepAligned,
    validatePlacement,
    validateStationSequence,
    transformStationGeometry,
    boundsForPoints,
    buildWorldAabb,
    separatingAxis,
    intersectionAabb,
    classifyPair,
    analyzeBroadPhase,
    extractBroadPhaseCandidates
  });
});