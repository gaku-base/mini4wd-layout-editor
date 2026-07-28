(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_CORNER_DIRECTION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_DIRECTION = 'right';

  function normalizeAngle(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function connectorsForDefinition(definition) {
    return Array.isArray(definition?.geometry?.connectors) ? definition.geometry.connectors : [];
  }

  function directionsForDefinition(definition) {
    const connectors = connectorsForDefinition(definition);
    const declared = definition?.turnDirections;
    if (!declared || !connectors.length) return [];
    if (Array.isArray(declared)) return declared.map(String).filter(Boolean);
    // Legacy layouts used a direction-to-connector map.  Directions are now
    // semantic values and must never be used as connector identifiers.
    return Object.keys(declared).map(String).filter(Boolean);
  }

  function defaultDirection(definition) {
    const directions = directionsForDefinition(definition);
    const preferred = String(definition?.defaultTurnDirection || '');
    if (directions.includes(preferred)) return preferred;
    return directions.includes(DEFAULT_DIRECTION) ? DEFAULT_DIRECTION : (directions[0] || null);
  }

  function normalizeDirection(definition, direction) {
    const directions = directionsForDefinition(definition);
    const candidate = String(direction || '');
    return directions.includes(candidate) ? candidate : defaultDirection(definition);
  }

  function defaultEntryIndexForDirection(definition, direction) {
    const connectors = connectorsForDefinition(definition);
    const directions = directionsForDefinition(definition);
    if (connectors.length < 2) return 0;
    return directions.indexOf(normalizeDirection(definition, direction)) === 1 ? 1 : 0;
  }

  function entryConnectorId(definition, entryIndex) {
    return String(connectorsForDefinition(definition)[Number(entryIndex) || 0]?.id || '');
  }

  function entryIndexForConnectorId(definition, connectorId) {
    return Math.max(0, connectorsForDefinition(definition)
      .findIndex(connector => String(connector.id) === String(connectorId)));
  }

  function normalizedEntryIndex(definition, entryIndex) {
    const connectors = connectorsForDefinition(definition);
    if (!connectors.length) return 0;
    const index = Math.trunc(Number(entryIndex));
    return Number.isInteger(index) && index >= 0 && index < connectors.length ? index : 0;
  }

  function exitIndexForEntry(definition, entryIndex) {
    const connectors = connectorsForDefinition(definition);
    if (connectors.length < 2) return 0;
    return Number(entryIndex) === 0 ? 1 : 0;
  }

  function mirrorForDirectionAndEntry(definition, direction, entryIndex) {
    const handedness = normalizeDirection(definition, direction);
    const index = normalizedEntryIndex(definition, entryIndex);
    return [false, true].find(cornerMirror => (
      handednessForEntryAndMirror(definition, index, cornerMirror) === handedness
    )) ?? false;
  }

  // The mirror is a rendering/geometry transform, not a direction setting.
  // Keeping this inverse mapping here makes the semantic direction verifiable
  // from a stored entry connector and transform without changing it.
  function handednessForEntryAndMirror(definition, entryIndex, cornerMirror) {
    const directions = directionsForDefinition(definition);
    if (directions.length < 2) return defaultDirection(definition);
    const index = normalizedEntryIndex(definition, entryIndex);
    const directionIndex = cornerMirror ? exitIndexForEntry(definition, index) : index;
    return normalizeDirection(definition, directions[directionIndex]);
  }

  function mirroredHeading(heading, mirrored) {
    return normalizeAngle(mirrored ? -Number(heading) : Number(heading));
  }

  // Calculate the entry tangent from the actual transformed connector.  This
  // deliberately takes the mirror as an input: an A/B connector ID identifies
  // only the end being connected, never a pre-baked corner pose.
  function rotationForEntryAndMirror(definition, targetHeading, entryIndex, cornerMirror) {
    const index = normalizedEntryIndex(definition, entryIndex);
    const connector = connectorsForDefinition(definition)[index];
    const localHeading = mirroredHeading(
      Number(connector?.directionDeg ?? connector?.heading),
      Boolean(cornerMirror)
    );
    return normalizeAngle(Number(targetHeading) + 180 - (Number.isFinite(localHeading) ? localHeading : 180));
  }

  function rotationForConnection(definition, targetHeading, direction, entryIndex = defaultEntryIndexForDirection(definition, direction)) {
    return poseForConnection(definition, targetHeading, direction, entryIndex).candidateRotation;
  }

  function poseForConnection(definition, targetHeading, direction, entryIndex = defaultEntryIndexForDirection(definition, direction)) {
    const handedness = normalizeDirection(definition, direction);
    const index = normalizedEntryIndex(definition, entryIndex);
    const targetTangent = normalizeAngle(targetHeading);
    // Evaluate the physical transforms independently for this entry and this
    // target tangent.  The transform whose resulting course turn matches the
    // read-only user selection is the only valid pose.  In particular, do not
    // map entry A/B directly to a fixed rotation or mirror value.
    const candidates = [false, true].map(cornerMirror => {
      const candidateRotation = rotationForEntryAndMirror(definition, targetTangent, index, cornerMirror);
      const entryTangent = normalizeAngle(
        mirroredHeading(
          Number(connectorsForDefinition(definition)[index]?.directionDeg ?? connectorsForDefinition(definition)[index]?.heading),
          cornerMirror
        ) + candidateRotation
      );
      return {
        cornerMirror,
        candidateRotation,
        entryTangent,
        handedness: handednessForEntryAndMirror(definition, index, cornerMirror)
      };
    });
    const selected = candidates.find(candidate => candidate.handedness === handedness)
      || candidates[0];
    return {
      handedness,
      entryIndex: index,
      entryConnectorId: entryConnectorId(definition, index),
      targetTangent,
      entryTangent: selected.entryTangent,
      cornerMirror: selected.cornerMirror,
      candidateRotation: selected.candidateRotation,
      rotation: selected.candidateRotation
    };
  }

  function rotationDeltaForDirectionChange(definition, fromDirection, toDirection) {
    return normalizeAngle(
      rotationForConnection(definition, 0, toDirection)
      - rotationForConnection(definition, 0, fromDirection)
    );
  }

  return Object.freeze({
    DEFAULT_DIRECTION,
    directionsForDefinition,
    defaultDirection,
    normalizeDirection,
    defaultEntryIndexForDirection,
    entryConnectorId,
    entryIndexForConnectorId,
    normalizedEntryIndex,
    exitIndexForEntry,
    mirrorForDirectionAndEntry,
    handednessForEntryAndMirror,
    mirroredHeading,
    rotationForEntryAndMirror,
    rotationForConnection,
    poseForConnection,
    rotationDeltaForDirectionChange
  });
});
