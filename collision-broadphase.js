(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_COLLISION_BROADPHASE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_NUMERIC_EPSILON_MM = 1e-7;

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function normalizeAngleDeg(value) {
    const number = finiteNumber(value);
    if (number == null) return null;
    return ((number % 360) + 360) % 360;
  }

  function rotateXY(x, y, degrees) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos
    };
  }

  function placementIdentity(placement, index = 0) {
    const partId = placement?.partId == null ? '' : String(placement.partId);
    return {
      partId,
      index,
      profileRef: placement?.profileRef == null
        ? (placement?.profile?.id == null ? null : String(placement.profile.id))
        : String(placement.profileRef)
    };
  }

  function validatePlacement(placement, index = 0) {
    const identity = placementIdentity(placement, index);
    const missing = [];
    if (!identity.partId) missing.push('partId');

    const positionMm = placement?.positionMm;
    const x = finiteNumber(positionMm?.x);
    const y = finiteNumber(positionMm?.y);
    const z = finiteNumber(positionMm?.z);
    const rotationDeg = normalizeAngleDeg(placement?.rotationDeg);
    if (x == null) missing.push('positionMm.x');
    if (y == null) missing.push('positionMm.y');
    if (z == null) missing.push('positionMm.z');
    if (rotationDeg == null) missing.push('rotationDeg');

    return {
      ...identity,
      ready: missing.length === 0,
      missing,
      positionMm: x == null || y == null || z == null ? null : { x, y, z },
      rotationDeg
    };
  }

  function normalizeYZPoint(value) {
    if (Array.isArray(value) && value.length >= 2) {
      const y = finiteNumber(value[0]);
      const z = finiteNumber(value[1]);
      return y == null || z == null ? null : [y, z];
    }
    if (value && typeof value === 'object') {
      const y = finiteNumber(value.y);
      const z = finiteNumber(value.z);
      return y == null || z == null ? null : [y, z];
    }
    return null;
  }

  function validPoint2(value) {
    return normalizeYZPoint(value) != null;
  }

  function pointFromStationOffset(center, tangentHeadingDeg, yzValue) {
    const yz = normalizeYZPoint(yzValue);
    const lateralMm = yz[0];
    const verticalMm = yz[1];
    const lateralVector = rotateXY(0, lateralMm, tangentHeadingDeg);
    return {
      x: center.x + lateralVector.x,
      y: center.y + lateralVector.y,
      z: center.z + verticalMm
    };
  }

  function transformLocalPointToWorld(localPoint, placementValidation) {
    const rotated = rotateXY(localPoint.x, localPoint.y, placementValidation.rotationDeg);
    return {
      x: placementValidation.positionMm.x + rotated.x,
      y: placementValidation.positionMm.y + rotated.y,
      z: placementValidation.positionMm.z + localPoint.z
    };
  }

  function collectPolyline(points, path, center, tangentHeadingDeg, worldPlacement, output, missing, required) {
    if (!Array.isArray(points) || points.length === 0) {
      if (required) missing.push(path);
      return;
    }
    let validCount = 0;
    points.forEach((point, pointIndex) => {
      if (!validPoint2(point)) {
        missing.push(`${path}[${pointIndex}]`);
        return;
      }
      validCount += 1;
      output.push(transformLocalPointToWorld(
        pointFromStationOffset(center, tangentHeadingDeg, point),
        worldPlacement
      ));
    });
    if (required && validCount === 0 && !missing.includes(path)) missing.push(path);
  }

  function collectWallObject(wall, path, center, tangentHeadingDeg, worldPlacement, output, missing, required) {
    if (!wall || typeof wall !== 'object') {
      if (required) missing.push(path);
      return;
    }
    const candidates = [];
    if (validPoint2(wall.lowerEdgeMm)) candidates.push(wall.lowerEdgeMm);
    else if (wall.lowerEdgeMm != null) missing.push(`${path}.lowerEdgeMm`);
    if (validPoint2(wall.upperEdgeMm)) candidates.push(wall.upperEdgeMm);
    else if (wall.upperEdgeMm != null) missing.push(`${path}.upperEdgeMm`);
    if (Array.isArray(wall.polylineYZMm)) {
      wall.polylineYZMm.forEach((point, pointIndex) => {
        if (validPoint2(point)) candidates.push(point);
        else missing.push(`${path}.polylineYZMm[${pointIndex}]`);
      });
    }
    if (required && candidates.length === 0) {
      missing.push(path);
      return;
    }
    candidates.forEach(point => {
      output.push(transformLocalPointToWorld(
        pointFromStationOffset(center, tangentHeadingDeg, point),
        worldPlacement
      ));
    });
  }

  function transformStationGeometry(station, placement, options = {}, stationIndex = 0) {
    const placementValidation = validatePlacement(placement);
    const missing = placementValidation.missing.map(item => `placement.${item}`);
    const points = [];
    const stationId = station?.id == null ? String(stationIndex) : String(station.id);
    const prefix = `stations[${stationId}]`;

    const center = {
      x: finiteNumber(station?.centerlinePositionMm?.x),
      y: finiteNumber(station?.centerlinePositionMm?.y),
      z: finiteNumber(station?.centerlinePositionMm?.z)
    };
    const tangentHeadingDeg = normalizeAngleDeg(station?.tangentHeadingDeg);
    if (center.x == null) missing.push(`${prefix}.centerlinePositionMm.x`);
    if (center.y == null) missing.push(`${prefix}.centerlinePositionMm.y`);
    if (center.z == null) missing.push(`${prefix}.centerlinePositionMm.z`);
    if (tangentHeadingDeg == null) missing.push(`${prefix}.tangentHeadingDeg`);

    if (!placementValidation.ready || Object.values(center).some(value => value == null) || tangentHeadingDeg == null) {
      return { stationId, ready: false, points, missing: [...new Set(missing)] };
    }

    // The measurement protocol stores each station cross-section as Y/Z offsets
    // from centerlinePositionMm in the station frame. tangentHeadingDeg rotates
    // that station frame inside part-local XY before the part pose is applied.
    points.push(transformLocalPointToWorld(center, placementValidation));

    collectPolyline(
      station?.runningSurfacePolylineYZMm,
      `${prefix}.runningSurfacePolylineYZMm`,
      center,
      tangentHeadingDeg,
      placementValidation,
      points,
      missing,
      options.requireRunningSurface !== false
    );
    collectPolyline(
      station?.undersidePolylineYZMm,
      `${prefix}.undersidePolylineYZMm`,
      center,
      tangentHeadingDeg,
      placementValidation,
      points,
      missing,
      options.requireUnderside !== false
    );

    const requiredWallKeys = Array.isArray(options.requiredWallKeys)
      ? [...new Set(options.requiredWallKeys.map(String))]
      : [];
    const polylineWalls = station?.sideWallPolylinesYZMm || {};
    const objectWalls = station?.walls || {};
    const wallKeys = new Set([
      ...Object.keys(polylineWalls),
      ...Object.keys(objectWalls),
      ...requiredWallKeys
    ]);
    wallKeys.forEach(key => {
      const required = requiredWallKeys.includes(key);
      if (polylineWalls[key] != null || (!objectWalls[key] && required)) {
        collectPolyline(
          polylineWalls[key],
          `${prefix}.sideWallPolylinesYZMm.${key}`,
          center,
          tangentHeadingDeg,
          placementValidation,
          points,
          missing,
          required
        );
      }
      if (objectWalls[key] != null) {
        collectWallObject(
          objectWalls[key],
          `${prefix}.walls.${key}`,
          center,
          tangentHeadingDeg,
          placementValidation,
          points,
          missing,
          required
        );
      }
    });

    return {
      stationId,
      ready: missing.length === 0,
      points,
      missing: [...new Set(missing)]
    };
  }

  function boundsForPoints(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      minZ: Math.min(bounds.minZ, point.z),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      maxZ: Math.max(bounds.maxZ, point.z)
    }), {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity
    });
  }

  function buildWorldAabb(placement, options = {}) {
    const validation = validatePlacement(placement);
    const missing = validation.missing.map(item => `placement.${item}`);
    const profile = placement?.profile;
    if (!profile || typeof profile !== 'object') missing.push('profile');
    const profileStatus = profile?.status == null ? null : String(profile.status);
    if (profile && profileStatus !== 'verified' && profileStatus !== 'provisional') missing.push('profile.status(collision-ready verified/provisional required)');
    if (profile && profile.coordinateFrame !== 'part-local-xyz') {
      missing.push('profile.coordinateFrame(part-local-xyz required)');
    }
    const stations = Array.isArray(profile?.stations) ? profile.stations : null;
    if (!stations || stations.length === 0) missing.push('profile.stations');

    const points = [];
    if (stations && validation.ready) {
      stations.forEach((station, stationIndex) => {
        const transformed = transformStationGeometry(station, placement, options, stationIndex);
        points.push(...transformed.points);
        missing.push(...transformed.missing);
      });
    }

    const uniqueMissing = [...new Set(missing)];
    const knownAabb = boundsForPoints(points);
    return {
      status: uniqueMissing.length === 0 && knownAabb ? 'ready' : 'indeterminate',
      partId: validation.partId,
      profileRef: validation.profileRef,
      aabb: uniqueMissing.length === 0 ? knownAabb : null,
      knownAabb,
      missing: uniqueMissing
    };
  }

  function nonNegativeFinite(value, fallback = 0) {
    const number = finiteNumber(value);
    return number == null ? fallback : Math.max(0, number);
  }

  function expandedAabb(aabb, distanceMm) {
    const distance = nonNegativeFinite(distanceMm, 0);
    return {
      minX: aabb.minX - distance,
      minY: aabb.minY - distance,
      minZ: aabb.minZ - distance,
      maxX: aabb.maxX + distance,
      maxY: aabb.maxY + distance,
      maxZ: aabb.maxZ + distance
    };
  }

  function separatingAxis(aabbA, aabbB, options = {}) {
    const physicalToleranceMm = nonNegativeFinite(options.physicalToleranceMm, 0);
    const numericEpsilonMm = nonNegativeFinite(options.numericEpsilonMm, DEFAULT_NUMERIC_EPSILON_MM);
    const margin = physicalToleranceMm + numericEpsilonMm;
    if (aabbA.maxX < aabbB.minX - margin || aabbB.maxX < aabbA.minX - margin) return 'x';
    if (aabbA.maxY < aabbB.minY - margin || aabbB.maxY < aabbA.minY - margin) return 'y';
    if (aabbA.maxZ < aabbB.minZ - margin || aabbB.maxZ < aabbA.minZ - margin) return 'z';
    return null;
  }

  function intersectionAabb(aabbA, aabbB, expandMm = 0) {
    const a = expandedAabb(aabbA, expandMm);
    const b = expandedAabb(aabbB, expandMm);
    const result = {
      minX: Math.max(a.minX, b.minX),
      minY: Math.max(a.minY, b.minY),
      minZ: Math.max(a.minZ, b.minZ),
      maxX: Math.min(a.maxX, b.maxX),
      maxY: Math.min(a.maxY, b.maxY),
      maxZ: Math.min(a.maxZ, b.maxZ)
    };
    if (result.minX > result.maxX || result.minY > result.maxY || result.minZ > result.maxZ) return null;
    return result;
  }

  function orderedPair(partA, partB) {
    const left = placementIdentity(partA);
    const right = placementIdentity(partB);
    return left.partId.localeCompare(right.partId) <= 0
      ? [partA, partB]
      : [partB, partA];
  }

  function samePair(connection, partAId, partBId) {
    const a = connection?.partAId == null ? '' : String(connection.partAId);
    const b = connection?.partBId == null ? '' : String(connection.partBId);
    return (a === partAId && b === partBId) || (a === partBId && b === partAId);
  }

  function normalContactState(connections, partAId, partBId) {
    const connection = (Array.isArray(connections) ? connections : []).find(item => samePair(item, partAId, partBId));
    if (!connection) return { formalConnection: false, exclusionStatus: 'not-connected', confirmedCoverage: false };
    const exclusion = connection.normalContactExclusion;
    const status = exclusion?.status == null ? 'unknown' : String(exclusion.status);
    const known = status === 'verified' || status === 'provisional';
    const confirmedCoverage = known && exclusion?.broadPhaseCoverage === 'confirmed';
    return {
      formalConnection: true,
      connectorAId: connection.connectorAId == null ? null : String(connection.connectorAId),
      connectorBId: connection.connectorBId == null ? null : String(connection.connectorBId),
      exclusionStatus: status,
      confirmedCoverage
    };
  }

  function classifyPair(partAValue, partBValue, options = {}) {
    const [partA, partB] = orderedPair(partAValue, partBValue);
    const idA = placementIdentity(partA).partId;
    const idB = placementIdentity(partB).partId;
    if (!idA || !idB || idA === idB) return null;

    const aabbA = buildWorldAabb(partA, options);
    const aabbB = buildWorldAabb(partB, options);
    const resultBase = {
      partAId: idA,
      partBId: idB,
      profileRefA: aabbA.profileRef,
      profileRefB: aabbB.profileRef,
      worldAabbA: aabbA.aabb,
      worldAabbB: aabbB.aabb,
      knownWorldAabbA: aabbA.knownAabb,
      knownWorldAabbB: aabbB.knownAabb,
      candidateRangeMm: null,
      normalContact: normalContactState(options.connections, idA, idB),
      missing: []
    };

    if (aabbA.status !== 'ready' || aabbB.status !== 'ready') {
      return {
        ...resultBase,
        status: 'indeterminate',
        reasonCode: 'profile-or-placement-incomplete',
        missing: [
          ...aabbA.missing.map(path => ({ partId: idA, path })),
          ...aabbB.missing.map(path => ({ partId: idB, path }))
        ]
      };
    }

    const axis = separatingAxis(aabbA.aabb, aabbB.aabb, options);
    if (axis) {
      return {
        ...resultBase,
        status: 'clear',
        reasonCode: `aabb-separated-${axis}`
      };
    }

    const physicalToleranceMm = nonNegativeFinite(options.physicalToleranceMm, 0);
    const candidateRangeMm = intersectionAabb(aabbA.aabb, aabbB.aabb, physicalToleranceMm / 2);
    if (resultBase.normalContact.confirmedCoverage) {
      return {
        ...resultBase,
        status: 'excluded-normal-contact',
        reasonCode: 'confirmed-normal-contact-exclusion',
        candidateRangeMm
      };
    }

    return {
      ...resultBase,
      status: 'candidate',
      reasonCode: resultBase.normalContact.formalConnection
        ? 'aabb-overlap-normal-contact-not-confirmed'
        : 'aabb-overlap',
      candidateRangeMm
    };
  }

  function comparePlacements(left, right) {
    return placementIdentity(left).partId.localeCompare(placementIdentity(right).partId);
  }

  function analyzeBroadPhase(placements, options = {}) {
    const sorted = (Array.isArray(placements) ? [...placements] : []).sort(comparePlacements);
    const diagnostics = [];
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const result = classifyPair(sorted[i], sorted[j], options);
        if (result) diagnostics.push(result);
      }
    }
    return diagnostics;
  }

  function extractBroadPhaseCandidates(placements, options = {}) {
    return analyzeBroadPhase(placements, options)
      .filter(result => result.status === 'candidate' || result.status === 'indeterminate');
  }

  const api = Object.freeze({
    DEFAULT_NUMERIC_EPSILON_MM,
    normalizeAngleDeg,
    validatePlacement,
    transformStationGeometry,
    boundsForPoints,
    buildWorldAabb,
    separatingAxis,
    intersectionAabb,
    classifyPair,
    analyzeBroadPhase,
    extractBroadPhaseCandidates
  });

  return api;
});
