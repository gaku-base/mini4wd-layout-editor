(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.M4WD_LAYOUT_PERSISTENCE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'mini4wd-course-layout-mouse-flow-v1.0.0-RC1';
  const PERSISTED_FIELDS = [
    'app', 'version', 'field', 'parts', 'start', 'startPhase',
    'selectedType', 'rotation', 'activeConnection'
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

  function toPersistentLayout(layout) {
    if (!isRecord(layout)) throw new Error('レイアウトデータが不正です');
    const persistent = {};
    PERSISTED_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(layout, field)) persistent[field] = cloneJson(layout[field]);
    });
    return persistent;
  }

  function validateLayout(layout, options) {
    if (!isRecord(layout)) return false;
    if (layout.app !== options.app || layout.version !== options.version) return false;
    if (!isRecord(layout.field)) return false;
    if (!isFiniteNumber(layout.field.widthCm) || layout.field.widthCm <= 0) return false;
    if (!isFiniteNumber(layout.field.heightCm) || layout.field.heightCm <= 0) return false;
    if (!isFiniteNumber(layout.field.gridCm) || layout.field.gridCm <= 0) return false;
    if (!Array.isArray(layout.parts) || !isRotation(layout.rotation)) return false;

    const knownTypes = new Set(options.partTypes || []);
    const knownColors = new Set(options.colorKeys || []);
    const ids = new Set();
    for (const part of layout.parts) {
      if (!isRecord(part) || typeof part.id !== 'string' || !part.id || ids.has(part.id)) return false;
      if (!knownTypes.has(part.type) || !isFiniteNumber(part.x) || !isFiniteNumber(part.y)) return false;
      if (!isRotation(part.rotation) || !knownColors.has(part.colorKey || 'default')) return false;
      ids.add(part.id);
    }

    if (layout.start !== null) {
      if (!isRecord(layout.start)) return false;
      if (!isFiniteNumber(layout.start.x) || !isFiniteNumber(layout.start.y) || !isRotation(layout.start.rotation)) return false;
    }

    if (typeof layout.selectedType !== 'string' || (!knownTypes.has(layout.selectedType) && layout.selectedType !== 'start')) return false;
    if (layout.activeConnection !== null) {
      const connection = layout.activeConnection;
      if (!isRecord(connection)) return false;
      if (!isFiniteNumber(connection.x) || !isFiniteNumber(connection.y) || !isRotation(connection.heading)) return false;
      if (typeof connection.sourceId !== 'string' || !connection.sourceId) return false;
    }
    return true;
  }

  function createLayoutStore(storage, options) {
    let ready = false;

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
        const layout = JSON.parse(raw);
        if (!validateLayout(layout, options)) throw new Error('保存レイアウトの形式が不正です');
        ready = true;
        return { status: 'restored', layout };
      } catch (error) {
        try { storage.removeItem(STORAGE_KEY); } catch (_) {}
        ready = true;
        return { status: 'corrupt', error };
      }
    }

    function save(layout) {
      if (!ready) return { status: 'not-ready' };
      try {
        const persistent = toPersistentLayout(layout);
        if (!validateLayout(persistent, options)) throw new Error('保存するレイアウトの形式が不正です');
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
      isReady: () => ready
    };
  }

  return {
    STORAGE_KEY,
    PERSISTED_FIELDS,
    createLayoutStore,
    toPersistentLayout,
    validateLayout
  };
});
