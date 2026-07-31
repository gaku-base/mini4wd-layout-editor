(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_LAYOUT_PERSISTENCE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // RC1 and RC2 intentionally share this key so a saved RC1 layout can be
  // migrated in place only after a successful RC2 save.
  const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
  const CURRENT_VERSION = '1.1.0-RC2';
  const SUPPORTED_LEGACY_VERSIONS = Object.freeze(['1.0.0-RC1']);
  const PERSISTED_FIELDS = [
    'app', 'version', 'field', 'parts', 'start', 'startPhase',
    'selectedType', 'rotation', 'activeConnection', 'connections', 'siteBoundary', 'roomCutouts', 'obstacles'
  ];

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function isRotation(value) {
    return isFiniteNumber(value) && value >= 0 && value < 360 && value % 45 === 0;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseVersion(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+)(\d+))?$/.exec(value);
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      label: match[4] || '',
      revision: Number(match[5] || 0)
    };
  }

  function compareVersions(left, right) {
    const leftVersion = parseVersion(left);
    const rightVersion = parseVersion(right);
    if (!leftVersion || !rightVersion) return null;
    for (const field of ['major', 'minor', 'patch']) {
      if (leftVersion[field] !== rightVersion[field]) {
        return leftVersion[field] < rightVersion[field] ? -1 : 1;
      }
    }
    if (leftVersion.label !== rightVersion.label) {
      if (!leftVersion.label) return 1;
      if (!rightVersion.label) return -1;
      return leftVersion.label < rightVersion.label ? -1 : 1;
    }
    if (leftVersion.revision === rightVersion.revision) return 0;
    return leftVersion.revision < rightVersion.revision ? -1 : 1;
  }

  function versionOptions(options) {
    return {
      current: options.version || CURRENT_VERSION,
      supportedLegacy: options.supportedLegacyVersions || SUPPORTED_LEGACY_VERSIONS
    };
  }

  function classifyLayoutVersion(version, options = {}) {
    const versions = versionOptions(options);
    if (version === versions.current) return 'current';
    if (versions.supportedLegacy.includes(version)) return 'supportedLegacy';
    const comparison = compareVersions(version, versions.current);
    if (comparison === null) return 'corrupt';
    return comparison > 0 ? 'unsupportedFuture' : 'unsupportedVersion';
  }

  function toPersistentLayout(layout) {
    if (!isRecord(layout)) throw new Error('レイアウトデータが不正です');
    const persistent = {};
    PERSISTED_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(layout, field)) persistent[field] = cloneJson(layout[field]);
    });
    return persistent;
  }

  function validateLayoutStructure(layout, options, versionStatus) {
    if (!isRecord(layout)) return false;
    if (layout.app !== options.app || typeof layout.version !== 'string') return false;
    if (!isRecord(layout.field)) return false;
    if (!isFiniteNumber(layout.field.widthCm) || layout.field.widthCm <= 0) return false;
    if (!isFiniteNumber(layout.field.heightCm) || layout.field.heightCm <= 0) return false;
    if (!isFiniteNumber(layout.field.gridCm) || layout.field.gridCm <= 0) return false;
    const hasOriginX = Object.prototype.hasOwnProperty.call(layout.field, 'originX');
    const hasOriginY = Object.prototype.hasOwnProperty.call(layout.field, 'originY');
    if (versionStatus === 'current' && (!hasOriginX || !hasOriginY)) return false;
    if ((hasOriginX && !isFiniteNumber(layout.field.originX)) || (hasOriginY && !isFiniteNumber(layout.field.originY))) return false;
    if (!Array.isArray(layout.parts) || !isRotation(layout.rotation)) return false;
    if (Object.prototype.hasOwnProperty.call(layout, 'siteBoundary')) {
      const boundary = layout.siteBoundary;
      if (!isRecord(boundary) || boundary.shape !== 'rectangle' || typeof boundary.name !== 'string'
        || !isFiniteNumber(boundary.x) || !isFiniteNumber(boundary.y) || !isFiniteNumber(boundary.width) || !isFiniteNumber(boundary.height)
        || boundary.width <= 0 || boundary.height <= 0 || typeof boundary.visible !== 'boolean') return false;
    }
    if (Object.prototype.hasOwnProperty.call(layout, 'roomCutouts')) {
      if (!Array.isArray(layout.roomCutouts)) return false;
      const cutoutIds = new Set();
      for (const cutout of layout.roomCutouts) {
        if (!isRecord(cutout) || typeof cutout.id !== 'string' || !cutout.id || cutoutIds.has(cutout.id)
          || typeof cutout.name !== 'string' || cutout.type !== 'room-cutout' || cutout.shape !== 'rectangle'
          || !isFiniteNumber(cutout.x) || !isFiniteNumber(cutout.y) || !isFiniteNumber(cutout.width) || !isFiniteNumber(cutout.height)
          || cutout.width <= 0 || cutout.height <= 0 || ![0, 90, 180, 270].includes(cutout.rotation)
          || typeof cutout.locked !== 'boolean' || typeof cutout.visible !== 'boolean') return false;
        cutoutIds.add(cutout.id);
      }
    }
    if (Object.prototype.hasOwnProperty.call(layout, 'obstacles')) {
      if (!Array.isArray(layout.obstacles)) return false;
      const obstacleIds = new Set();
      for (const obstacle of layout.obstacles) {
        if (!isRecord(obstacle) || typeof obstacle.id !== 'string' || !obstacle.id || obstacleIds.has(obstacle.id)
          || typeof obstacle.name !== 'string' || obstacle.type !== 'obstacle' || obstacle.shape !== 'rectangle'
          || !isFiniteNumber(obstacle.x) || !isFiniteNumber(obstacle.y) || !isFiniteNumber(obstacle.width) || !isFiniteNumber(obstacle.depth)
          || obstacle.width <= 0 || obstacle.depth <= 0 || ![0, 90, 180, 270].includes(obstacle.rotation)
          || typeof obstacle.locked !== 'boolean' || typeof obstacle.visible !== 'boolean') return false;
        obstacleIds.add(obstacle.id);
      }
    }

    const knownTypes = new Set(options.partTypes || []);
    const knownColors = new Set(options.colorKeys || []);
    const ids = new Set();
    for (const part of layout.parts) {
      if (!isRecord(part) || typeof part.id !== 'string' || !part.id || ids.has(part.id)) return false;
      if (!knownTypes.has(part.type) || !isFiniteNumber(part.x) || !isFiniteNumber(part.y)) return false;
      if (!isRotation(part.rotation) || !knownColors.has(part.colorKey || 'default')) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'zMm') && !isFiniteNumber(part.zMm)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'zOrder') && !isFiniteNumber(part.zOrder)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'pitchDeg') && !isFiniteNumber(part.pitchDeg)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'bankAngleDeg') && !isFiniteNumber(part.bankAngleDeg)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'selectedHandedness') && !['right', 'left'].includes(part.selectedHandedness)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'appliedHandedness') && !['right', 'left'].includes(part.appliedHandedness)) return false;
      if (Object.prototype.hasOwnProperty.call(part, 'entryConnectorId')) {
        const allowedConnectors = options.connectorIdsByType?.[part.type];
        if (typeof part.entryConnectorId !== 'string' || (Array.isArray(allowedConnectors) && !allowedConnectors.includes(part.entryConnectorId))) return false;
      }
      ids.add(part.id);
    }

    if (layout.start !== null) {
      if (!isRecord(layout.start)) return false;
      if (!isFiniteNumber(layout.start.x) || !isFiniteNumber(layout.start.y) || !isRotation(layout.start.rotation)) return false;
      if (Object.prototype.hasOwnProperty.call(layout.start, 'zMm') && !isFiniteNumber(layout.start.zMm)) return false;
      if (Object.prototype.hasOwnProperty.call(layout.start, 'zOrder') && !isFiniteNumber(layout.start.zOrder)) return false;
    }

    if (typeof layout.selectedType !== 'string' || (!knownTypes.has(layout.selectedType) && layout.selectedType !== 'start')) return false;
    if (layout.activeConnection !== null) {
      const connection = layout.activeConnection;
      if (!isRecord(connection)) return false;
      if (!isFiniteNumber(connection.x) || !isFiniteNumber(connection.y) || !isRotation(connection.heading)) return false;
      if (typeof connection.sourceId !== 'string' || !connection.sourceId) return false;
    }
    if (Object.prototype.hasOwnProperty.call(layout, 'connections')) {
      if (!Array.isArray(layout.connections)) return false;
      const edgeKeys = new Set();
      const knownPartIds = new Set([...ids, ...(layout.start ? ['start'] : [])]);
      const partTypesById = new Map(layout.parts.map(part => [part.id, part.type]));
      if (layout.start) partTypesById.set('start', 'start');
      for (const edge of layout.connections) {
        if (!isRecord(edge)) return false;
        const values = [edge.partAId, edge.connectorAId, edge.partBId, edge.connectorBId];
        if (values.some(value => typeof value !== 'string' || !value)) return false;
        if (!knownPartIds.has(edge.partAId) || !knownPartIds.has(edge.partBId) || edge.partAId === edge.partBId) return false;
        const allowedA = options.connectorIdsByType?.[partTypesById.get(edge.partAId)];
        const allowedB = options.connectorIdsByType?.[partTypesById.get(edge.partBId)];
        if (Array.isArray(allowedA) && !allowedA.includes(edge.connectorAId)) return false;
        if (Array.isArray(allowedB) && !allowedB.includes(edge.connectorBId)) return false;
        const left = `${edge.partAId}:${edge.connectorAId}`;
        const right = `${edge.partBId}:${edge.connectorBId}`;
        const key = left < right ? `${left}|${right}` : `${right}|${left}`;
        if (edgeKeys.has(key)) return false;
        edgeKeys.add(key);
      }
    }
    return true;
  }

  function validateLayout(layout, options) {
    const versionStatus = classifyLayoutVersion(layout?.version, options);
    if (versionStatus !== 'current' && versionStatus !== 'supportedLegacy') return false;
    return validateLayoutStructure(layout, options, versionStatus);
  }

  function migrateSupportedLegacyLayout(layout, versionStatus) {
    const migrated = cloneJson(layout);
    if (versionStatus === 'supportedLegacy') {
      migrated.field = {
        ...migrated.field,
        originX: isFiniteNumber(migrated.field.originX) ? migrated.field.originX : 0,
        originY: isFiniteNumber(migrated.field.originY) ? migrated.field.originY : 0
      };
    }
    return migrated;
  }

  function hasUnsupportedVersionEnvelope(layout, options) {
    if (!isRecord(layout) || layout.app !== options.app || !isRecord(layout.field) || !Array.isArray(layout.parts)) return false;
    return isFiniteNumber(layout.field.widthCm) && layout.field.widthCm > 0
      && isFiniteNumber(layout.field.heightCm) && layout.field.heightCm > 0
      && isFiniteNumber(layout.field.gridCm) && layout.field.gridCm > 0;
  }

  function createLayoutStore(storage, options) {
    let ready = false;
    let writeBlocked = false;

    function restore() {
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (error) {
        ready = true;
        return { status: 'unavailable', error };
      }

      if (raw === null) {
        ready = true;
        return { status: 'empty' };
      }

      try {
        const parsedLayout = JSON.parse(raw);
        const layout = typeof options.migrateLayout === 'function' ? options.migrateLayout(parsedLayout) : parsedLayout;
        const versionStatus = classifyLayoutVersion(layout?.version, options);
        if (versionStatus === 'unsupportedFuture' || versionStatus === 'unsupportedVersion') {
          if (!hasUnsupportedVersionEnvelope(layout, options)) throw new Error('Unsupported layout has an invalid envelope.');
          ready = true;
          writeBlocked = true;
          return { status: 'unsupported-version', versionStatus, version: layout.version };
        }
        if (versionStatus === 'corrupt' || !validateLayoutStructure(layout, options, versionStatus)) {
          throw new Error('保存レイアウトの形式が不正です');
        }
        ready = true;
        return {
          status: 'restored',
          versionStatus,
          layout: migrateSupportedLegacyLayout(layout, versionStatus)
        };
      } catch (error) {
        try { storage.removeItem(STORAGE_KEY); } catch (_) {}
        ready = true;
        return { status: 'corrupt', error };
      }
    }

    function save(layout) {
      if (!ready) return { status: 'not-ready' };
      if (writeBlocked) return { status: 'blocked-unsupported-version' };
      try {
        const persistent = toPersistentLayout(layout);
        const versionStatus = classifyLayoutVersion(persistent.version, options);
        if (versionStatus !== 'current' || !validateLayoutStructure(persistent, options, versionStatus)) {
          throw new Error('保存するレイアウトの形式が不正です');
        }
        const serialized = JSON.stringify(persistent);
        storage.setItem(STORAGE_KEY, serialized);
        return { status: 'saved', serialized };
      } catch (error) {
        return { status: 'failed', error };
      }
    }

    return {
      key: STORAGE_KEY,
      restore,
      save,
      isReady: () => ready,
      isWriteBlocked: () => writeBlocked
    };
  }

  return {
    STORAGE_KEY,
    CURRENT_VERSION,
    SUPPORTED_LEGACY_VERSIONS,
    PERSISTED_FIELDS,
    classifyLayoutVersion,
    createLayoutStore,
    migrateSupportedLegacyLayout,
    toPersistentLayout,
    validateLayout,
    validateLayoutStructure
  };
});
