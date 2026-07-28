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

  function exitIndexForEntry(definition, entryIndex) {
    const connectors = connectorsForDefinition(definition);
    if (connectors.length < 2) return 0;
    return Number(entryIndex) === 0 ? 1 : 0;
  }

  function mirrorForDirectionAndEntry(definition, direction, entryIndex) {
    return Number(entryIndex) !== defaultEntryIndexForDirection(definition, direction);
  }

  function mirroredHeading(heading, mirrored) {
    return normalizeAngle(mirrored ? -Number(heading) : Number(heading));
  }

  function rotationForConnection(definition, targetHeading, direction, entryIndex = defaultEntryIndexForDirection(definition, direction)) {
    const connector = connectorsForDefinition(definition)[entryIndex];
    const localHeading = mirroredHeading(
      Number(connector?.directionDeg ?? connector?.heading),
      mirrorForDirectionAndEntry(definition, direction, entryIndex)
    );
    return normalizeAngle(Number(targetHeading) + 180 - (Number.isFinite(localHeading) ? localHeading : 180));
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
    exitIndexForEntry,
    mirrorForDirectionAndEntry,
    mirroredHeading,
    rotationForConnection,
    rotationDeltaForDirectionChange
  });
});
