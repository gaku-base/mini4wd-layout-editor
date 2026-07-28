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
    if (!declared || typeof declared !== 'object') return [];
    return Object.entries(declared)
      .filter(([, connectorId]) => connectors.some(connector => String(connector.id) === String(connectorId)))
      .map(([direction]) => String(direction));
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

  function routeIndexForDirection(definition, direction) {
    const normalized = normalizeDirection(definition, direction);
    if (!normalized) return 0;
    const connectorId = definition.turnDirections[normalized];
    const index = connectorsForDefinition(definition).findIndex(connector => String(connector.id) === String(connectorId));
    return index >= 0 ? index : 0;
  }

  function directionForRouteIndex(definition, routeIndex) {
    const connector = connectorsForDefinition(definition)[Number(routeIndex) || 0];
    if (!connector) return defaultDirection(definition);
    const entry = Object.entries(definition?.turnDirections || {})
      .find(([, connectorId]) => String(connectorId) === String(connector.id));
    return entry ? entry[0] : defaultDirection(definition);
  }

  function rotationForConnection(definition, targetHeading, direction) {
    const connector = connectorsForDefinition(definition)[routeIndexForDirection(definition, direction)];
    const localHeading = Number(connector?.directionDeg ?? connector?.heading);
    return normalizeAngle(Number(targetHeading) + 180 - (Number.isFinite(localHeading) ? localHeading : 180));
  }

  function rotationDeltaForDirectionChange(definition, fromDirection, toDirection) {
    const from = connectorsForDefinition(definition)[routeIndexForDirection(definition, fromDirection)];
    const to = connectorsForDefinition(definition)[routeIndexForDirection(definition, toDirection)];
    const fromHeading = Number(from?.directionDeg ?? from?.heading);
    const toHeading = Number(to?.directionDeg ?? to?.heading);
    return normalizeAngle((Number.isFinite(fromHeading) ? fromHeading : 0) - (Number.isFinite(toHeading) ? toHeading : 0));
  }

  return Object.freeze({
    DEFAULT_DIRECTION,
    directionsForDefinition,
    defaultDirection,
    normalizeDirection,
    routeIndexForDirection,
    directionForRouteIndex,
    rotationForConnection,
    rotationDeltaForDirectionChange
  });
});
